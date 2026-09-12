# Backend rollout

This document records the backend work introduced on the
`backend-features` branch.

## Architecture

Talaan remains a Vite single-page application. Firebase now provides:

- Google Authentication for signed-in accounts.
- Firestore for authenticated workspace synchronization.
- Cloud Functions for privileged account and integration operations.
- Cloud Scheduler for recurring-event generation and reminder delivery.
- App Check enforcement for callable functions.
- Secret Manager bindings for Stripe and Resend credentials.

Unsigned `demo` and `personal` workspaces remain local to the browser. A signed-in
workspace is stored under the user's Firebase UID.

## Client data layer

The modules under `src/data/` provide validation, Firestore conversion, local
repositories, cloud repositories, and React workspace state.

The data layer:

- Stores money as dollars in UI state and integer cents in Firestore.
- Subscribes authenticated users to real-time Firestore updates.
- Preserves local-only operation when Firebase is not configured.
- Prompts before copying a validated personal workspace on first sign-in.
- Never migrates demo seed data.
- Limits automatic migration to the same bounded workspace size supported by
  cloud export and restore.

## Firestore model

User-controlled documents are scoped below `users/{uid}`:

- `users/{uid}`: profile, currency, supporter state, and reminder preferences.
- `users/{uid}/events/{eventId}`: income, expenses, dates, completion status,
  reminder state, and generated occurrence metadata.
- `users/{uid}/goals/{goalId}`: goal totals and contribution history.
- `users/{uid}/recurringRules/{ruleId}`: recurrence schedule and event template.
- `users/{uid}/guardrails/{guardrailId}`: spending limits.

Server-only operational collections:

- `donations`
- `supportRequests`
- `webhookEvents`
- `reminderDeliveries`
- `rateLimits`

Firestore rules enforce UID ownership, allowed fields, value bounds, immutable
ownership, supported statuses, and server-only access boundaries. Account
deletion must use the callable function so subcollections and operational
records are removed together.

## Cloud Functions

Callable functions:

- `exportWorkspace`: returns a bounded, timestamp-safe cloud backup.
- `restoreWorkspace`: validates and atomically replaces workspace documents.
- `deleteAccount`: removes workspace and operational records, then deletes the
  Firebase Authentication account.
- `createDonationCheckout`: creates a rate-limited Stripe Checkout session.
- `sendSupportMessage`: validates and rate-limits authenticated support email.

HTTP functions:

- `stripeWebhook`: verifies Stripe signatures and handles successful, failed,
  expired, and refunded donations idempotently.
- `resendWebhook`: verifies Resend signatures and suppresses reminder delivery
  after bounces or complaints.

Scheduled function:

- `processSchedules`: generates recurring events up to 31 days ahead and sends
  due reminders through Resend. Deterministic occurrence IDs and leased delivery
  records prevent duplicates.

## Product changes

- Authenticated events, goals, profiles, settings, and contribution history now
  synchronize across devices.
- Schedule entries can repeat weekly, monthly, or yearly.
- Monthly spending guardrails display warnings without blocking entries.
- Users can configure reminder timezone, delivery hour, and lead days.
- Signed-in users can make pay-what-you-want donations through Stripe.
- Successful payments activate optional supporter status.
- Contact and in-app help forms send through the protected support function.
- Cloud workspaces support export, restore, and permanent account deletion.

## Security controls

- Callable functions require Firebase Authentication and App Check.
- Donation and support calls consume limited-use App Check tokens.
- Stripe and Resend webhooks verify raw request signatures.
- Webhook and reminder processing is idempotent.
- Donation and support creation use fixed-window rate limits.
- Financial values are excluded from operational logs.
- External credentials are loaded only from Firebase Secret Manager.

## Verification

Run:

```sh
nvm use 24
npm ci
npm run functions:install
npm run lint
npm test
npm run test:rules
npm run build
```

The Firestore emulator requires Java 21 or another supported Java runtime.

At implementation handoff:

- ESLint completed without warnings.
- Frontend and Cloud Functions unit tests passed.
- Firestore authorization tests passed in the emulator.
- The production Vite build passed.
- The Cloud Functions entry module loaded successfully.

## Deployment requirements

Before production deployment:

1. Enable Google Authentication, Firestore, App Check, Cloud Functions, Cloud
   Scheduler, Secret Manager, and Firebase Blaze billing.
2. Copy `.firebaserc.example` to `.firebaserc` and set the Firebase project ID.
3. Configure the public variables listed in `.env.example`.
4. Configure every Firebase secret listed in `README.md`.
5. Verify the Resend sending domain.
6. Deploy functions, rules, and indexes with `npm run functions:deploy`.
7. Register the deployed Stripe and Resend webhook URLs.
8. Add the public Firebase variables to the frontend hosting environment.
9. Perform production smoke tests for authentication, synchronization,
   reminders, donations, support, backup, restore, and account deletion.

Do not commit `.firebaserc`, environment files, API keys, webhook secrets, or
downloaded workspace backups.
