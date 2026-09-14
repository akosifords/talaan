export const categories = [
  { name: 'Home & bills', spent: 1450, previous: 1420, limit: 1600 },
  { name: 'Everyday spending', spent: 640, previous: 720, limit: 800 },
  { name: 'Getting around', spent: 180, previous: 210, limit: 250 },
  { name: 'Subscriptions', spent: 76, previous: 76, limit: 90 },
  { name: 'Little extras', spent: 210, previous: 165, limit: 180 },
];
export const subscriptions = [
  { id: 'music', name: 'Soundtrack', category: 'Entertainment', amount: 12, day: 15, mark: 'S' },
  { id: 'cloud', name: 'Cloud storage', category: 'Utilities', amount: 10, day: 18, mark: 'C' },
  { id: 'stream', name: 'Movie nights', category: 'Entertainment', amount: 19, day: 22, mark: 'M' },
  { id: 'fitness', name: 'Move studio', category: 'Wellbeing', amount: 35, day: 27, mark: '↗' },
];
export const goals = [
  { id: 'cushion', name: 'Emergency cushion', saved: 1200, target: 3000, monthly: 200 },
  { id: 'trip', name: 'A slower summer', saved: 450, target: 1800, monthly: 150 },
  { id: 'desk', name: 'A better workspace', saved: 300, target: 900, monthly: 100 },
];
export const cash = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
export function scenarioBalance(incomeChange, extraExpense, extraSavings) {
  return 3800 + incomeChange - 2556 - 450 - extraExpense - extraSavings;
}
export function monthsToGoal(goal, contribution) {
  return contribution > 0 ? Math.ceil(Math.max(0, goal.target - goal.saved) / contribution) : null;
}
