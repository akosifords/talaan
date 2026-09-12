const FREQUENCIES = new Set(["daily", "weekly", "monthly", "yearly"]);

function validDate(value, label) {
  const date = value instanceof Date ? value : value?.toDate?.() ?? new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} must be a valid date`);
  }
  return date;
}

export function nextOccurrence(
  dateValue,
  frequency,
  interval = 1,
  anchorDay,
  anchorMonth,
) {
  const date = validDate(dateValue, "date");
  if (!FREQUENCIES.has(frequency)) throw new TypeError("Invalid frequency");
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new TypeError("interval must be an integer from 1 to 365");
  }

  const next = new Date(date);
  const day = anchorDay ?? next.getUTCDate();
  const month = anchorMonth ?? next.getUTCMonth();
  if (frequency === "daily") next.setUTCDate(next.getUTCDate() + interval);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + interval * 7);
  if (frequency === "monthly") {
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + interval);
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  if (frequency === "yearly") {
    next.setUTCDate(1);
    next.setUTCFullYear(next.getUTCFullYear() + interval);
    next.setUTCMonth(month);
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), month + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next;
}

export function dueOccurrences(rule, throughValue, limit = 100) {
  const through = validDate(throughValue, "through");
  const endAt = rule.endAt ? validDate(rule.endAt, "endAt") : null;
  const results = [];
  let cursor = validDate(rule.nextRunAt, "nextRunAt");
  const anchorDay = rule.anchorDay ?? cursor.getUTCDate();
  const anchorMonth = rule.anchorMonth ?? cursor.getUTCMonth();

  while (cursor <= through && (!endAt || cursor <= endAt)) {
    results.push(cursor);
    if (results.length >= limit) break;
    cursor = nextOccurrence(
      cursor,
      rule.frequency,
      rule.interval ?? 1,
      anchorDay,
      anchorMonth,
    );
  }
  const nextRunAt = results.length
    ? nextOccurrence(
        results.at(-1),
        rule.frequency,
        rule.interval ?? 1,
        anchorDay,
        anchorMonth,
      )
    : cursor;
  return {
    occurrences: results,
    nextRunAt,
    anchorDay,
    anchorMonth,
    exhausted: Boolean(endAt && nextRunAt > endAt),
  };
}

export function occurrenceId(ruleId, occurrenceValue) {
  const occurrence = validDate(occurrenceValue, "occurrence");
  return `${ruleId}_${occurrence.getTime()}`;
}
