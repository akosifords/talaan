# Backend rollout and recovery

Last updated: 2026-09-20. Local implementation checks passed. Staging Auth and Firestore are provisioned; Four workspace Functions are deployed; App Check is registered; test cohort and provider setup remain pending as recorded below. **No production deployment has been performed.**

## Staging setup checkpoint — September 20, 2026

- Project: `talaan-staging-fordan` (`391232524801`), display name **Talaan Staging**. This is a newly created, isolated project.
- Web app: `1:391232524801:web:b240561e174775a5af6600`, display name **Talaan Staging Web**.
- Firestore: `(default)`, Standard edition, native mode, `us-central1`. Existing project rules and indexes deployed successfully.
- Authentication: Google sign-in enabled. Authorized domains are `localhost`, `talaan-staging-fordan.firebaseapp.com`, and `talaan-staging-fordan.web.app`. Anonymous and password providers remain disabled.
- Deployment configuration: `firebase.staging.json`. Always pass `--project talaan-staging-fordan --config firebase.staging.json` explicitly.
- Local frontend configuration: `.env.staging.local`; Functions rollout flags: `functions/.env.talaan-staging-fordan`. Both are ignored by Git. New workspace enablement is restricted to the project owner’s verified staging UID.
- App Check terms were accepted after explicit user approval. The web app is registered with reCAPTCHA Enterprise, with a one-hour token TTL. Its score-based key is restricted to `talaan-staging-fordan.web.app` and `talaan-staging-fordan.firebaseapp.com`; domain verification is enabled, fixed test scores and challenges are disabled.
- Billing was added by the project owner. The next deployment successfully passed the billing prerequisite. Full entry-point analysis also requires Stripe/Resend secrets, so the workspace-only staging package below is used while provider setup is pending.
- Workspace Functions `enableWorkspace`, `loadWorkspace`, `workspaceCommand`, and `workspaceBackup` are ACTIVE in `us-central1`. The generated staging entry point limits each to two instances. Artifact Registry deployment images have a seven-day cleanup policy. Live unauthenticated POST checks against all four endpoints returned HTTP 401 / `UNAUTHENTICATED`; authenticated App Check verification remains pending.
- The App Check site key and `VITE_FIREBASE_APPCHECK_PROVIDER=enterprise` are saved in ignored `.env.staging.local`. Approved test UIDs/recipient emails are still pending. No test messages were sent and no user records migrated.

### Workspace-only staging deployment

The full Functions entry point declares Stripe/Resend secrets before Firebase filters selected functions. Until those providers are configured, package the same workspace sources behind a separate entry point:

```sh
node scripts/prepare-staging-functions.mjs
npm ci --prefix .firebase/staging-workspace-functions --ignore-scripts --no-audit --no-fund
npx -y firebase-tools@latest deploy --only functions:workspaceCommand,functions:loadWorkspace,functions:workspaceBackup,functions:enableWorkspace --project talaan-staging-fordan --config .firebase/workspace-deploy.json --non-interactive
```

Generated files stay under ignored `.firebase/`. This package sets a staging maximum of two instances per function. It does not contain scheduler, account deletion, legacy backup, payment, or support endpoints. Never deploy this package with an unfiltered `--only functions` once other functions exist. Complete provider credentials and deploy the full source before claiming B8 complete.

Staging Hosting is configured in `firebase.staging.json`. Build with `npm run build -- --mode staging`, then deploy Hosting using that configuration and the explicit staging project. The `X-Robots-Tag` header discourages indexing but does not make a staging website private.

Run the current preflight with:

```sh
node --env-file=.env.staging.local scripts/staging-preflight.mjs
```

It currently reports the missing test cohort. This only validates configuration presence; the live acceptance checklist is still required.

## Release gates

B1–B7 implementation is present in this checkout. B8 includes CI checks, a configuration preflight and this runbook. Live B8 verification remains blocked until approved test accounts/recipients and provider credentials are configured and live acceptance checks pass. Do not call the release complete based on emulator results alone.

Required external inputs:

- Staging Firebase project ID, distinct from production; region defaults to `us-central1`.
- Google Auth authorized domains and controlled test accounts on two devices.
- App Check site registration and the staging site key. Production builds must not use debug App Check.
- Verified Resend domain/from address and controlled recipient addresses; Stripe test-mode configuration and staging webhook endpoints.
- An owner for alert routing and the proposed first production cohort. Production rollout remains a separate approval/execution step.

