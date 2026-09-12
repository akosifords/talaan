import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import Stripe from "stripe";
import { Resend } from "resend";
import {
  LIMITS,
  assertPlainObject,
  cleanString,
  encodeFirestore,
  integerCents,
  normalizeEmail,
  requireAuth,
  validateRestoreBackup,
  validateWorkspaceDocument,
} from "./validation.js";
import { dueOccurrences, occurrenceId } from "./recurrence.js";
import { safeEventId, verifyResendSignature } from "./idempotency.js";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 20 });

const db = getFirestore();
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const RESEND_WEBHOOK_SECRET = defineSecret("RESEND_WEBHOOK_SECRET");
const RESEND_FROM_EMAIL = defineSecret("RESEND_FROM_EMAIL");
const SUPPORT_TO_EMAIL = defineSecret("SUPPORT_TO_EMAIL");
const APP_URL = defineSecret("APP_URL");
const WORKSPACE_COLLECTIONS = [
  "events",
  "goals",
  "recurringRules",
  "guardrails",
];
const CALLABLE_OPTIONS = { enforceAppCheck: true };

function userRef(uid) {
  return db.collection("users").doc(uid);
}

async function claimWebhook(ref, provider, type) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Timestamp.now();
    if (snapshot.exists && snapshot.get("status") === "processed") return false;
    if (
      snapshot.exists &&
      snapshot.get("status") === "processing" &&
      snapshot.get("leaseUntil")?.toMillis() > now.toMillis()
    ) return false;
    transaction.set(
      ref,
      {
        provider,
        type,
        status: "processing",
        leaseUntil: Timestamp.fromMillis(now.toMillis() + 5 * 60_000),
        attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: snapshot.exists
          ? snapshot.get("createdAt")
          : FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  });
}

async function enforceFixedWindow(key, limit, windowMs) {
  const ref = db.collection("rateLimits").doc(key);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Timestamp.now();
    const windowStartedAt = snapshot.get("windowStartedAt");
    const expired =
      !windowStartedAt ||
      now.toMillis() - windowStartedAt.toMillis() >= windowMs;
    const count = expired ? 0 : Number(snapshot.get("count") || 0);
    if (count >= limit) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many requests. Please try again later.",
      );
    }
    transaction.set(ref, {
      count: count + 1,
      windowStartedAt: expired ? now : windowStartedAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export const exportWorkspace = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = requireAuth(request);
  const owner = userRef(uid);
  const [profile, ...snapshots] = await Promise.all([
    owner.get(),
    ...WORKSPACE_COLLECTIONS.map((name) => owner.collection(name).get()),
  ]);
  const count = snapshots.reduce((total, snapshot) => total + snapshot.size, 0);
  if (count > LIMITS.exportDocuments) {
    throw new HttpsError(
      "resource-exhausted",
      `Workspace exceeds the ${LIMITS.exportDocuments}-document export limit.`,
    );
  }

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: encodeFirestore(profile.data() ?? {}),
  };
  WORKSPACE_COLLECTIONS.forEach((name, index) => {
    backup[name] = snapshots[index].docs.map((doc) => ({
      id: doc.id,
      data: encodeFirestore(doc.data()),
    }));
  });
  return { backup };
});

