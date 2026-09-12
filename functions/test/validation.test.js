import test from "node:test";
import assert from "node:assert/strict";
import {
  integerCents,
  normalizeEmail,
  validateRestoreBackup,
  validateWorkspaceDocument,
} from "../src/validation.js";

test("money accepts only bounded integer cents", () => {
  assert.equal(integerCents(1250), 1250);
  assert.throws(() => integerCents(12.5), /integer/);
  assert.throws(() => integerCents(-1), /integer/);
});

test("emails are normalized and validated", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");
  assert.throws(() => normalizeEmail("not-an-email"), /invalid/);
});

test("restore validates ids and revives timestamp markers", () => {
  const result = validateRestoreBackup({
    events: [{
      id: "event_1",
      data: {
        name: "Rent",
        date: { __type: "timestamp", value: "2025-01-02T00:00:00.000Z" },
      },
    }],
  });
  assert.equal(result.events[0].data.date instanceof Date, true);
  assert.throws(
    () => validateRestoreBackup({ goals: [{ id: "../goal", data: {} }] }),
    /Invalid document id/,
  );
});

test("restored workspace documents enforce cents and field allowlists", () => {
  const event = {
    name: "Payday",
    type: "income",
    amountCents: 250_000,
    currency: "usd",
    category: "Income",
    date: new Date("2025-01-02T00:00:00.000Z"),
  };
  assert.equal(validateWorkspaceDocument("events", event), event);
  assert.throws(
    () => validateWorkspaceDocument("events", { ...event, amountCents: 2.5 }),
    /integer/,
  );
  assert.throws(
    () => validateWorkspaceDocument("events", { ...event, admin: true }),
    /unsupported fields/,
  );
  assert.equal(
    validateWorkspaceDocument("events", { ...event, status: "completed" }).status,
    "completed",
  );
  assert.throws(
    () => validateWorkspaceDocument("events", { ...event, status: "cancelled" }),
    /status is invalid/,
  );
});

test("restored goal contributions require integer cents and date keys", () => {
  const goal = {
    name: "Emergency fund",
    targetCents: 500_000,
    currentCents: 125_000,
    currency: "usd",
    status: "active",
    contributions: [{ amountCents: 25_000, date: "2026-09-12" }],
  };
  assert.equal(validateWorkspaceDocument("goals", goal), goal);
  assert.throws(
    () => validateWorkspaceDocument("goals", {
      ...goal,
      contributions: [{ amountCents: 2.5, date: "2026-09-12" }],
    }),
    /integer/,
  );
});
