import { validDate, DomainError } from './workspace.js';
import { dueOccurrences, occurrenceId } from '../recurrence.js';
export const eventKind = event => event.schemaVersion !== 2 && event.type === 'expense' && event.category === 'Savings' ? 'saving' : event.type;
export const totalLedger = (events, actual = false) => {
  const totals = { income: 0, expense: 0, saving: 0 };
  for (const event of events) if (!event.deleted && (!actual || event.status === 'completed')) totals[eventKind(event)] += event.amountCents;
  return { ...totals, remainder: totals.income - totals.expense - totals.saving };
};
export function activeLedger(events, subscriptions = []) {
  return events.filter(event => {
    if (event.deleted) return false;
    const subscription = subscriptions.find(item => item.id === event.subscriptionId);
    return !subscription || event.status === 'completed' || !(subscription.archived || (subscription.status === 'cancelled' && event.localDate >= (subscription.endDate || subscription.startDate)));
  });
}
export function projectLedger(events, rules, through) {
  if (!validDate(through)) throw new DomainError('invalid-argument', 'Invalid projection date.');
  const ids = new Set(events.map(event => event.id)); // tombstones also suppress regeneration
  const projected = [...events];
  for (const rule of rules.filter(rule => rule.enabled)) {
    const result = dueOccurrences(rule, new Date(`${through}T23:59:59Z`), 10001);
    if (result.occurrences.length > 10000) throw new DomainError('resource-exhausted', 'Recurrence backlog needs processing before a complete forecast can be shown.');
    for (const date of result.occurrences) {
      const id = occurrenceId(rule.id, date);
      if(projected.length>=50000)throw new DomainError('resource-exhausted','The complete projection exceeds 50,000 events. Narrow the recurrence backlog first.');
      if (!ids.has(id)) projected.push({ ...rule.event, schemaVersion: 2, id, localDate: date.toISOString().slice(0, 10), status: 'planned', projected: true });
    }
  }
  return projected;
}
export function cashForecast(events, rules, checkpoint, startDate, days, subscriptions = []) {
  if (!checkpoint || !validDate(checkpoint.effectiveDate) || !validDate(startDate) || checkpoint.effectiveDate > startDate) throw new DomainError('failed-precondition', 'Set operating cash at or before the forecast start date.');
  if (![30,60,90].includes(days)) throw new DomainError('invalid-argument', 'Choose 30, 60, or 90 days.');
  const end = new Date(`${startDate}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + days - 1);
  const rows = activeLedger(projectLedger(events, rules, end.toISOString().slice(0, 10)), subscriptions).filter(event => event.localDate >= checkpoint.effectiveDate);
  const change = event => (eventKind(event) === 'income' ? 1 : -1) * event.amountCents;
  let balance = checkpoint.openingCents + rows.filter(event => event.localDate < startDate).reduce((sum, event) => sum + change(event), 0);
  const timeline = Array.from({ length: days }, (_, i) => {
    const date = new Date(`${startDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    const items = rows.filter(event => event.localDate === key); balance += items.reduce((sum, event) => sum + change(event), 0);
    return { date: key, balance, events: items };
  });
  return { timeline, uncertain: rows.filter(event => event.status !== 'completed' && event.localDate < startDate).length };
}
