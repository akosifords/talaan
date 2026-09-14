import test from 'node:test';
import assert from 'node:assert/strict';
import { routes, sections, resolveWorkspaceRoute, workspaceHref } from '../src/workspaceRoutes.js';

test('legacy routes and new section entries resolve without losing feature ownership', () => {
  assert.equal(resolveWorkspaceRoute('insights'), 'forecast');
  assert.equal(resolveWorkspaceRoute('plan'), 'budgets');
  for (const page of ['overview','schedule','goals','more','profile','settings','help','forecast','budgets','scenarios','subscriptions','roadmap','review','allocation','design-review']) {
    assert.equal(resolveWorkspaceRoute(page), page);
  }
  assert.equal(routes.subscriptions.parent, 'schedule');
  assert.equal(routes.roadmap.parent, 'goals');
  assert.equal(routes.scenarios.parent, 'plan');
  assert.equal(routes.review.parent, 'insights');
});
test('unknown destinations fall back and all primary links have valid targets', () => {
  for (const value of ['missing', '', 'constructor', '__proto__']) assert.equal(resolveWorkspaceRoute(value), 'overview');
  for (const section of sections) assert.equal(routes[section.defaultPage].parent, section.id);
  for (const scope of ['dashboard','personal','workspace']) assert.equal(workspaceHref(scope,'roadmap'), `#${scope}/roadmap`);
});
