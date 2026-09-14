import { categories } from './planningData.js';

export const samplePlan = {
  income: 3800,
  spending: categories.reduce((sum, category) => sum + category.spent, 0),
  savings: 450,
};
export function createPlanningToolsState() {
  return { limits: categories.map(category => category.limit), scenario: { income: 0, expense: 0, saving: 0 } };
}
const bounded = (value, min, max) => Number.isFinite(Number(value)) ? Math.round(Math.max(min, Math.min(max, Number(value)))) : 0;
export function planningToolsReducer(state, action) {
  switch (action.type) {
    case 'limit': return { ...state, limits: state.limits.map((value, index) => index === action.index ? bounded(action.value, 0, 100000) : value) };
    case 'resetLimits': return { ...state, limits: createPlanningToolsState().limits };
    case 'scenario': return { ...state, scenario: {
      income: bounded(action.value.income, -1500, 1500),
      expense: bounded(action.value.expense, 0, 1500),
      saving: bounded(action.value.saving, 0, 1000),
    } };
    case 'resetScenario': return { ...state, scenario: createPlanningToolsState().scenario };
    default: return state;
  }
}
export function planningTotals(state, plan = samplePlan) {
  const limits = state.limits.reduce((sum, limit) => sum + limit, 0);
  const base = plan.income - plan.spending - plan.savings;
  const income = plan.income + state.scenario.income;
  const spending = plan.spending + state.scenario.expense;
  const savings = plan.savings + state.scenario.saving;
  return { limits, headroom: limits - plan.spending, unallocated: plan.income - plan.savings - limits, base, income, spending, savings, result: income - spending - savings };
}
