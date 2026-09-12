import { createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { safeEventId, verifyResendSignature } from "../src/idempotency.js";

test("safe event ids namespace providers and reject paths", () => {
  assert.equal(safeEventId("stripe", "evt_123"), "stripe_evt_123");
  assert.throws(() => safeEventId("stripe", "../evt"), /Invalid webhook/);
});

test("Resend signatures verify once and reject stale timestamps", () => {
  const rawBody = Buffer.from('{"type":"email.bounced"}');
  const eventId = "msg_123";
  const timestamp = "1700000000";
  const key = Buffer.from("test signing key");
  const secret = `whsec_${key.toString("base64")}`;
  const signature = createHmac("sha256", key)
    .update(`${eventId}.${timestamp}.${rawBody}`)
    .digest("base64");
  const input = {
    rawBody,
    eventId,
    timestamp,
    signature: `v1,${signature}`,
    secret,
    now: 1_700_000_100_000,
  };

  assert.equal(verifyResendSignature(input), true);
  assert.equal(
    verifyResendSignature({ ...input, now: 1_700_001_000_000 }),
    false,
  );
});
