> The v2 backend implementation supersedes the legacy collection/write model below. See [BACKEND_IMPLEMENTATION_PLAN.md](BACKEND_IMPLEMENTATION_PLAN.md) and [BACKEND_RELEASE_RUNBOOK.md](BACKEND_RELEASE_RUNBOOK.md) for active generations, commands, backup jobs, and rollout gates. Legacy clients remain supported before migration.

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

Verification results are recorded below with their date and scope. Local
checks do not establish that a deployed environment or provider integration works.

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

## Operational limits

| Feature | Enforced limit |
| --- | --- |
| Export and restore | 240 documents across events, goals, recurring rules, and guardrails; profile excluded |
| Atomic restore | Existing document count + incoming count + 1 must be at most 500 |
| Donation checkout | 10 attempts per UID per hour; USD $1–$100,000 inclusive |
| Support | 5 attempts per UID per hour; subject at most 120 characters; message at most 4,000 |

Donation and support use fixed windows, counted before payload validation.
Excess calls return `resource-exhausted`; invalid payloads return
`invalid-argument`. Wait for the window to reset before retrying rate-limited
calls. Oversized exports fail; oversized restores fail before replacing data.
A valid 240-document backup can still fail to restore over a large workspace
because deleting existing documents counts toward the atomic-write limit.
Automatic personal-workspace migration also uses the 240-document bound.

## Scheduler timing

`processSchedules` runs every 15 minutes on a UTC scheduler. Each invocation
selects at most 100 enabled rules due within the next 31 days, generates up to
50 occurrences per selected rule, and selects at most 100 due reminder events.
Backlogs may require multiple runs; delivery is not guaranteed at an exact minute.
The client computes reminder timestamps from the selected timezone, delivery
hour, and lead days. Recurring rules store a calculated minute offset, which
the scheduler subtracts from each occurrence; it does not recalculate timezone
or daylight-saving transitions for every occurrence.

## Deployment smoke tests

Use a staging project, Stripe test mode, a controlled email recipient, and
throwaway accounts before repeating appropriate checks in production.

1. Sign in with Google; create an event and goal, then verify both in a second
   browser session. Sign out and verify the local workspace remains accessible.
2. Create a personal plan, sign in, accept migration, and confirm the copied
   entries. Repeat with demo data and verify it is not migrated.
3. Configure reminders and a repeating expense. After a scheduler run, inspect
   generated occurrences and delivery records. Verify the reminder arrives;
   repeat processing and confirm no duplicate email or occurrence is created.
4. Complete a Stripe test donation. Verify the webhook updates the donation to
   paid and activates supporter status. Exercise expiration, asynchronous
   failure, and refund events; replay an event to check idempotency.
5. Send a support message and verify its receipt and delivered request status.
   Exceed the support limit with the test account and confirm an error appears.
6. Send signed Resend bounce/complaint test events; verify `emailSuppressed`
   becomes true and subsequent reminder processing suppresses delivery.
7. Export a small workspace, change an entry, and restore the backup. Confirm
   its contents replace workspace data. Try invalid and oversized backups and
   verify existing data remains intact.
8. Delete a throwaway account. Confirm its Auth user, workspace subcollections,
   and associated operational records are removed.
9. Verify unauthenticated or missing-App-Check callable requests are rejected,
   and one user cannot read or write another user's Firestore documents.

For emulator routing, sign in through the Auth emulator popup, add an entry,
and confirm it in the Firestore emulator UI. Inspect browser network requests
for ports 9099, 8080, and 5001 when invoking a callable. Stop the emulators and
confirm operations fail rather than writing to the cloud.

## Verification — 2026-09-12

- Node 24.21.0: `npm run lint` passed; all 15 unit tests passed.
- `npm run build` passed with Vite's warning about a chunk exceeding 500 kB.
- SDK initialization checks passed for development emulator endpoints and
  production cloud endpoints, with both development flags set to true. The
  production path did not enable the App Check debug token.
- `git diff --check` passed.
- Node 22.23.2 installed through nvm; all 12 Functions unit tests passed and
  all eight exported function definitions loaded successfully under Node 22.
- Java 21.0.12.1 downloaded to `/private/tmp/talaan-java21/Contents/Home`.
  All three Firestore authorization tests passed with project `demo-talaan`.
- `npm run test:emulators` passed under Node 22 with Auth, Firestore, and
  Functions emulators: anonymous test sign-in, owned event write/read,
  cross-user read denial, and authenticated callable rejection without App Check.
  Anonymous sign-in is used only as an emulator test fixture; this does not
  verify the product's Google popup flow.
- The emulator reported an outdated `firebase-functions` dependency; a major
  dependency upgrade has not been included in this runtime/configuration change.
- Browser Google sign-in, valid App Check token exchange, successful protected
  callable operations, scheduled delivery, and provider smoke tests still need
  a configured staging environment. No deployment was performed.

To repeat the emulator tests on this machine while the temporary Java directory
exists:

```sh
nvm use 22
export JAVA_HOME=/private/tmp/talaan-java21/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
npm run test:rules -- --project demo-talaan
npm run test:emulators
```

Java was unpacked for verification, not installed system-wide. Temporary-directory
cleanup may remove it; install a persistent Java 21 runtime for ongoing work.
