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

## Commands

- `npm run dev` starts Vite.
- `npm run build` creates the production frontend.
- `npm run lint` checks frontend, functions, tests, and configuration.
- `npm test` runs shared and Cloud Functions unit tests.
- `npm run test:rules` runs Firestore authorization tests in the emulator.
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

## Data and security

- Unsigned demo and personal plans remain in browser storage.
- Signed-in plans synchronize to `users/{uid}` and UID-owned subcollections.
- Firestore stores money as integer cents.
- First sign-in offers to copy a validated personal plan; demo data is never
  migrated.
- Operational collections for payments, support, reminders, and webhook
  idempotency are server-only.
- App Check should be enabled and its site key supplied before production.

Backups contain financial planning data. Treat downloaded JSON files as
sensitive and do not commit environment files or Firebase secrets.
