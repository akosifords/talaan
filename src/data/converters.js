import { Timestamp, serverTimestamp } from "firebase/firestore";
import { validateEvent, validateGoal } from "./validators.js";

import { toCents } from "../../functions/src/domain/workspace.js";
import { nextOccurrence } from "../../functions/src/recurrence.js";
const toDollars = (value) => Number(value || 0) / 100;
const toTimestamp = (date) => Timestamp.fromDate(new Date(`${date}T12:00:00Z`));
const toDateKey = (value) =>
  (value?.toDate?.() || new Date(value)).toISOString().slice(0, 10);

export const eventConverter = (uid) => ({
  toFirestore(event) {
    if (!validateEvent(event)) throw new Error("Invalid money event.");
    return {
      ownerId: uid,
      name: event.name.trim(),
      type: event.type,
      amountCents: toCents(event.amount),
      currency: "usd",
      category: event.category || "Uncategorized",
      date: toTimestamp(event.date),
      status: event.status || "planned",
      notes: event.notes || "",
      ...Object.fromEntries(["goalId", "subscriptionId", "categoryId"].filter(key => event[key] !== undefined).map(key => [key, event[key]])),
      reminderAt: event.reminderAt || null,
      reminderSent: false,
      updatedAt: serverTimestamp(),
    };
  },
  fromFirestore(snapshot, options) {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name,
      amount: toDollars(data.amountCents),
      type: data.type,
      category: data.category || "",
      date: data.localDate || toDateKey(data.date),
      ...Object.fromEntries(["goalId", "subscriptionId", "categoryId", "revision", "recurringRuleId", "notes", "subscriptionId", "recurring", "legacyIncludedInOpening"].filter(key => data[key] !== undefined).map(key => [key, data[key]])),
      status: data.status || "planned",
    };
  },
});

export const goalConverter = (uid) => ({
  toFirestore(goal) {
    if (!validateGoal(goal)) throw new Error("Invalid goal.");
    return {
      ownerId: uid,
      name: goal.name.trim(),
      targetCents: toCents(goal.target),
      currentCents: toCents(goal.saved),
      currency: "usd",
      status: goal.archived ? "archived" : goal.saved >= goal.target ? "completed" : "active",
      contributions: (goal.contributions || []).map(item => ({ amountCents: toCents(item.amount), date: item.date })),
      updatedAt: serverTimestamp(),
    };
  },
  fromFirestore(snapshot, options) {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name,
      target: toDollars(data.targetCents),
      revision: data.revision,
      archived: data.archived ?? data.status === "archived",
      saved: toDollars(data.currentCents),
      contributions: (data.contributions || []).map((item) => ({
        amount: toDollars(item.amountCents),
        date: item.date,
      })),
    };
  },
});

export function profileToFirestore(
  uid,
  user,
  profile,
  reminders = {},
  includeReminderPreferences = true,
) {
  return {
    ownerId: uid,
    email: user.email || "",
    displayName: profile.name || user.displayName || "",
    currency: "usd",
    timezone:
      reminders.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC",
    ...(includeReminderPreferences
      ? {
          reminderEnabled: Boolean(reminders.enabled),
          reminderHour: Number(reminders.hour ?? 9),
          reminderLeadDays: Number(reminders.leadDays ?? 3),
        }
      : {}),
    startPage: profile.startPage || "overview",
    updatedAt: serverTimestamp(),
  };
}

export { reminderOffsetMinutes } from "../../functions/src/domain/reminders.js";
import { reminderOffsetMinutes } from "../../functions/src/domain/reminders.js";

export function recurringRule(uid, event, reminders = {}) {
  if (!event.recurring?.frequency) return null;
  const source = new Date(`${event.date}T12:00:00Z`);
  const interval = Number(event.recurring.interval || 1);
  const next = nextOccurrence(source, event.recurring.frequency, interval);
  return {
    ownerId: uid,
    enabled: true,
    frequency: event.recurring.frequency,
    interval,
    anchorDay: source.getUTCDate(),
    anchorMonth: source.getUTCMonth(),
    nextRunAt: Timestamp.fromDate(next),
    endAt: event.recurring.endDate
      ? toTimestamp(event.recurring.endDate)
      : null,
    event: {
      name: event.name,
      type: event.type,
      amountCents: toCents(event.amount),
      currency: "usd",
      category: event.category || "Uncategorized",
    },
    ...(reminders.enabled
      ? {
          reminderMinutesBefore: reminderOffsetMinutes(next, reminders),
        }
      : {}),
    updatedAt: serverTimestamp(),
  };
}

export function guardrailToFirestore(uid, value) {
  return {
    ownerId: uid,
    name: "Monthly spending guardrail",
    period: "monthly",
    limitCents: toCents(value.monthlyLimit),
    currency: "usd",
    enabled: Boolean(value.enabled),
    updatedAt: serverTimestamp(),
  };
}

export { toDollars, toDateKey };
