import { DomainError, validId, validDate, validCents, validTimezone, KINDS, STATUSES, FREQUENCIES } from './workspace.js';
export const BUSINESS_COLLECTIONS = ['events','goals','categories','budgets','scenarios','subscriptions','recurringRules','goalPlans','cashCheckpoints','adjustments','guardrails','preferences'];
const invalid = message => { throw new DomainError('invalid-argument', message); };
const text = (value, max = 100) => typeof value === 'string' && value.trim() && value.length <= max;
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
export function checkCommand(command) {
  if (!keys(command, ['requestId','generation','type','entityId','expectedRevision','payload']) || !validId(command.requestId)
    || command.requestId.length > 80 || !validId(command.generation) || !validId(command.entityId) || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) invalid('Invalid command envelope.');
  const [collection, action] = command.type?.split('.') || [];
  if (command.type !== `${collection}.${action}` || !BUSINESS_COLLECTIONS.includes(collection) || !['save','remove','adjust'].includes(action)) invalid('Unsupported command.');
  const p = command.payload;
  const fields = {
    events: ['name','type','amountCents','localDate','categoryId','status','goalId','notes','recurring'],
    goals: ['name','targetCents','openingCents','openingDate','contributionCents','contributionDate','archived'],
    categories: ['name','archived'], budgets: ['period','limits'],
    scenarios: ['name','period','incomeCents','expenseCents','savingCents','baselineRevision'],
    subscriptions: ['name','amountCents','categoryId','frequency','startDate','endDate','status','timezone'],
    preferences: ['name','startPage','timezone','reminderEnabled','reminderHour','reminderLeadDays','guardrailEnabled','guardrailCents'],
    goalPlans: ['monthlyCents','targetDate'], cashCheckpoints: ['openingCents','effectiveDate'],
  };
  if (!fields[collection] || !keys(p, action === 'remove' ? [] : action === 'adjust' ? ['adjustmentCents','reason'] : fields[collection])) invalid('Unsupported payload fields.');
  if (action === 'remove') {
    if (!['events','goals','categories','scenarios','subscriptions'].includes(collection)) invalid('This record cannot be removed.');
    return command;
  }
  if (action === 'adjust') {
    if (collection !== 'goals' || !Number.isSafeInteger(p.adjustmentCents) || Math.abs(p.adjustmentCents) > 100_000_000 || !text(p.reason, 1000)) invalid('A bounded adjustment and reason are required.');
    return command;
  }
  if (['events','goals','categories','scenarios','subscriptions'].includes(collection) && !text(p.name, collection === 'categories' ? 60 : 100)) invalid('Check the name.');
  if (collection === 'events') {
    if (!KINDS.includes(p.type) || !STATUSES.includes(p.status) || !validCents(p.amountCents, 1) || !validDate(p.localDate) || !validId(p.categoryId)
      || (p.goalId != null && (!validId(p.goalId) || p.type !== 'saving')) || (p.notes != null && (typeof p.notes !== 'string' || p.notes.length > 1000))) invalid('Check the event fields.');
    if (p.recurring && (!keys(p.recurring,['frequency','interval','endDate']) || !FREQUENCIES.includes(p.recurring.frequency) || !Number.isInteger(p.recurring.interval) || p.recurring.interval < 1 || p.recurring.interval > 365 || (p.recurring.endDate && (!validDate(p.recurring.endDate) || p.recurring.endDate < p.localDate)))) invalid('Invalid recurrence.');
  }
  if (collection === 'goals' && (!validCents(p.targetCents, 1) || (p.openingCents != null && !validCents(p.openingCents)) || (p.openingDate != null && !validDate(p.openingDate)) || (p.contributionCents != null && (!validCents(p.contributionCents) || !validDate(p.contributionDate))) || (p.archived != null && typeof p.archived !== 'boolean'))) invalid('Check the goal fields.');
  if (collection === 'categories' && p.archived != null && typeof p.archived !== 'boolean') invalid('Invalid category status.');
  if (['budgets','scenarios'].includes(collection) && (!/^\d{4}-\d{2}$/.test(p.period) || !validDate(`${p.period}-01`))) invalid('Invalid budget period.');
  if (collection === 'budgets' && (command.entityId !== p.period || !p.limits || Array.isArray(p.limits) || Object.keys(p.limits).length > 100 || Object.entries(p.limits).some(([id, amount]) => !validId(id) || !validCents(amount)))) invalid('Invalid category limits.');
  if (collection === 'scenarios' && (!['incomeCents','expenseCents','savingCents'].every(key => Number.isSafeInteger(p[key]) && Math.abs(p[key]) <= 100_000_000) || !Number.isSafeInteger(p.baselineRevision) || p.baselineRevision < 0)) invalid('Invalid scenario deltas or baseline.');
  if (collection === 'subscriptions' && (!validCents(p.amountCents, 1) || !validId(p.categoryId) || !['monthly','yearly'].includes(p.frequency) || !validDate(p.startDate) || !['active','cancelled'].includes(p.status) || !validTimezone(p.timezone) || (p.status === 'cancelled' && !validDate(p.endDate)) || (p.endDate && (!validDate(p.endDate) || (p.status === 'active' && p.endDate < p.startDate))))) invalid('Invalid subscription.');
  if (collection === 'preferences' && (command.entityId !== 'main' || typeof p.name !== 'string' || p.name.length>60 || !['overview','schedule','goals'].includes(p.startPage) || !validTimezone(p.timezone) || typeof p.reminderEnabled!=='boolean' || !Number.isInteger(p.reminderHour) || p.reminderHour<0 || p.reminderHour>23 || !Number.isInteger(p.reminderLeadDays) || p.reminderLeadDays<0 || p.reminderLeadDays>30 || typeof p.guardrailEnabled!=='boolean' || !validCents(p.guardrailCents))) invalid('Invalid workspace preferences.');
  if (collection === 'goalPlans' && (!validCents(p.monthlyCents) || (p.targetDate && !validDate(p.targetDate)))) invalid('Invalid goal plan.');
  if (collection === 'cashCheckpoints' && (!Number.isSafeInteger(p.openingCents) || Math.abs(p.openingCents) > 100_000_000 || !validDate(p.effectiveDate))) invalid('Invalid opening cash checkpoint.');
  return command;
}
export function assertRevision(record, expected) {
  if ((record?.revision || 0) !== expected) throw new DomainError('aborted', 'This record changed in another session. Your draft is preserved; reload the record and review your changes.');
}
export function requireReference(record, label) {
  if (!record || record.deleted || record.archived) throw new DomainError('failed-precondition', `${label} is missing or archived.`);
  return record;
}
export function eventEffect(event) { return event && !event.deleted && event.type === 'saving' && event.goalId && event.status === 'completed' ? event.amountCents : 0; }
export function applyGoalDelta(goal, delta, dates = []) {
  if (dates.some(date => date < goal.openingDate)) throw new DomainError('failed-precondition', 'This change precedes the goal opening balance. Record a explained balance adjustment instead.');
  const currentCents = goal.currentCents + delta;
  if (!validCents(currentCents)) invalid('The goal balance would become negative or exceed the supported amount.');
  return { ...goal, currentCents, revision: goal.revision + 1 };
}
