# Talaan

Talaan is a local-first budgeting application with optional authenticated cloud
workspaces. The frontend uses React and Vite. Firebase provides Google
Authentication, Firestore synchronization, callable functions, scheduled jobs,
and webhook endpoints.

See [BACKEND.md](./BACKEND.md) for the implemented architecture, data model,
security controls, function inventory, and deployment checklist.

## Local setup

1. Use Node 24 for frontend tooling: `nvm use 24`.
2. Install frontend dependencies: `npm ci`.
3. Install Cloud Functions dependencies: `npm run functions:install`.
4. Copy `.env.example` to `.env.local` and add the Firebase web-app values.
5. Run `npm run dev`.

Without Firebase variables, the demo and personal workspaces continue to work
locally. Authenticated workspaces require Authentication and Firestore.

## Runtime requirements

Frontend tooling uses Node 24. Functions target Node 22 in `firebase.json` and
`functions/package.json`. Use `nvm install 22` and `nvm use 22` in the Functions
emulator terminal. Firestore emulation requires Java 21 or a supported newer
runtime. Node 20 was replaced because it is deprecated; see Google's
[runtime support schedule](https://docs.cloud.google.com/functions/docs/runtime-support).

## Local emulators

Set `VITE_FIREBASE_USE_EMULATORS=true` in `.env.local`, with all four Firebase
web-app values populated. The CLI project in `.firebaserc` must match
`VITE_FIREBASE_PROJECT_ID`. Run `npm run emulators` in a Node 22 terminal and
`npm run dev` in a separate Node 24 terminal.

The development client connects Auth to `127.0.0.1:9099`, Firestore to
`127.0.0.1:8080`, and Functions to `127.0.0.1:5001`. Open the emulator UI at
`http://127.0.0.1:4000`. Restart Vite after changing environment variables.
Unavailable emulators cause requests to fail; there is no cloud fallback.
With the flag disabled, configured clients use cloud services. Production
builds ignore both development flags.

Callable functions still enforce App Check. Supply the App Check site key and
set `VITE_FIREBASE_APPCHECK_DEBUG=true`. Register the debug token printed in
the browser console in the Firebase app's App Check debug-token settings,
then reload. This requires a real Firebase App Check registration and network
access; it is not a fully offline setup. See the
[debug provider guide](https://firebase.google.com/docs/app-check/web/debug-provider).
Keep debug tokens private and revoke them when no longer needed.

Put local overrides for the secrets below in `functions/.secret.local` as
`NAME=value` lines. Use Stripe test credentials and a dedicated Resend test
recipient: emulators do not emulate external payment or email providers.
Set local `APP_URL` to the frontend origin. Scheduled jobs and provider
webhooks need separate integration verification as described in BACKEND.md.

## Commands

- `npm run dev` starts Vite.
- `npm run build` creates the production frontend.
- `npm run lint` checks frontend, functions, tests, and configuration.
- `npm test` runs shared and Cloud Functions unit tests.
- `npm run test:rules` runs Firestore authorization tests in the emulator.
- `npm run test:emulators` checks Auth, Firestore, and callable rejection on the
  isolated `demo-talaan` project; requires Node 22 and Java 21, no provider secrets.
- `npm run emulators` starts the Firebase emulator suite.
- `npm run functions:deploy` deploys functions, rules, and indexes.

## Firebase configuration

Create a Firebase project, enable Google Authentication, create Firestore, and
register a web app. Copy `.firebaserc.example` to `.firebaserc`, replacing the
placeholder project ID. Cloud Functions and Cloud Scheduler require billing to
be enabled.

Set production secrets with the Firebase CLI:

```sh
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set RESEND_WEBHOOK_SECRET
firebase functions:secrets:set RESEND_FROM_EMAIL
firebase functions:secrets:set SUPPORT_TO_EMAIL
firebase functions:secrets:set APP_URL
```

`RESEND_FROM_EMAIL` must use a verified Resend domain. `APP_URL` is the
production frontend origin. Register the deployed `stripeWebhook` and
`resendWebhook` HTTPS function URLs with their providers.

Subscribe Stripe to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, and `charge.refunded`. Subscribe Resend to
`email.bounced` and `email.complained`. Use the signing secret for each specific
endpoint and environment, then redeploy functions after changing secrets.

Functions deploy in `us-central1`. Keep `VITE_FIREBASE_FUNCTIONS_REGION` aligned
with `setGlobalOptions` in `functions/src/index.js`; changing the client value
alone does not move the backend. Register the web app with App Check's
reCAPTCHA v3 provider and supply its site key. Callable enforcement is already
mandatory in code, including limited-use tokens for donation and support.
Add the frontend domain to Firebase Authentication's authorized domains and
configure the production reCAPTCHA domain. Follow the smoke tests in BACKEND.md.

## Data and security

- The sample household uses in-memory state and resets on reload. Personal plans remain in browser storage.
- Signed-in plans synchronize to `users/{uid}` and UID-owned subcollections.
- Firestore stores money as integer cents.
- First sign-in offers to copy a validated personal plan; demo data is never
  migrated.
- Operational collections for payments, support, reminders, and webhook
  idempotency are server-only.
- App Check should be enabled and its site key supplied before production.

Backups contain financial planning data. Treat downloaded JSON files as
sensitive and do not commit environment files or Firebase secrets.

## Desktop-first design roadmap

See [DESIGN_PLAN.md](./DESIGN_PLAN.md) for the eight-phase redesign plan,
Phase 1 navigation and component specifications, route compatibility, and
shared sample-data contract. All eight phases are complete. The theme and palette
are preserved, with desktop layouts and responsive tablet/mobile adaptations.

## Advanced planning design previews

Open the sample workspace at `/#dashboard/overview`. Use **Plan** for category
budgets and what-if scenarios, **Schedule → Subscriptions** for renewal previews,
**Goals → Savings roadmap** for estimates, and **Insights** for cash flow and
monthly reviews. **Design review** is available in desktop utilities and the
mobile Account page for isolated populated, empty, loading, and error examples.

The sample household contains completed August and planned September 2026
entries in USD. September income is $3,800, spending $2,556, and savings $450,
leaving $794. Operating cash starts at $1,240 and closes at $2,034. Sample edits
stay during workspace navigation; **Reset sample** or reload restores defaults.
Goal contributions and schedule edits update the shared sample figures.
Scenario changes and cancellation simulations remain isolated from the base plan.

Personal and cloud workspaces remain separate. Advanced analysis and planning
screens still use explicitly labeled sample data there; this redesign adds no
backend integration. Existing personal/cloud record operations remain available.
No preview action cancels a service or transfers money.

Verification: `npm test` covers routes, numerical reconciliation, forecasts,
savings updates, validators, and existing function logic. Browser checks cover
feature discovery, history, retained trial state, resets, contribution recording,
keyboard drawers, and responsive layouts. See the final verification record and
limitations in [DESIGN_PLAN.md](./DESIGN_PLAN.md).
