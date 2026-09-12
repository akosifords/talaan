import test from "node:test";
import assert from "node:assert/strict";
import {
  dueOccurrences,
  nextOccurrence,
  occurrenceId,
} from "../src/recurrence.js";

test("monthly recurrence clamps to the final day", () => {
  const next = nextOccurrence(new Date("2025-01-31T12:00:00.000Z"), "monthly");
  assert.equal(next.toISOString(), "2025-02-28T12:00:00.000Z");
});

test("monthly due dates retain their original day after a short month", () => {
  const result = dueOccurrences(
    {
      frequency: "monthly",
      interval: 1,
      nextRunAt: new Date("2025-01-31T12:00:00.000Z"),
    },
    new Date("2025-03-31T12:00:00.000Z"),
  );
  assert.deepEqual(
    result.occurrences.map((date) => date.toISOString()),
    [
      "2025-01-31T12:00:00.000Z",
      "2025-02-28T12:00:00.000Z",
      "2025-03-31T12:00:00.000Z",
    ],
  );
});

test("yearly recurrence clamps leap day", () => {
  const next = nextOccurrence(new Date("2024-02-29T08:30:00.000Z"), "yearly");
  assert.equal(next.toISOString(), "2025-02-28T08:30:00.000Z");
});

test("due occurrences advance the persisted cursor", () => {
  const result = dueOccurrences(
    {
      frequency: "weekly",
      interval: 1,
      nextRunAt: new Date("2025-01-01T00:00:00.000Z"),
    },
    new Date("2025-01-15T00:00:00.000Z"),
  );
  assert.deepEqual(
    result.occurrences.map((date) => date.toISOString()),
    [
      "2025-01-01T00:00:00.000Z",
      "2025-01-08T00:00:00.000Z",
      "2025-01-15T00:00:00.000Z",
    ],
  );
  assert.equal(result.nextRunAt.toISOString(), "2025-01-22T00:00:00.000Z");
});

test("occurrence ids are deterministic", () => {
  const date = new Date("2025-04-03T10:00:00.000Z");
  assert.equal(occurrenceId("rent", date), occurrenceId("rent", date));
  assert.equal(occurrenceId("rent", date), "rent_1743674400000");
});
