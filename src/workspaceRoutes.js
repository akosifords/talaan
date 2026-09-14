export const sections = [
  { id: 'overview', label: 'Overview', defaultPage: 'overview' },
  { id: 'plan', label: 'Plan', defaultPage: 'budgets' },
  { id: 'schedule', label: 'Schedule', defaultPage: 'schedule' },
  { id: 'goals', label: 'Goals', defaultPage: 'goals' },
  { id: 'insights', label: 'Insights', defaultPage: 'forecast' },
];
export const routes = {
  overview: { parent: 'overview', title: 'Your overview', label: 'Overview', period: true },
  budgets: { parent: 'plan', title: 'Category budgets', label: 'Category budgets', preview: true },
  scenarios: { parent: 'plan', title: 'What-if planner', label: 'What-if scenarios', preview: true },
  schedule: { parent: 'schedule', title: 'Your schedule', label: 'Events', period: true },
  subscriptions: { parent: 'schedule', title: 'Subscriptions', label: 'Subscriptions', preview: true },
  goals: { parent: 'goals', title: 'Your goals', label: 'Goals' },
  roadmap: { parent: 'goals', title: 'Savings roadmap', label: 'Savings roadmap' },
  forecast: { parent: 'insights', title: 'Cash flow', label: 'Cash flow', preview: true },
  review: { parent: 'insights', title: 'Monthly review', label: 'Monthly review', preview: true },
  allocation: { parent: 'insights', title: 'Allocation report', label: 'Allocation', period: true },
  'design-review': { parent: 'account', title: 'Design review', label: 'Design review' },
  more: { parent: 'account', title: 'Your workspace', label: 'Account' },
  profile: { parent: 'account', title: 'Your profile', label: 'Profile' },
  settings: { parent: 'account', title: 'Settings & data', label: 'Settings & data' },
  help: { parent: 'account', title: 'Help & support', label: 'Help & support' },
};
export function resolveWorkspaceRoute(value) {
  const page = ({ plan: 'budgets', insights: 'forecast' })[value] || value;
  return Object.hasOwn(routes, page) ? page : 'overview';
}
export function workspaceHref(scope, page) { return `#${scope}/${page}`; }
