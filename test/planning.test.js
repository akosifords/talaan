import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarioBalance, monthsToGoal, goals, categories, subscriptions } from '../src/planningData.js';

test('sample budget, subscriptions, and scenarios reconcile', () => {
  assert.equal(categories.reduce((sum, item) => sum + item.spent, 0), 2556);
  assert.equal(subscriptions.reduce((sum, item) => sum + item.amount, 0), 76);
  assert.equal(scenarioBalance(0, 0, 0), 794);
  assert.equal(scenarioBalance(300, 0, 100), 994);
  assert.equal(scenarioBalance(-1500, 1500, 1000), -3206);
});

test('goal timelines handle zero contributions and round up partial months', () => {
  assert.equal(monthsToGoal(goals[0], 0), null);
  assert.equal(monthsToGoal(goals[0], 200), 9);
  assert.equal(monthsToGoal(goals[0], 400), 5);
  assert.equal(monthsToGoal({ saved: 3000, target: 3000 }, 200), 0);
});


// Exercise the shared state owner used across planning routes.
import { createPlanningToolsState, planningToolsReducer, planningTotals } from '../src/planningToolsState.js';
test('budget limits and scenarios reconcile while remaining isolated', () => {
  const initial = createPlanningToolsState();
  const budget = planningToolsReducer(initial, { type: 'limit', index: 0, value: 1800 });
  const changed = planningToolsReducer(budget, { type: 'scenario', value: { income: 300, expense: 0, saving: 100 } });
  assert.equal(planningTotals(changed).limits, 3120);
  assert.equal(planningTotals(changed).unallocated, 230);
  assert.equal(planningTotals(changed).base, 794);
  assert.equal(planningTotals(changed).result, 994);
  assert.equal(initial.limits[0], 1600);
  const resetScenario = planningToolsReducer(changed, { type: 'resetScenario' });
  assert.equal(resetScenario.limits[0], 1800);
  assert.equal(planningTotals(resetScenario).result, 794);
  const resetLimits = planningToolsReducer(changed, { type: 'resetLimits' });
  assert.equal(resetLimits.limits[0], 1600);
  assert.equal(planningTotals(resetLimits).result, 994);
});
test('trial amounts are bounded and deficit scenarios remain visible', () => {
  let state = createPlanningToolsState();
  state = planningToolsReducer(state, { type: 'limit', index: 0, value: -200 });
  assert.equal(state.limits[0], 0);
  state = planningToolsReducer(state, { type: 'scenario', value: { income: -9999, expense: 9999, saving: 9999 } });
  assert.equal(planningTotals(state).result, -3206);
  assert.equal(planningTotals(createPlanningToolsState()).result, 794);
});

import { recordGoalContribution } from '../src/goalPlanning.js';
test('recorded contributions preserve history and add cents without mutating the goal', () => {
  const goal = { id: 'goal', saved: 0.1, target: 10, contributions: [{ amount: 0.1, date: '2026-09-01' }] };
  const updated = recordGoalContribution(goal, 0.2, '2026-09-13');
  assert.equal(updated.saved, 0.3);
  assert.equal(updated.contributions.length, 2);
  assert.deepEqual(updated.contributions[1], { amount: 0.2, date: '2026-09-13' });
  assert.equal(goal.saved, 0.1);
  assert.equal(goal.contributions.length, 1);
  assert.equal(recordGoalContribution(updated, '', '2026-09-14').contributions.length, 2);
});

import { createSampleHousehold, cashTimeline, forecastEntries, monthSummary, householdCategories, updateSampleEvent, sampleEvents } from '../src/sampleHousehold.js';
test('shared September household reconciles cash, categories, savings and goal allocations', () => {
  const data=createSampleHousehold();
  assert.deepEqual(monthSummary(data.entries.filter(row=>row.date.startsWith('2026-09'))), {income:3800,spending:2556,savings:450});
  assert.equal(householdCategories(data.entries.filter(row=>row.date.startsWith('2026-09'))).reduce((sum,row)=>sum+row.spent,0),2556);
  const rows=cashTimeline(data.entries);
  assert.equal(rows.length,30);
  assert.equal(rows.at(-1).balance,2034);
  assert.equal(data.entries.filter(row=>row.subscriptionId&&row.date.startsWith('2026-09')).reduce((sum,row)=>sum+row.amount,0),76);
  assert.equal(data.entries.filter(row=>row.goalId&&row.date.startsWith('2026-09')).reduce((sum,row)=>sum+row.amount,0),450);
  assert.equal(data.goals.reduce((sum,goal)=>sum+goal.saved,0),1950);
});
test('forecast repeats dated events, handles negative cash and month-end paydays', () => {
  const data=createSampleHousehold();
  const events=forecastEntries(data.entries,90);
  assert.equal(events.filter(row=>row.date==='2026-10-31'&&row.type==='income').length,1);
  const rows=cashTimeline(events,'2026-09-01',90);
  assert.ok(rows.some(row=>row.balance<0));
  const october=rows.find(row=>row.date==='2026-10-01');
  assert.equal(october.balance,2034-1200);
  assert.equal(rows.at(-1).date,'2026-11-29');
  assert.equal(sampleEvents('2026-08').every(row=>row.status==='completed'),true);
});
test('completed savings affect goal assets once and edits reconcile all derived totals', () => {
  const original=createSampleHousehold();
  const event=original.entries.find(row=>row.goalId==='cushion'&&row.date.startsWith('2026-09'));
  const changed=updateSampleEvent(original,{...event,status:'completed'});
  assert.equal(changed.goals.find(goal=>goal.id==='cushion').saved,1400);
  const repeated=updateSampleEvent(changed,{...event,status:'completed'});
  assert.equal(repeated.goals.find(goal=>goal.id==='cushion').saved,1400);
  assert.equal(repeated.goals.find(goal=>goal.id==='cushion').contributions.length,2);
  const removed=updateSampleEvent(repeated,null,event.id);
  assert.equal(removed.goals.find(goal=>goal.id==='cushion').saved,1200);
  assert.equal(monthSummary(removed.entries.filter(row=>row.date.startsWith('2026-09'))).savings,250);
  assert.equal(cashTimeline(removed.entries).at(-1).balance,2234);
  assert.equal(original.goals.find(goal=>goal.id==='cushion').saved,1200);
});
