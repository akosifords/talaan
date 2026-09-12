import { Timestamp, serverTimestamp } from "firebase/firestore";
import { validateEvent, validateGoal } from "./validators";

const toCents = (value) => Math.round(Number(value) * 100);
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
      ...(event.status === "completed" ? { status: "completed" } : {}),
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
      date: toDateKey(data.date),
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
      currentCents: Math.min(toCents(goal.saved), toCents(goal.target)),
      currency: "usd",
      status: goal.saved >= goal.target ? "completed" : "active",
      ...(goal.contributions?.length
        ? {
            contributions: goal.contributions.map((item) => ({
              amountCents: toCents(item.amount),
              date: item.date,
            })),
          }
        : {}),
      updatedAt: serverTimestamp(),
    };
  },
  fromFirestore(snapshot, options) {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name,
      target: toDollars(data.targetCents),
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

function nextOccurrence(date, frequency, interval) {
  const next = new Date(date);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + interval * 7);
  if (frequency === "monthly") {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + interval);
    next.setUTCDate(
      Math.min(
        day,
        new Date(
          Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
        ).getUTCDate(),
      ),
    );
  }
  if (frequency === "yearly") {
    const month = next.getUTCMonth();
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCFullYear(next.getUTCFullYear() + interval);
    next.setUTCMonth(month);
    next.setUTCDate(
      Math.min(
        day,
        new Date(Date.UTC(next.getUTCFullYear(), month + 1, 0)).getUTCDate(),
      ),
    );
  }
  return next;
}

export function reminderOffsetMinutes(occurrence, reminders) {
  const desired = new Date(
    Date.UTC(
      occurrence.getUTCFullYear(),
      occurrence.getUTCMonth(),
      occurrence.getUTCDate() - Number(reminders.leadDays || 0),
      Number(reminders.hour ?? 9),
    ),
  );
  const timezone = reminders.timezone || "UTC";
  let instant = new Date(desired);
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    for (let pass = 0; pass < 2; pass += 1) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(instant)
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, Number(part.value)]),
      );
      const represented = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
      );
      instant = new Date(instant.getTime() + desired.getTime() - represented);
    }
  } catch {
    instant = desired;
  }
  return Math.min(
    43200,
    Math.max(0, Math.round((occurrence.getTime() - instant.getTime()) / 60000)),
  );
}

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