## Local verification

Use Node 22 and Java 21. Install dependencies with `npm ci` and `npm ci --prefix functions`.

```sh
npm run lint
npm test
npm run build
npm run test:backend
npm run test:emulators
npm run check:staging
```

`test:backend` uses the demo Firestore emulator. It verifies protected records, migration recovery, transactional accounting, scheduling, and large backup/restore. `test:emulators` additionally starts Auth and Functions and checks App Check rejection. The staging preflight intentionally fails when staging configuration is absent; it never deploys or displays credentials. `.github/workflows/backend-checks.yml` runs the local gates on pull requests and main pushes without deployment credentials.

## Recorded local results — September 15, 2026

- ESLint and production build passed. Vite retains a non-blocking bundle-size warning (approximately 696 KB before gzip).
- Unit tests: 35 passed across the browser/domain and Functions suites.
- Firestore/backend tests: 14 passed, including every v2 collection ownership rule, empty-account preparation, atomic accounting, migration recovery, recurring generation, reminder rebuilding, and backup/restore above 240 records.
- Auth/Functions smoke test: 1 passed. All protected workspace callables reject missing App Check with valid emulator authentication. Valid App Check still requires live staging.
- Isolated browser workspace: a $500 category limit survives reload; a $150 saved balance against a $100 target is retained; adding $25 creates one linked event and reopening it restores the balance to $150. A $100 cash checkpoint projects $75 after the planned saving.
- Same-generation cloud refreshes preserve mounted editors and drafts. Conflict controls let users explicitly reload saved event/goal records. Live two-device verification is still pending.
- Staging preflight failed as expected: staging project, Firebase frontend configuration, App Check site key, and approved test UIDs/emails are absent. No external provider delivery or deployment was attempted.

Local recurrence is projected in forecasts. Materializing future schedule events and delivering reminders require the cloud scheduler.

## Storage and rollout compatibility

The active business data lives under `users/{uid}/workspaceVersions/{generation}/{collection}/{id}`. The user document owns `schemaVersion`, `activeWorkspaceVersion`, `workspaceRevision`, `ledgerRevision`, `backendEnabled`, migration metadata and the job lock. Clients cannot set these fields. Version 2 financial writes go through `workspaceCommand`; the browser cannot directly write financial collections.

`users/{uid}/operations/{requestId}` stores permanent command fingerprints and results outside generations. A request carries its generation and expected record revision. Same request/payload returns the committed result; changed payload is rejected; a fresh request targeting a replaced generation is rejected. Restore never imports, clears or downgrades command receipts.

