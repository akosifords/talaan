import { createHmac, timingSafeEqual } from "node:crypto";

export function safeEventId(provider, id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_.-]{1,180}$/.test(id)) {
    throw new TypeError("Invalid webhook event id");
  }
  return `${provider}_${id}`;
}

export function verifyResendSignature({
  rawBody,
  eventId,
  timestamp,
  signature,
  secret,
  now = Date.now(),
  toleranceSeconds = 300,
}) {
  if (!rawBody || !eventId || !timestamp || !signature || !secret) return false;
  const seconds = Number(timestamp);
  if (
    !Number.isFinite(seconds) ||
    Math.abs(now / 1_000 - seconds) > toleranceSeconds
  ) {
    return false;
  }

  const keyText = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key;
  try {
    key = Buffer.from(keyText, "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", key)
    .update(`${eventId}.${timestamp}.${rawBody.toString("utf8")}`)
    .digest("base64");
  const candidates = signature
    .split(" ")
    .map((part) => part.includes(",") ? part.split(",").at(-1) : part)
    .filter(Boolean);

  return candidates.some((candidate) => {
    const actual = Buffer.from(candidate);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  });
}
