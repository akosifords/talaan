import { activeLedger } from "../../functions/src/domain/analysis.js";
import { toCents } from '../../functions/src/domain/workspace.js';
import { eventConverter, goalConverter } from './converters.js';
const decode = value => value?.__type === 'timestamp' ? value.value : Array.isArray(value) ? value.map(decode)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child)])) : value;
export function backendState(result, uid) {
  const collections = decode(result.collections);
  const rows = name => (collections[name] || []).filter(row => !row.data.deleted).map(row => ({ ...row.data, id: row.id }));
  const allLedgerRecords = (collections.events || []).map(row => ({ ...row.data, id: row.id }));
  const ledgerRecords = activeLedger(allLedgerRecords, rows('subscriptions'));
  const entries = ledgerRecords.map(record => eventConverter(uid).fromFirestore({ id: record.id, data: () => ({...record,category:rows('categories').find(category=>category.id===record.categoryId)?.name||record.category}) }));
  const goals = rows('goals').map(record => {
    const goal = goalConverter(uid).fromFirestore({ id: record.id, data: () => record });
    return { ...goal, openingDate: record.openingDate, contributions: [...goal.contributions, ...entries.filter(event => event.goalId === goal.id && !event.legacyIncludedInOpening && event.type === 'saving' && event.status === 'completed').map(event => ({ amount: event.amount, date: event.date, eventId: event.id }))] };
  });
  const preferences = rows('preferences').find(row=>row.id==='main');
  return { ...(preferences ? { preferenceRevision: preferences.revision, profile: { name: preferences.name, startPage: preferences.startPage }, settings: { reminders: { enabled: preferences.reminderEnabled, timezone: preferences.timezone, hour: preferences.reminderHour, leadDays: preferences.reminderLeadDays }, guardrails: { enabled: preferences.guardrailEnabled, monthlyLimit: preferences.guardrailCents/100 } } } : {}), entries, goals, ledgerRecords, allLedgerRecords, categories: rows('categories'), budgets: rows('budgets'), scenarios: rows('scenarios'), subscriptions: rows('subscriptions'),
    recurringRules: rows('recurringRules'), goalPlans: rows('goalPlans'), cashCheckpoints: rows('cashCheckpoints'), generation: result.generation,
    baselineRevision: result.baselineRevision ?? result.metadata?.ledgerRevision ?? 0, workspaceRevision: result.workspaceRevision ?? result.metadata?.workspaceRevision ?? 0 };
}
export function eventPayload(event, categories) {
  const categoryId = event.categoryId || categories.find(category => category.name === (event.category || 'Uncategorized'))?.id;
  if (!categoryId) throw new Error('Choose or create a category in Plan before saving.');
  return { name: event.name, type: event.type, amountCents: toCents(event.amount), localDate: event.date, categoryId,
    status: event.status || 'planned', goalId: event.goalId || null, notes: event.notes || '', recurring: event.recurring || null };
}
