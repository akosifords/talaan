import { HttpsError } from "firebase-functions/v2/https";

export const LIMITS = Object.freeze({
  exportDocuments: 240,
  restoreDocuments: 240,
  messageLength: 4_000,
  nameLength: 100,
});

const COLLECTIONS = ["events", "goals", "recurringRules", "guardrails"];
const DATE_FIELDS = new Set([
  "date",
  "startAt",
  "endAt",
  "nextRunAt",
  "reminderAt",
  "createdAt",
  "updatedAt",
]);

export function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  return request.auth.uid;
}

export function assertPlainObject(value, label = "value") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", `${label} must be an object.`);
  }
  return value;
}

export function cleanString(value, label, { min = 1, max = 200 } = {}) {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${label} must be a string.`);
  }
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new HttpsError(
      "invalid-argument",
      `${label} must contain ${min}-${max} characters.`,
    );
  }
  return result;
}

export function integerCents(value, { min = 1, max = 100_000_000 } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpsError(
      "invalid-argument",
      `amountCents must be an integer between ${min} and ${max}.`,
    );
  }
  return value;
}

export function validateRestoreBackup(value) {
  const backup = assertPlainObject(value, "backup");
  const output = {};
  let count = 0;

  for (const collection of COLLECTIONS) {
    const rows = backup[collection] ?? [];
    if (!Array.isArray(rows)) {
      throw new HttpsError(
        "invalid-argument",
        `backup.${collection} must be an array.`,
      );
    }
    output[collection] = rows.map((row) => {
      const item = assertPlainObject(row, `${collection} item`);
      const id = cleanString(item.id, `${collection} item id`, {
        min: 1,
        max: 128,
      });
      if (!/^[A-Za-z0-9_-]+$/.test(id)) {
        throw new HttpsError("invalid-argument", `Invalid document id: ${id}.`);
      }
      return { id, data: decodeDates(assertPlainObject(item.data, `${id}.data`)) };
    });
    count += rows.length;
  }

  if (count > LIMITS.restoreDocuments) {
    throw new HttpsError(
      "invalid-argument",
      `A restore may contain at most ${LIMITS.restoreDocuments} documents.`,
    );
  }
  return output;
}

export function encodeFirestore(value) {
  if (value?.toDate instanceof Function) {
    return { __type: "timestamp", value: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(encodeFirestore);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, encodeFirestore(child)]),
    );
  }
  return value;
}

function decodeDates(value) {
  if (Array.isArray(value)) return value.map(decodeDates);
  if (value && typeof value === "object") {
    if (
      value.__type === "timestamp" &&
      typeof value.value === "string" &&
      Object.keys(value).length === 2
    ) {
      const date = new Date(value.value);
      if (Number.isNaN(date.getTime())) {
        throw new HttpsError("invalid-argument", "Backup contains an invalid date.");
      }
      return date;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        if (DATE_FIELDS.has(key) && typeof child === "string") {
          const date = new Date(child);
          if (!Number.isNaN(date.getTime())) return [key, date];
        }
        return [key, decodeDates(child)];
      }),
    );
  }
  return value;
}

export function normalizeEmail(value) {
  const email = cleanString(value, "email", { min: 3, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "email is invalid.");
  }
  return email;
}

function assertAllowedKeys(data, allowed, label) {
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new HttpsError(
      "invalid-argument",
      `${label} contains unsupported fields: ${unknown.join(", ")}.`,
    );
  }
}

function requireDate(value, label, optional = false) {
  if (optional && (value === undefined || value === null)) return;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new HttpsError("invalid-argument", `${label} must be a date.`);
  }
}

function optionalText(value, label, max) {
  if (value !== undefined) cleanString(value, label, { min: 0, max });
}

export function validateWorkspaceDocument(collection, value) {
  const data = assertPlainObject(value, `${collection} document`);
  const common = ["ownerId", "createdAt", "updatedAt"];
  if (data.createdAt !== undefined) requireDate(data.createdAt, "createdAt", true);

  if (collection === "events") {
    assertAllowedKeys(data, [
      ...common, "name", "type", "amountCents", "currency", "category", "date",
      "status", "notes", "reminderAt", "reminderSent", "reminderSentAt",
      "recurringRuleId", "occurrenceAt",
    ], "event");
    cleanString(data.name, "event.name", { max: 100 });
    if (!["income", "expense", "saving"].includes(data.type)) {
      throw new HttpsError("invalid-argument", "event.type is invalid.");
    }
    integerCents(data.amountCents);
    if (data.currency !== "usd") {
      throw new HttpsError("invalid-argument", "event.currency must be usd.");
    }
    cleanString(data.category, "event.category", { max: 60 });
    requireDate(data.date, "event.date");
    if (
      data.status !== undefined &&
      !["planned", "completed"].includes(data.status)
    ) {
      throw new HttpsError("invalid-argument", "event.status is invalid.");
    }
    optionalText(data.notes, "event.notes", 1_000);
    requireDate(data.reminderAt, "event.reminderAt", true);
    requireDate(data.reminderSentAt, "event.reminderSentAt", true);
    requireDate(data.occurrenceAt, "event.occurrenceAt", true);
    if (data.reminderSent !== undefined && typeof data.reminderSent !== "boolean") {
      throw new HttpsError("invalid-argument", "event.reminderSent must be boolean.");
    }
  } else if (collection === "goals") {
    assertAllowedKeys(data, [
      ...common, "name", "targetCents", "currentCents", "currency", "status",
      "targetDate", "notes", "contributions",
    ], "goal");
    cleanString(data.name, "goal.name", { max: 100 });
    integerCents(data.targetCents);
    integerCents(data.currentCents, { min: 0 });
    if (data.currentCents > data.targetCents || data.currency !== "usd") {
      throw new HttpsError("invalid-argument", "goal amounts or currency are invalid.");
    }
    if (!["active", "completed", "archived"].includes(data.status)) {
      throw new HttpsError("invalid-argument", "goal.status is invalid.");
    }
    if (data.contributions !== undefined) {
      if (!Array.isArray(data.contributions) || data.contributions.length > 500) {
        throw new HttpsError(
          "invalid-argument",
          "goal.contributions must be an array of at most 500 entries.",
        );
      }
      data.contributions.forEach((contribution, index) => {
        const item = assertPlainObject(
          contribution,
          `goal.contributions[${index}]`,
        );
        assertAllowedKeys(
          item,
          ["amountCents", "date"],
          `goal.contributions[${index}]`,
        );
        integerCents(item.amountCents);
        if (
          typeof item.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
          Number.isNaN(Date.parse(`${item.date}T00:00:00Z`))
        ) {
          throw new HttpsError(
            "invalid-argument",
            `goal.contributions[${index}].date is invalid.`,
          );
        }
      });
    }
    requireDate(data.targetDate, "goal.targetDate", true);
    optionalText(data.notes, "goal.notes", 1_000);
  } else if (collection === "recurringRules") {
    assertAllowedKeys(data, [
      ...common, "enabled", "frequency", "interval", "nextRunAt", "endAt",
      "anchorDay", "anchorMonth", "reminderMinutesBefore", "event",
    ], "recurring rule");
    if (typeof data.enabled !== "boolean") {
      throw new HttpsError("invalid-argument", "recurringRules.enabled must be boolean.");
    }
    if (!["daily", "weekly", "monthly", "yearly"].includes(data.frequency)) {
      throw new HttpsError("invalid-argument", "recurringRules.frequency is invalid.");
    }
    if (!Number.isInteger(data.interval) || data.interval < 1 || data.interval > 365) {
      throw new HttpsError("invalid-argument", "recurringRules.interval is invalid.");
    }
    if (
      data.anchorDay !== undefined &&
      (!Number.isInteger(data.anchorDay) || data.anchorDay < 1 || data.anchorDay > 31)
    ) {
      throw new HttpsError("invalid-argument", "recurringRules.anchorDay is invalid.");
    }
    if (
      data.anchorMonth !== undefined &&
      (!Number.isInteger(data.anchorMonth) ||
        data.anchorMonth < 0 ||
        data.anchorMonth > 11)
    ) {
      throw new HttpsError("invalid-argument", "recurringRules.anchorMonth is invalid.");
    }
    requireDate(data.nextRunAt, "recurringRules.nextRunAt");
    requireDate(data.endAt, "recurringRules.endAt", true);
    if (
      data.reminderMinutesBefore !== undefined &&
      (!Number.isInteger(data.reminderMinutesBefore) ||
        data.reminderMinutesBefore < 0 ||
        data.reminderMinutesBefore > 43_200)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "recurringRules.reminderMinutesBefore is invalid.",
      );
    }
    if (
      data.event?.reminderAt !== undefined ||
      data.event?.reminderSent !== undefined
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Recurring event reminders use reminderMinutesBefore.",
      );
    }
    assertAllowedKeys(
      assertPlainObject(data.event, "recurringRules.event"),
      ["name", "type", "amountCents", "currency", "category", "notes"],
      "recurringRules.event",
    );
    validateWorkspaceDocument("events", {
      ...data.event,
      ownerId: "template",
      date: data.nextRunAt,
    });
  } else if (collection === "guardrails") {
    assertAllowedKeys(data, [
      ...common, "name", "period", "limitCents", "currency", "category", "enabled",
    ], "guardrail");
    cleanString(data.name, "guardrail.name", { max: 100 });
    if (!["weekly", "monthly"].includes(data.period)) {
      throw new HttpsError("invalid-argument", "guardrail.period is invalid.");
    }
    integerCents(data.limitCents);
    if (data.currency !== "usd" || typeof data.enabled !== "boolean") {
      throw new HttpsError("invalid-argument", "guardrail currency or enabled is invalid.");
    }
    optionalText(data.category, "guardrail.category", 60);
  }
  return data;
}
