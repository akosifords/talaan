import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import { eventConverter, goalConverter, recurringRule } from '../src/data/converters.js';
import { validateEvent, validateGoal } from '../src/data/validators.js';
import { validDate, toCents, capabilities } from '../functions/src/domain/workspace.js';
import { applyGoalDelta, assertRevision, checkCommand } from '../functions/src/domain/commands.js';
import { dueOccurrences } from '../functions/src/recurrence.js';
const event = { id: 'rent', name: 'Rent', amount: 123.45, type: 'expense', category: 'Bills', date: '2026-01-31' };

test('calendar and money boundaries reject normalized dates and fractional cents', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.throws(() => toCents(1.001));
  assert.equal(toCents(0.29), 29);
  assert.equal(validateEvent({ ...event, amount: 1.001 }), false);
  assert.equal(validateEvent({ ...event, recurring: { frequency: 'monthly', interval: 366 } }), false);
  assert.equal(validateEvent({ ...event, recurring: { frequency: 'daily', interval: 365, endDate: '2026-01-30' } }), false);
  assert.equal(validateGoal({ id: 'g', name: 'g', target: 1, saved: 2 }), true);
});
test('converter reopening writes explicit planned status and preserves nullable links', () => {
  const converter = eventConverter('owner');
  const completed = converter.toFirestore({ ...event, status: 'completed', goalId: 'g' });
  const reopened = { ...completed, ...converter.toFirestore({ ...event, status: 'planned', goalId: null }) };
  assert.equal(reopened.status, 'planned'); assert.equal(reopened.goalId, null);
  const view = converter.fromFirestore({ id: 'rent', data: () => ({ ...completed, localDate: '2026-02-01', date: Timestamp.now(), revision: 3 }) });
  assert.equal(view.date, '2026-02-01'); assert.equal(view.goalId, 'g'); assert.equal(view.revision, 3);
});
test('goal converter preserves over-target assets and explicitly clears history', () => {
  const value = goalConverter('owner').toFirestore({ id: 'g', name: 'Goal', saved: 200, target: 100, contributions: [] });
  assert.equal(value.currentCents, 20000); assert.deepEqual(value.contributions, []);
});
test('client-created monthly and yearly rules retain original anchors', () => {
  const rule = recurringRule('owner', { ...event, recurring: { frequency: 'monthly', interval: 1 } });
  assert.equal(rule.anchorDay, 31);
  assert.deepEqual(dueOccurrences(rule, new Date('2026-03-31T12:00:00Z')).occurrences.map(date => date.toISOString().slice(0, 10)), ['2026-02-28', '2026-03-31']);
  const leap = recurringRule('owner', { ...event, date: '2024-02-29', recurring: { frequency: 'yearly', interval: 1 } });
  assert.equal(dueOccurrences(leap, new Date('2028-02-29T12:00:00Z')).occurrences.at(-1).toISOString().slice(0, 10), '2028-02-29');
});
test('contribution transitions reject stale revisions and reopening reverses exactly once', () => {
  const goal = { id: 'g', openingDate: '2026-09-01', currentCents: 100, revision: 1 };
  assertRevision(goal,1);
  const next=applyGoalDelta(goal,200,['2026-09-02']);
  assert.equal(next.currentCents,300);
  assert.throws(()=>assertRevision(next,1),{code:'aborted'});
  const second=applyGoalDelta(next,50,['2026-09-02']);
  assert.equal(second.currentCents,350);
  assert.equal(applyGoalDelta(second,-200,['2026-09-02']).currentCents,150);
  assert.throws(()=>applyGoalDelta(goal,200,['2026-08-31']),{code:'failed-precondition'});
});
test('workspace capabilities isolate sample and explicitly fence migration and future versions', () => {
  assert.equal(capabilities('sample').planning, true);
  for (const kind of ['cloud', 'local']) assert.equal(capabilities(kind).planning, false);
  assert.equal(capabilities('cloud', { migration: { status: 'copying' } }).write, false);
  assert.equal(capabilities('cloud', { schemaVersion: 2 }).write, false);
  assert.equal(capabilities('cloud', { schemaVersion: 99 }).write, false);
  assert.throws(() => checkCommand({ requestId: '../bad' }), { code: 'invalid-argument' });
});

