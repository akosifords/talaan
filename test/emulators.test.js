import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDocFromServer,
  deleteDoc, terminate, Timestamp,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

test("emulated sign-in, owned writes, isolation, and App Check enforcement", { timeout: 30000 }, async () => {
  const clients = [];
  const connect = (name) => {
    const app = initializeApp({ projectId: "demo-talaan", apiKey: "demo-key", appId: "demo-app" }, name);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const functions = getFunctions(app, "us-central1");
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    clients.push({ app, db });
    return { auth, db, functions };
  };
  try {
    const alice = connect("alice-smoke");
    const bob = connect("bob-smoke");
    const { user } = await signInAnonymously(alice.auth);
    await signInAnonymously(bob.auth);
    const path = `users/${user.uid}/events/smoke`;
    const ref = doc(alice.db, path);
    await setDoc(ref, {
      ownerId: user.uid, name: "Emulator smoke test", type: "expense",
      amountCents: 100, currency: "usd", category: "Bills & subscriptions",
      date: Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), reminderSent: false,
    });
    assert.equal((await getDocFromServer(ref)).data().amountCents, 100);
    await assert.rejects(getDocFromServer(doc(bob.db, path)), { code: "permission-denied" });
    await assert.rejects(httpsCallable(alice.functions, "exportWorkspace")({}), { code: "functions/unauthenticated" });
    for(const name of ['workspaceCommand','loadWorkspace','workspaceBackup','enableWorkspace']) {
      await assert.rejects(httpsCallable(alice.functions,name)({}),{code:'functions/unauthenticated'});
    }
    await deleteDoc(ref);
  } finally {
    await Promise.all(clients.map(async ({ app, db }) => {
      await terminate(db);
      await deleteApp(app);
    }));
  }
});
