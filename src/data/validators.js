import { validDate, validId, validMoney, validTimezone, KINDS, FREQUENCIES, LIMITS } from "../../functions/src/domain/workspace.js";
const ID = { test: validId };
const positiveMoney = value => validMoney(value, 1);

export function validateEvent(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !ID.test(value.id || "") ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > LIMITS.name ||
    !positiveMoney(value.amount) ||
    !validDate(value.date) ||
    !KINDS.includes(value.type) ||
    (value.status && !["planned", "completed"].includes(value.status))
  ) return false;
  if (value.category != null && (typeof value.category !== "string" || value.category.length > LIMITS.category)) return false;
  if (["goalId", "subscriptionId", "categoryId"].some(key => value[key] != null && !validId(value[key]))) return false;
  if (value.notes != null && (typeof value.notes !== "string" || value.notes.length > 1000)) return false;
  if (value.recurring) {
    const { frequency, interval = 1, endDate } = value.recurring;
    if (!FREQUENCIES.includes(frequency)) return false;
    if (!Number.isInteger(interval) || interval < 1 || interval > LIMITS.interval) return false;
    if (endDate && (!validDate(endDate) || endDate < value.date)) return false;
  }
  return true;
}

export function validateGoal(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ID.test(value.id || "") &&
      typeof value.name === "string" &&
      value.name.trim() &&
      value.name.length <= LIMITS.name &&
      positiveMoney(value.target) &&
      validMoney(value.saved) &&
      value.saved >= 0 &&
      value.saved <= 1000000 &&
      (!value.contributions ||
        (Array.isArray(value.contributions) && value.contributions.length <= LIMITS.history &&
          value.contributions.every(
            (item) => positiveMoney(item.amount) && validDate(item.date),
          )))
  );
}

export function validateProfile(value) {
  return Boolean(
    value &&
      typeof value.name === "string" &&
      value.name.length <= 60 &&
      ["overview", "schedule", "goals"].includes(value.startPage),
  );
}

export function validateSettings(value) {
  if (!value || typeof value !== "object") return false;
  const guardrails = value.guardrails || {};
  const reminders = value.reminders || {};
  return (
    (!guardrails.monthlyLimit ||
      positiveMoney(Number(guardrails.monthlyLimit))) &&
    (!reminders.timezone || validTimezone(reminders.timezone)) &&
    (!reminders.hour ||
      (Number.isInteger(Number(reminders.hour)) &&
        Number(reminders.hour) >= 0 &&
        Number(reminders.hour) <= 23)) &&
    (!reminders.leadDays ||
      (Number.isInteger(Number(reminders.leadDays)) &&
        Number(reminders.leadDays) >= 0 &&
        Number(reminders.leadDays) <= 30))
  );
}

export function validatedWorkspace(value) {
  if (!value || typeof value !== "object") return null;
  const entries = Array.isArray(value.entries)
    ? value.entries.filter(validateEvent)
    : [];
  const goals = Array.isArray(value.goals) ? value.goals.filter(validateGoal) : [];
  const profile = validateProfile(value.profile)
    ? value.profile
    : { name: "", startPage: "overview" };
  const settings = validateSettings(value.settings)
    ? value.settings
    : {
        guardrails: { enabled: false, monthlyLimit: "" },
        reminders: {
          enabled: false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          hour: 9,
          leadDays: 3,
        },
      };
  return { entries, goals, profile, settings };
}

export function readValidatedPersonalWorkspace() {
  try {
    return validatedWorkspace({
      entries: JSON.parse(
        localStorage.getItem("talaan-budget-v1-personal") || "[]",
      ),
      goals: JSON.parse(localStorage.getItem("talaan-goals-personal") || "[]"),
      profile: JSON.parse(
        localStorage.getItem("talaan-profile-personal") ||
          '{"name":"","startPage":"overview"}',
      ),
      settings: JSON.parse(
        localStorage.getItem("talaan-settings-personal") || "null",
      ),
    });
  } catch {
    return null;
  }
}