export const restoreWorkspace = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = requireAuth(request);
  const input = assertPlainObject(request.data);
  const backup = validateRestoreBackup(input.backup);
  const validatedBackup = Object.fromEntries(
    Object.entries(backup).map(([collection, rows]) => [
      collection,
      rows.map((row) => ({
        ...row,
        data: validateWorkspaceDocument(collection, row.data),
      })),
    ]),
  );
  const profile = input.backup?.profile;
  const owner = userRef(uid);
  const existing = await Promise.all(
    WORKSPACE_COLLECTIONS.map((name) => owner.collection(name).get()),
  );
  const existingCount = existing.reduce(
    (total, snapshot) => total + snapshot.size,
    0,
  );
  const restoredCount = Object.values(validatedBackup)
    .reduce((sum, rows) => sum + rows.length, 0);
  if (existingCount + restoredCount + 1 > 500) {
    throw new HttpsError(
      "resource-exhausted",
      "Workspace replacement exceeds Firestore's 500-write atomic limit.",
    );
  }
  const batch = db.batch();
  existing.forEach((snapshot) => {
    snapshot.docs.forEach((document) => batch.delete(document.ref));
  });
  for (const [collection, rows] of Object.entries(validatedBackup)) {
    for (const row of rows) {
      batch.set(owner.collection(collection).doc(row.id), {
        ...row.data,
        ownerId: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  if (profile && typeof profile === "object" && !Array.isArray(profile)) {
    const allowed = [
      "displayName",
      "currency",
      "timezone",
      "startPage",
      "reminderEnabled",
      "reminderHour",
      "reminderLeadDays",
    ];
    const restored = Object.fromEntries(
      allowed.filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]]),
    );
    if (restored.displayName !== undefined) {
      cleanString(restored.displayName, "profile.displayName", {
        min: 0,
        max: 60,
      });
    }
    if (restored.currency !== undefined && restored.currency !== "usd") {
      throw new HttpsError("invalid-argument", "profile.currency must be usd.");
    }
    if (restored.timezone !== undefined) {
      cleanString(restored.timezone, "profile.timezone", { max: 64 });
    }
    if (
      restored.startPage !== undefined &&
      !["overview", "schedule", "goals"].includes(restored.startPage)
    ) {
      throw new HttpsError("invalid-argument", "profile.startPage is invalid.");
    }
    if (
      restored.reminderEnabled !== undefined &&
      typeof restored.reminderEnabled !== "boolean"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "profile.reminderEnabled must be boolean.",
      );
    }
    if (
      restored.reminderHour !== undefined &&
      (!Number.isInteger(restored.reminderHour) ||
        restored.reminderHour < 0 ||
        restored.reminderHour > 23)
    ) {
      throw new HttpsError("invalid-argument", "profile.reminderHour is invalid.");
    }
    if (
      restored.reminderLeadDays !== undefined &&
      (!Number.isInteger(restored.reminderLeadDays) ||
        restored.reminderLeadDays < 0 ||
        restored.reminderLeadDays > 30)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "profile.reminderLeadDays is invalid.",
      );
    }
    batch.set(owner, { ...restored, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  return { restored: restoredCount };
});

export const deleteAccount = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = requireAuth(request);
  const related = await Promise.all(
    ["donations", "supportRequests", "reminderDeliveries"].map((collection) =>
      db.collection(collection).where("uid", "==", uid).get()
    ),
  );
  const writer = db.bulkWriter();
  related.forEach((snapshot) => {
    snapshot.docs.forEach((document) => writer.delete(document.ref));
  });
  writer.delete(db.collection("rateLimits").doc(`donation_${uid}`));
  writer.delete(db.collection("rateLimits").doc(`support_${uid}`));
  await writer.close();
  await db.recursiveDelete(userRef(uid));
  await getAuth().deleteUser(uid);
  return { deleted: true };
});

export const createDonationCheckout = onCall(
  {
    ...CALLABLE_OPTIONS,
    consumeAppCheckToken: true,
    secrets: [STRIPE_SECRET_KEY, APP_URL],
  },
  async (request) => {
    const uid = requireAuth(request);
    await enforceFixedWindow(`donation_${uid}`, 10, 60 * 60_000);
    const amountCents = integerCents(request.data?.amountCents, {
      min: 100,
      max: 10_000_000,
    });
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const donation = db.collection("donations").doc();
    const appUrl = APP_URL.value().replace(/\/+$/, "");
    await userRef(uid).set({
      ownerId: uid,
      email: normalizeEmail(request.auth.token.email),
      currency: "usd",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      success_url: `${appUrl}/?donation=success#pricing`,
      cancel_url: `${appUrl}/?donation=cancelled#pricing`,
      client_reference_id: uid,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: "Talaan donation" },
        },
      }],
      metadata: { donationId: donation.id, uid },
    });
    await donation.set({
      uid,
      amountCents,
      currency: "usd",
      status: "pending",
      stripeCheckoutSessionId: session.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { checkoutUrl: session.url, donationId: donation.id };
  },
);

export const sendSupportMessage = onCall(
  {
    ...CALLABLE_OPTIONS,
    consumeAppCheckToken: true,
    secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL, SUPPORT_TO_EMAIL],
  },
  async (request) => {
    const uid = requireAuth(request);
    await enforceFixedWindow(`support_${uid}`, 5, 60 * 60_000);
    const subject = cleanString(request.data?.subject, "subject", { max: 120 });
    const message = cleanString(request.data?.message, "message", {
      max: LIMITS.messageLength,
    });
    const email = normalizeEmail(request.auth.token.email);
    const ref = db.collection("supportRequests").doc();
    await ref.set({
      uid,
      email,
      subject,
      message,
      status: "received",
      createdAt: FieldValue.serverTimestamp(),
    });
    const resend = new Resend(RESEND_API_KEY.value());
    const { error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL.value(),
      to: SUPPORT_TO_EMAIL.value(),
      replyTo: email,
      subject: `[Talaan support] ${subject}`,
      text: `Request ${ref.id}\nUser ${uid}\nEmail ${email}\n\n${message}`,
    });
    if (error) {
      await ref.update({ status: "delivery_failed", deliveryError: error.message });
      throw new HttpsError("internal", "The support message could not be delivered.");
    }
    await ref.update({ status: "delivered", deliveredAt: FieldValue.serverTimestamp() });
    return { requestId: ref.id };
  },
);