The operator migration requires a `demo-*` emulator project or explicit `TALAAN_ALLOW_STAGING_MIGRATION=true` with `GCLOUD_PROJECT` exactly matching the supplied `TALAAN_STAGING_PROJECT_ID`. No default production target is allowed. Example, while the emulator is running:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-talaan node functions/scripts/migrate-workspace.js TEST_UID dry-run 2026-09-15
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-talaan node functions/scripts/migrate-workspace.js TEST_UID apply 2026-09-15
```

Repeat `apply` to resume. The migration creates per-record backups, verifies copied data and only then changes the active pointer. It retains originals. A `rollback` is permitted only before v2 writes begin; afterward, use staged restore/reconciliation. Source migration reads 200-record pages, commits 40-record batches and verifies 100-record batches. It supports up to 10,000 source records and reports excess or ambiguous history without filtering it. Larger migrations require an operator bulk process.

Goals retain `openingCents` and `openingDate`. Historical contribution arrays are included in the opening balance and are never converted into duplicate cash events. A legacy completed linked event is marked `legacyIncludedInOpening`; edits that would alter its accounting require an explained adjustment. New contributions are completed savings events. Categories map by exact original names. Missing operating cash is never inferred from goal assets.

## Staging deployment order

1. Set the explicit staging environment values required by `npm run check:staging`. Confirm the project belongs to staging, then run the preflight.
2. Deploy compatible Firestore rules/indexes and Functions to that explicit project. Wait for all indexes to become ready. Do not set a default production Firebase alias in this checkout.
3. Configure secrets via Firebase/Google Secret Manager, without committing them. Register protected callable origins and webhook destinations.
4. Keep `WORKSPACE_V2_ENABLED=false` and `backendEnabled=false` until the staging account preparation is approved. `enableWorkspace` only initializes empty accounts, is App Check protected, and requires both the environment flag and membership in `WORKSPACE_V2_ALLOWED_UIDS` outside emulators. Existing nonempty accounts require verified migration.
5. Set `WORKSPACE_V2_ENABLED=true` and `WORKSPACE_V2_ALLOWED_UIDS` to the approved test cohort for staging and `VITE_WORKSPACE_V2_ENABLED=true` in the staging frontend build. Enable only the approved users. Rebuild/release the frontend after backend/index readiness.
6. Run every live check below and record the deployed commit, project, test UID aliases, timestamps and outcomes. Keep monetary payloads and credentials out of the evidence log.
7. Request the separate production execution decision only after the live gates are satisfied.

## Live acceptance checklist

- Real Google sign-in and sign-out; account switch never reveals another user's records or drafts.
- Valid App Check permits authenticated commands; missing/invalid tokens and foreign-account reads/writes are denied.
- Two-device event and goal edits synchronize. Stale edits retain their draft and show a conflict; reload provides current data.
- Double submission/lost response creates one contribution. Complete, reopen, edit, remove and undo maintain matching event/goal totals.
- Over-target goals stay over target. Adjustments require a reason. Goal archival preserves history.
- Budgets, category names, scenarios, subscription lifecycle, roadmap and preferences persist across reloads.
- A changed scenario baseline requires rebase. Budget/scenario edits never create money events.
- Monthly/yearly anchors, cancellation effective dates, overlapping generation, edited occurrences and reminder timezone/DST cases reconcile.
- Controlled reminders deliver once; suppressed, failed and retried deliveries behave correctly. No real service is cancelled.
- Cash flow starts from explicit operating cash, separates goal assets and savings, shows negative balances, and labels earlier unconfirmed events. Monthly review separates planned/completed totals.
- Export/restore over 240 records, interruption/resume, checksum rejection, cross-user job isolation and stale command retries pass. Active data remains intact before restore activation.
- Local import is explicit, excludes sample records and requires an empty destination. Old-client writes are blocked after migration.
- Account deletion removes all generations, backups, jobs, receipts, related operational documents and the Auth account.
- Stripe test checkout/webhooks and support request regression pass with approved recipients. Emulator signature/unit tests do not substitute for these provider checks.

## Backup architecture and limits

Backup format 3 is independent from document schema 2. A manifest carries page hashes and record count. Every business collection is included, including preferences, goal plans, cash checkpoints, recurring rules and adjustment history. Receipts and email delivery state stay server-controlled.

Exports hold a workspace write lock while copying consistent pages into a private job. Download is resumable from the completed job. Restore uploads verified pages into a new generation, checks duplicates/references/accounting, and changes the pointer atomically after completion. The previous generation is retained. Job ownership always derives from the authenticated UID.

A page contains at most 20 records, with an 800 KB server page limit; files in the browser are limited to 20 MB. The manifest supports at most 100,000 records. Complete workspace reads and restore reconciliation currently support at most 10,000 records per collection, read in 200-record pages; excess produces an explicit error rather than partial totals. Goal history is displayed in 50-row increments. These are explicit operational limits, not silent truncation.

If a network failure occurs, retry the same operation/file to resume its job. Settings & data offers **Cancel pending backup operation** to release a failed job's lock. Aborting does not activate or delete staged records. Do not manually clear a lock while its worker is running. Pending reminder deliveries block migration/export/deletion until they finish; investigate a stranded lease before releasing it.

Original generations, migration backups and completed jobs are retained until account deletion. No automatic irreversible retention purge is enabled. Define and approve a retention policy before broad rollout. Account deletion is recursive, includes those retained artifacts, and fences new writes first.

## Operations and rollback

Structured logs use `workspace.command`, `workspace.backup`, `workspace.scheduler`, `workspace.reminder`, and `workspace.reminder-reschedule`. They report operation names, outcome codes, duration and batch fullness without financial payloads. Scheduler cursors rotate through bounded pages, including during coexistence with retained generations. Reminder preference changes schedule bounded recalculation of existing events.

Before staging release, configure log-based metrics/alerts in the target project:

- Command `internal` errors or sustained `aborted` conflicts above the agreed baseline.
- Reminder failures or repeated full scheduler batches over consecutive runs.
- Backup jobs remaining locked beyond the expected duration; investigate before retry/abort.
- Callable latency/error rate, Functions quota, Firestore read/write costs and App Check rejection spikes.

For rollback, disable `backendEnabled` for the affected cohort and hide new-account enablement. Keep the compatible v2 reader deployed. Pause scheduling for that cohort with the same flag. Do not downgrade the schema after writes or replay an old backup in place. Restore verified pages into a new generation, reconcile, then re-enable users. Alert routing and actual staging dashboards are not configured by this local checkout.

### App Check verification status

Registration is confirmed in Firebase Console. The staging client supports Enterprise while defaulting to v3 for existing configurations. Lint and the staging build passed. Protected workspace callables already enforce App Check. Firestore-wide enforcement remains in monitoring until a valid signed-in browser flow is verified. Registration alone does not prove successful token issuance or authenticated commands.

Staging Hosting release completed at https://talaan-staging-fordan.web.app. Browser smoke check loaded the branded home page and sign-in action without captured startup warnings or errors. This does not replace valid App Check token and signed-in workspace verification.

## Live workspace verification — September 21, 2026

Google sign-in completed successfully for the project owner's staging account. Firebase Authentication confirms a verified Google identity. That account alone is now in the `enableWorkspace` UID allowlist. The staging frontend exposes activation, while the server rejects accounts outside the allowlist. Email recipients remain unconfigured; no messages or payments were sent.

The following operations succeeded through the deployed browser UI and App Check-enforced workspace callables:

- Initialize the empty workspace using `enableWorkspace`; the migration prompt disappeared and the connected profile loaded.
- Create `STAGING TEST — savings verification` with a $100 target and $150 opening balance. The over-target balance remained intact.
- Record a $25 contribution. The goal became $175 and exactly one completed $25 savings entry appeared in Schedule.
- Reload the browser. The $175 balance and one contribution row persisted.
- Reopen the contribution as Planned. The goal returned to $150 and the completed contribution history cleared.

The labeled goal and one planned test event are retained in staging for inspection. No production data was touched. Existing captures include earlier transient Firestore listen warnings; they did not prevent the later successful activation/save/reload flow.

Still pending: second-account isolation and two-device conflict checks; live backup/restore and deletion; scheduler/reminder deployment and controlled delivery; Stripe/support provider configuration; monitoring alerts; and a separate production release decision. Firestore-wide App Check enforcement remains in monitoring. Successful protected callable execution verifies that valid Auth/App Check can pass, but does not complete the full B8 acceptance matrix.

## Live backup verification — September 21, 2026

Scope: staging owner's existing test workspace in `talaan-staging-fordan`; no production changes.

- The deployed UI completed two exports and displayed “Your backup is ready.” Each completed server export contains three records across three pages.
- The in-app browser did not expose a downloadable file/event. A read-only authenticated Firestore retrieval reconstructed the latest completed export, preserving its manifest and page hashes. The application validator accepted it. Browser file delivery remains unverified.
- Recovery copy saved privately at `.firebase/verification/staging-before-restore.json` (ignored by Git, mode 0600). A separate copy with an altered page hash was rejected by the restore UI before activation.
- Reloading immediately after the first restore click left the original generation active and no server restore job or lock. Retrying the same file completed successfully into a new generation. This demonstrates recovery from interruption before job creation, not mid-upload recovery.
- The completed restore job is `ready`, all three pages were accepted, and the workspace lock cleared. Read-only comparisons confirmed all three restored records equal the original generation's records. Original records remain retained.
- The live overview shows the expected labeled test goal and planned contribution after restore.

The existing emulator test `paged backup handles large workspaces, resumes restore, detects corruption and preserves receipts after cutover` was selected for a fresh run, but emulator startup failed because no usable Java runtime is available. Prior emulator evidence is not a fresh pass. Live testing above used only three records; the greater-than-240-record and mid-upload interruption gates remain open, as does browser download delivery. No account deletion, provider delivery, or production action was performed.
