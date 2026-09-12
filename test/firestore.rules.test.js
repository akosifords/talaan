import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "talaan-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => environment.clearFirestore());
after(async () => environment.cleanup());

function validEvent(ownerId) {
  return {
    ownerId,
    name: "Rent",
    type: "expense",
    amountCents: 120000,
    currency: "usd",
    category: "Bills & subscriptions",
    date: Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")),
    reminderSent: false,
  };
}

test("a user can create and read an owned event", async () => {
  const db = environment.authenticatedContext("alice", {
    email: "alice@example.com",
  }).firestore();
  const ref = doc(db, "users/alice/events/rent");

  await assertSucceeds(setDoc(ref, validEvent("alice")));
  const snapshot = await assertSucceeds(getDoc(ref));
  assert.equal(snapshot.data().amountCents, 120000);
});

test("cross-user reads and writes are denied", async () => {
  const alice = environment.authenticatedContext("alice").firestore();
  const bob = environment.authenticatedContext("bob").firestore();

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "users/alice/events/rent"),
      validEvent("alice"),
    );
  });

  await assertFails(getDoc(doc(bob, "users/alice/events/rent")));
  await assertFails(setDoc(
    doc(alice, "users/alice/events/forged"),
    validEvent("bob"),
  ));
});

test("server-only operational collections are denied", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  await assertFails(getDoc(doc(db, "donations/private")));
  await assertFails(setDoc(doc(db, "supportRequests/forged"), {
    message: "not allowed",
  }));
});