export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }
    let event;
    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      event = stripe.webhooks.constructEvent(
        request.rawBody,
        request.get("stripe-signature"),
        STRIPE_WEBHOOK_SECRET.value(),
      );
    } catch (error) {
      logger.warn("Rejected Stripe webhook", error);
      response.status(400).send("Invalid signature");
      return;
    }
    const ref = db.collection("webhookEvents").doc(safeEventId("stripe", event.id));
    if (!(await claimWebhook(ref, "stripe", event.type))) {
      response.status(200).send("Already processed");
      return;
    }
    try {
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object;
        const donationId = session.metadata?.donationId;
        const paid =
          event.type === "checkout.session.async_payment_succeeded" ||
          session.payment_status === "paid";
        if (donationId && paid) {
          const donation = db.collection("donations").doc(donationId);
          const donationSnapshot = await donation.get();
          const uid = donationSnapshot.get("uid");
          const batch = db.batch();
          batch.set(donation, {
            status: "paid",
            stripePaymentIntentId: session.payment_intent ?? null,
            paidAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          if (uid) {
            batch.set(userRef(uid), {
              ownerId: uid,
              supporter: {
                active: true,
                since: FieldValue.serverTimestamp(),
              },
              supporterSince: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
          await batch.commit();
        }
      }
      if (
        event.type === "checkout.session.async_payment_failed" ||
        event.type === "checkout.session.expired"
      ) {
        const donationId = event.data.object.metadata?.donationId;
        if (donationId) {
          await db.collection("donations").doc(donationId).set(
            {
              status:
                event.type === "checkout.session.expired" ? "expired" : "failed",
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      }
      if (event.type === "charge.refunded") {
        const charge = event.data.object;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (paymentIntentId) {
          const donations = await db.collection("donations")
            .where("stripePaymentIntentId", "==", paymentIntentId)
            .limit(1)
            .get();
          if (!donations.empty) {
            await donations.docs[0].ref.set({
              status: "refunded",
              refundedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        }
      }
      await ref.update({
        status: "processed",
        leaseUntil: null,
        processedAt: FieldValue.serverTimestamp(),
      });
      response.status(200).send("OK");
    } catch (error) {
      await ref.update({
        status: "failed",
        leaseUntil: null,
        error: String(error).slice(0, 500),
      });
      logger.error("Stripe webhook failed", error);
      response.status(500).send("Webhook failed");
    }
  },
);

export const resendWebhook = onRequest(
  { secrets: [RESEND_WEBHOOK_SECRET] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }
    const eventId = request.get("svix-id");
    const timestamp = request.get("svix-timestamp");
    const signature = request.get("svix-signature");
    if (!verifyResendSignature({
      rawBody: request.rawBody,
      eventId,
      timestamp,
      signature,
      secret: RESEND_WEBHOOK_SECRET.value(),
    })) {
      response.status(400).send("Invalid signature");
      return;
    }
    let event;
    try {
      event = JSON.parse(request.rawBody.toString("utf8"));
    } catch {
      response.status(400).send("Invalid JSON");
      return;
    }
    const ref = db.collection("webhookEvents").doc(safeEventId("resend", eventId));
    if (!(await claimWebhook(ref, "resend", event.type))) {
      response.status(200).send("Already processed");
      return;
    }
    try {
      if (["email.bounced", "email.complained"].includes(event.type)) {
        const to = event.data?.to ?? [];
        const recipients = Array.isArray(to) ? to : [to];
        for (const rawEmail of recipients) {
          const email = normalizeEmail(rawEmail);
          const users = await db.collection("users").where("email", "==", email).get();
          await Promise.all(users.docs.map((user) => user.ref.set({
            emailSuppressed: true,
            emailSuppressionReason: event.type,
            emailSuppressedAt: FieldValue.serverTimestamp(),
          }, { merge: true })));
        }
      }
      await ref.update({
        status: "processed",
        leaseUntil: null,
        processedAt: FieldValue.serverTimestamp(),
      });
      response.status(200).send("OK");
    } catch (error) {
      await ref.update({
        status: "failed",
        leaseUntil: null,
        error: String(error).slice(0, 500),
      });
      logger.error("Resend webhook failed", error);
      response.status(500).send("Webhook failed");
    }
  },
);

export const processSchedules = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "UTC",
    secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL],
  },
  async () => {
    const now = Timestamp.now();
    const generationHorizon = Timestamp.fromMillis(
      now.toMillis() + 31 * 24 * 60 * 60_000,
    );
    const rules = await db.collectionGroup("recurringRules")
      .where("enabled", "==", true)
      .where("nextRunAt", "<=", generationHorizon)
      .limit(100)
      .get();

    for (const snapshot of rules.docs) {
      const owner = snapshot.ref.parent.parent;
      if (!owner) continue;
      const rule = snapshot.data();
      try {
        const result = dueOccurrences(rule, generationHorizon.toDate(), 50);
        const batch = db.batch();
        for (const occurrence of result.occurrences) {
          const event = owner.collection("events")
            .doc(occurrenceId(snapshot.id, occurrence));
          const reminder = Number.isInteger(rule.reminderMinutesBefore)
            ? {
                reminderAt: Timestamp.fromMillis(
                  occurrence.getTime() - rule.reminderMinutesBefore * 60_000,
                ),
                reminderSent: false,
              }
            : {};
          batch.set(event, {
            ...assertPlainObject(rule.event, "recurring rule event"),
            ...reminder,
            ownerId: owner.id,
            recurringRuleId: snapshot.id,
            occurrenceAt: Timestamp.fromDate(occurrence),
            date: Timestamp.fromDate(occurrence),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: false });
        }
        batch.update(snapshot.ref, {
          nextRunAt: Timestamp.fromDate(result.nextRunAt),
          anchorDay: result.anchorDay,
          anchorMonth: result.anchorMonth,
          enabled: !result.exhausted,
          updatedAt: FieldValue.serverTimestamp(),
        });
        await batch.commit();
      } catch (error) {
        logger.error("Recurring rule processing failed", {
          path: snapshot.ref.path,
          error,
        });
      }
    }

    const reminders = await db.collectionGroup("events")
      .where("reminderSent", "==", false)
      .where("reminderAt", "<=", now)
      .limit(100)
      .get();
    const resend = new Resend(RESEND_API_KEY.value());
    for (const eventSnapshot of reminders.docs) {
      const owner = eventSnapshot.ref.parent.parent;
      if (!owner) continue;
      const event = eventSnapshot.data();
      const delivery = db.collection("reminderDeliveries")
        .doc(`${owner.id}_${eventSnapshot.id}`);
      const claimed = await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(delivery);
        const leaseUntil = existing.get("leaseUntil");
        if (
          existing.exists &&
          (
            ["sent", "suppressed"].includes(existing.get("status")) ||
            (
              existing.get("status") === "processing" &&
              leaseUntil?.toMillis() > now.toMillis()
            )
          )
        ) {
          return false;
        }
        transaction.set(delivery, {
          uid: owner.id,
          eventId: eventSnapshot.id,
          status: "processing",
          leaseUntil: Timestamp.fromMillis(now.toMillis() + 5 * 60_000),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
      });
      if (!claimed) continue;
      try {
        const user = await owner.get();
        const data = user.data() ?? {};
        if (!data.email || data.emailSuppressed) {
          await Promise.all([
            delivery.update({
              status: "suppressed",
              leaseUntil: null,
              updatedAt: FieldValue.serverTimestamp(),
            }),
            eventSnapshot.ref.update({
              reminderSent: true,
              reminderSentAt: FieldValue.serverTimestamp(),
            }),
          ]);
          continue;
        }
        const { error } = await resend.emails.send(
          {
            from: RESEND_FROM_EMAIL.value(),
            to: data.email,
            subject: `Reminder: ${event.name}`,
            text: `${event.name} is scheduled for ${event.date.toDate().toISOString()}.`,
          },
          { idempotencyKey: delivery.id },
        );
        if (error) throw new Error(error.message);
        await Promise.all([
          delivery.update({
            status: "sent",
            leaseUntil: null,
            sentAt: FieldValue.serverTimestamp(),
          }),
          eventSnapshot.ref.update({
            reminderSent: true,
            reminderSentAt: FieldValue.serverTimestamp(),
          }),
        ]);
      } catch (error) {
        await delivery.update({
          status: "failed",
          leaseUntil: null,
          error: String(error).slice(0, 500),
          updatedAt: FieldValue.serverTimestamp(),
        });
        logger.error("Reminder delivery failed", error);
      }
    }
  },
);
