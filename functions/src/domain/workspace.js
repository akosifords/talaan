// Dependency-free contracts shared by browser adapters and server commands.
export const SCHEMA_VERSION = 2;
export const LIMITS = Object.freeze({ cents: 100_000_000, name: 100, category: 60, history: 500, interval: 365 });
export const KINDS = Object.freeze(['income', 'expense', 'saving']);
export const STATUSES = Object.freeze(['planned', 'completed']);
export const FREQUENCIES = Object.freeze(['daily', 'weekly', 'monthly', 'yearly']);
export const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const validCents = (value, min = 0) => Number.isSafeInteger(value) && value >= min && value <= LIMITS.cents;
export const validMoney = (value, min = 0) => Number.isFinite(value) && value >= 0 && validCents(Math.round(value * 100), min)
  && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
export function toCents(value) {
  if (!validMoney(value)) throw new DomainError('invalid-argument', 'Use a nonnegative amount with at most two decimal places.');
  return Math.round(value * 100);
}
export function validTimezone(value) {
  try { return typeof value === 'string' && value.length <= 64 && Boolean(new Intl.DateTimeFormat('en', { timeZone: value })); } catch { return false; }
}
export class DomainError extends Error {
  constructor(code, message) { super(message); this.name = 'DomainError'; this.code = code; }
}
export function assertLegacyWritable(profile = {}) {
  if (profile.workspaceLock || profile.migration?.status === 'copying' || (profile.schemaVersion ?? 1) !== 1) {
    throw new DomainError('failed-precondition', 'This workspace is read-only while its backend is being upgraded.');
  }
}
export function capabilities(kind, profile = {}) {
  const version = profile.schemaVersion ?? 1;
  return Object.freeze({ kind, schemaVersion: version, planning: kind === 'sample' || (version === 2 && profile.backendEnabled === true),
    write: kind !== 'cloud' || (!profile.workspaceLock && profile.migration?.status !== 'copying' && ((version === 1) || (version === 2 && profile.backendEnabled === true))),
    atomicContributions: kind === 'sample' || version === 2, migration: kind === 'cloud' && profile.migration?.status === 'copying' });
}
export function validateV2Event(event) {
  return Boolean(event && validId(event.id) && event.schemaVersion === 2 && KINDS.includes(event.type)
    && STATUSES.includes(event.status) && validCents(event.amountCents, 1) && validDate(event.localDate)
    && validId(event.categoryId) && typeof event.name === 'string' && event.name.trim() && event.name.length <= LIMITS.name
    && event.currency === 'usd' && Number.isSafeInteger(event.revision) && event.revision >= 1
    && ['goalId', 'subscriptionId', 'recurringRuleId'].every(key => event[key] == null || validId(event[key])));
}