test('real forecast counts savings once, respects checkpoints, deduplicates occurrences and keeps negatives', async () => {
  const { cashForecast, totalLedger } = await import('../functions/src/domain/analysis.js');
  const event = { id: 'rent_1772280000000', type: 'expense', amountCents: 500, localDate: '2026-02-28', status: 'planned' };
  const rule = { id: 'rent', enabled: true, frequency: 'monthly', interval: 1, anchorDay: 31, nextRunAt: new Date('2026-02-28T12:00:00Z'), event: { type: 'expense', amountCents: 500 } };
  const rows = [event,{ id:'save',type:'saving',amountCents:100,localDate:'2026-02-28',status:'completed' }];
  assert.equal(totalLedger(rows).remainder,-600); assert.equal(totalLedger(rows,true).remainder,-100);
  const result = cashForecast(rows,[rule],{openingCents:200,effectiveDate:'2026-02-28'},'2026-02-28',30);
  assert.equal(result.timeline[0].balance,-400);
  assert.equal(result.timeline[0].events.length,2);
  assert.throws(()=>cashForecast(rows,[],null,'2026-02-28',30),{code:'failed-precondition'});
});

test('local backend uses the same atomic commands and survives backup restore without replaying old writes', async () => {
  const { localBackend } = await import('../src/data/localBackend.js');
  const values = new Map();
  const originalStorage=globalThis.localStorage, originalWindow=globalThis.window;
  Object.defineProperty(globalThis.navigator,'locks',{configurable:true,value:{request:async(_key,work)=>work()}});
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  globalThis.window={dispatchEvent:()=>{}};
  try {
    const backend=localBackend('test',(()=>({entries:[],goals:[],profile:{name:'Test',startPage:'overview'},settings:{reminders:{enabled:false,timezone:'UTC',hour:9,leadDays:3}}})));
    await backend.upgrade('2026-09-14');
    const command={requestId:'request',generation:'local-v2',type:'goals.save',entityId:'goal',expectedRevision:0,payload:{name:'Goal',targetCents:100,openingCents:200,openingDate:'2026-09-14',contributionCents:50,contributionDate:'2026-09-14'}};
    await backend.command(command);await backend.command(command);
    assert.equal(backend.collections().collections.goals[0].data.currentCents,250);
    assert.equal(backend.collections().collections.events.length,1);
    const backup=await backend.export();await backend.restore(backup);
    const after=backend.collections();assert.notEqual(after.generation,'local-v2');
    await backend.command(command);assert.equal(backend.collections().collections.events.length,1);
    assert.equal(backend.collections().collections.goals[0].data.currentCents,250);
    await assert.rejects(backend.command({...command,requestId:'new-request'}),{code:'failed-precondition'});
    assert.ok(values.has('talaan-backend-v2-test-legacy-backup'));
  } finally { globalThis.localStorage=originalStorage;globalThis.window=originalWindow;delete globalThis.navigator.locks; }
});

test('reminder instants handle western and fractional timezones and DST gaps/overlaps', async () => {
  const { reminderInstant }=await import('../functions/src/domain/reminders.js');
  const instant=(date,timezone,hour)=>reminderInstant(new Date(`${date}T12:00:00Z`),{timezone,hour,leadDays:0}).toISOString();
  assert.equal(instant('2026-09-15','America/Los_Angeles',9),'2026-09-15T16:00:00.000Z');
  assert.equal(instant('2026-09-15','Asia/Kolkata',9),'2026-09-15T03:30:00.000Z');
  assert.equal(instant('2026-03-08','America/New_York',2),'2026-03-08T07:00:00.000Z');
  assert.equal(instant('2026-11-01','America/New_York',1),'2026-11-01T05:00:00.000Z');
});

test('v2 projected expenses retain their kind when a category is named Savings', async () => {
  const { projectLedger, totalLedger } = await import('../functions/src/domain/analysis.js');
  const rule = { id: 'bill', enabled: true, frequency: 'monthly', interval: 1, nextRunAt: new Date('2026-09-15T12:00:00Z'), event: { type: 'expense', category: 'Savings', amountCents: 500 } };
  const projected = projectLedger([], [rule], '2026-09-15');
  assert.equal(projected.length, 1);
  assert.equal(totalLedger(projected).expense, 500);
  assert.equal(totalLedger(projected).saving, 0);
});
