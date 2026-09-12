import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEvent,
  validateGoal,
  validateProfile,
  validateSettings,
  validatedWorkspace,
} from "../src/data/validators.js";

const event = {
  id: "rent-2026-09",
  name: "Rent",
  amount: 1200,
  type: "expense",
  category: "Bills & subscriptions",
  date: "2026-09-01",
  status: "planned",
};

test("validates complete workspace records", () => {
  assert.equal(validateEvent(event), true);
  assert.equal(validateGoal({
    id: "emergency",
    name: "Emergency fund",
    target: 5000,
    saved: 1250,
    contributions: [{ amount: 250, date: "2026-09-01" }],
  }), true);
  assert.equal(validateProfile({ name: "Mark", startPage: "overview" }), true);
  assert.equal(validateSettings({
    guardrails: { enabled: true, monthlyLimit: "2000" },
    reminders: { enabled: true, timezone: "Asia/Manila", hour: 9, leadDays: 3 },
  }), true);
});

test("rejects unsafe money and recurrence values", () => {
  assert.equal(validateEvent({ ...event, amount: Number.NaN }), false);
  assert.equal(validateEvent({
    ...event,
    recurring: { frequency: "hourly", interval: 1 },
  }), false);
  assert.equal(validateEvent({
    ...event,
    recurring: { frequency: "monthly", interval: 0 },
  }), false);
});

test("filters invalid imported records without accepting demo data implicitly", () => {
  const workspace = validatedWorkspace({
    entries: [event, { ...event, id: "bad id" }],
    goals: [],
    profile: { name: "", startPage: "overview" },
    settings: null,
  });

  assert.deepEqual(workspace.entries, [event]);
  assert.deepEqual(workspace.goals, []);
});
