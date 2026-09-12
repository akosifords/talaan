const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const positiveMoney = (value) =>
  Number.isFinite(value) && value > 0 && value <= 1000000;
const validDate = (value) =>
  typeof value === "string" &&
  DATE.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function validateEvent(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !ID.test(value.id || "") ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 80 ||
    !positiveMoney(value.amount) ||
    !validDate(value.date) ||
    !["income", "expense"].includes(value.type) ||
    (value.status && !["planned", "completed"].includes(value.status))
  ) return false;
  if (value.type === "expense" && typeof value.category !== "string") return false;
  if (value.recurring) {
    const { frequency, interval = 1, endDate } = value.recurring;
    if (!["weekly", "monthly", "yearly"].includes(frequency)) return false;
    if (!Number.isInteger(interval) || interval < 1 || interval > 99) return false;
    if (endDate && !validDate(endDate)) return false;
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
      value.name.length <= 60 &&
      positiveMoney(value.target) &&
      Number.isFinite(value.saved) &&
      value.saved >= 0 &&
      value.saved <= 1000000 &&
      (!value.contributions ||
        (Array.isArray(value.contributions) &&
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
    (!reminders.timezone || typeof reminders.timezone === "string") &&
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
