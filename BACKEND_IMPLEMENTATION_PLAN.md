# Backend implementation for the desktop redesign

Status: B1–B7 local implementation is present and local verification passed on September 15, 2026. Live acceptance gates remain part of B8. B8 release tooling is present; live staging and production rollout are not complete. No deployment or production migration has been performed.

Implementation and rollout details: [BACKEND_RELEASE_RUNBOOK.md](BACKEND_RELEASE_RUNBOOK.md).
Prepared: September 14, 2026.

## Implementation checkpoint — September 15, 2026

- B1–B2: shared accounting contracts, schema adapters, ownership rules, and resumable migration implemented.
- B3–B4: atomic event/goal commands, revision conflicts, budgets, categories, scenarios, and roadmap persistence implemented.
- B5–B6: subscription rules, reminder timezone handling, recurrence projection, operating cash checkpoints, and planned/actual review implemented.
- B7: paged backup/restore, deletion coverage, retained recovery generations, and structured operational logs implemented. Alert configuration awaits the staging project.
- B8: CI, staging preflight, cohort tooling, and release runbook prepared. Live Google sign-in, valid App Check, two-device synchronization, controlled provider delivery, and deployment remain pending.

Local evidence: lint and build pass; 35 unit tests, 14 Firestore/backend tests, and 1 Auth/Functions smoke test pass. Browser checks confirm local budget persistence, over-target goals, contribution/reopening accounting, and checkpoint forecasts. Complete reads use bounded pages with explicit collection limits; goal history displays 50 rows at a time. Local forecasts project recurrence; automatic event generation requires the cloud scheduler. See the runbook for limits and live release gates.

## Outcome and scope

Connect the redesigned workspace to each signed-in user's real records while preserving the current theme, navigation, drawers, and responsive layouts. Retain Firebase Authentication, Firestore, Cloud Functions, App Check, and the existing repository boundary. Do not introduce a separate application server or replace the frontend framework.

Initial product assumptions: one private workspace per Firebase UID, USD, manual financial records, and one workspace timezone. Local personal workspaces remain supported; the sample household and Design review remain isolated and resettable. Bank connections, payment execution, shared household permissions, multi-currency conversion, and actual provider subscription cancellation are outside this release. Stripe donations and support remain existing integrations, not part of the budgeting ledger.

## Repository audit

| Area | Implemented now | Required for the new design |
| --- | --- | --- |
| Workspace | Local/cloud repositories, Google sign-in, Firestore listeners | Explicit sample/local/cloud data selection for every screen; loading, error, stale-data, and save states |
| Schedule | Event CRUD, repeat rules, reminders | Stable categories and relationship IDs, explicit completion/reopening, safe series edits, conflict handling |
| Goals | Goal document with current total and embedded contribution history | Atomic contribution/event accounting, immutable contribution IDs, paginated history, over-target balances |
| Plan | In-memory category limits and scenario deltas | Period-specific budgets, persisted isolated scenarios, actual workspace baseline |
| Subscriptions | Sample renewals and cancellation simulation | User-managed recurring commitments, recurrence linkage, lifecycle changes and persistent projections |
| Insights | Shared sample calculations and dated charts | Real opening cash checkpoint, real date ranges, actual/planned distinctions, recurrence projection without duplicates |
| Operations | Export/restore/delete, scheduler, Stripe/Resend webhooks | Coverage for every new collection, migration safety, concurrency tests and staging verification |

Concrete gaps found in the code:

- `Dashboard.jsx` supplies sample-derived `planningModel` even for personal/cloud advanced views. `PlanningTools.jsx`, `WorkspaceAnalysis.jsx`, and `WorkspaceSubscriptions.jsx` must receive an explicit workspace model rather than silently falling back to sample data.
- `eventConverter` does not preserve `goalId`, `subscriptionId`, or stable category IDs. It omits planned status when writing with merge, so reopening an existing completed event would not reliably clear completion. The cloud editor currently hides the status control.
- `goalConverter` clamps `currentCents` to `targetCents`, while the design permits saving beyond a target. Rules also disallow over-target balances. Goal history is written as a whole array; concurrent contributions can overwrite one another.
- Cloud `saveGoal` and `saveEvent` are independent writes. The atomic goal/cash behavior currently exists only in the sample model.
- `processSchedules` uses deterministic occurrence IDs but writes generated documents with `merge: false` from a previously read rule. Concurrent or retried runs can overwrite an existing occurrence. Deterministic IDs alone do not protect edits.
- Initial client recurrence advancement can lose the original day anchor after a short month. Reminder rules retain a fixed minute offset rather than computing each occurrence in the workspace timezone.
- Cloud listeners read entire event/history collections. Backup/restore has a 240-document application bound. Neither strategy should silently truncate a growing financial history.
- Existing tests cover basic ownership, validators, calculations, and emulator connectivity; successful protected callables and provider workflows still need staging verification.

## Data and accounting contract

Adopt a versioned v2 workspace schema through compatibility adapters. Use integer cents throughout domain calculations and persistence; convert only at input/display boundaries. Preserve the existing dollar-based UI through adapters during transition.

Use `YYYY-MM-DD` for a money event's local calendar date, `YYYY-MM` for a budget period, and an IANA timezone on the workspace. Use Firestore timestamps for creation, update, completion instants, and scheduler execution. Do not reinterpret a calendar date as the browser's timezone. Keep legacy timestamp conversion explicit and tested.

Business documents are now staged under `users/{uid}/workspaceVersions/{generation}` and selected by an atomic active pointer on the user profile. Permanent operation receipts remain directly under the user. This refines the original collection layout to make migration and restore reversible.

Documents:

| Document/collection | Core fields and purpose |
| --- | --- |
| User profile | `schemaVersion`, currency, timezone, migration status, existing profile/preferences |
| `cashCheckpoints/{id}` | `openingCents`, `effectiveDate`, revision; cash at the start of that date, excluding goal assets |
| `categories/{id}` | Stable ID, name, order, archived status; rename without losing event history |
| `events/{id}` | Kind (`income`, `expense`, `saving`), positive `amountCents`, local date, category ID, planned/completed status, optional goal/subscription/rule IDs, occurrence key, revision |
| `goals/{id}` | Target, opening saved balance, opening date, derived current balance, optional target date, archived status, revision |
| `budgets/{period}` | Bounded map of category IDs to limit cents, period, revision; independent from spending guardrails |
| `scenarios/{id}` | Name, baseline period, income/expense/saving deltas, baseline revision, revision; never an applied ledger mutation |
| `subscriptions/{id}` | Name, price, billing cycle, category ID, renewal anchor, linked recurring-rule ID, lifecycle/effective date, revision |
| `recurringRules/{id}` | Template and relationship IDs, original calendar anchor, timezone, end date, enabled state, processing cursor/version |
| `goalPlans/{goalId}` | Trial/planned monthly contribution and optional target date; no automatic money movement |
| `operations/{requestId}` | Server-owned command receipt, payload fingerprint and result for retry protection |

Existing goal contribution arrays become legacy history during migration. New contributions are linked saving events, queried by `goalId`; do not create a second independently editable transaction ledger. A cached goal balance is server-maintained and rebuildable from its opening balance and completed linked events after the opening date.

Required invariants:

1. Monthly planned remainder = planned income − consumption spending − savings, counting each event once. Actual totals include completed events only.
2. A planned savings event affects the plan/forecast, not the saved goal balance. Completing it affects the goal balance once. Reopening, correcting, or removing it applies the corresponding inverse delta atomically.
3. Recording a goal contribution creates one completed saving event and updates its goal in the same transaction. Editing goal metadata cannot overwrite the accumulated balance. Balance corrections are explicit adjustments with a reason, not silent edits to a total.
4. Saved balances may exceed targets. Targets determine progress and completion, not a cap on assets. Negative goal balances are rejected with a visible error.
5. Operating cash never includes opening goal assets. A checkpoint represents cash before events on its date. Past uncertain events are flagged; they are not silently treated as paid.
6. Forecast projected occurrences are deduplicated against materialized events using rule ID and occurrence date. Only explicit recurrence repeats; one-off transactions do not automatically recur each month.
7. Budget ceilings, scenario deltas, and simulated cancellations remain distinct from recorded spending. No automatic scenario apply action is included.
8. Historical entries survive category/subscription/goal archival. Series edits preserve completed occurrences and explicitly handle future planned ones.

## Write and read architecture

Keep Firestore listeners for bounded reads and owner-controlled simple settings. Use authenticated, App-Check-protected callable commands for v2 ledger mutations and multi-document invariants. Direct client writes to v2 financial events, derived goal balances, operation receipts, and scheduler fields are denied. Admin SDK commands must enforce ownership, references, valid fields, money bounds, revisions, and migration state themselves.

Proposed command families (final names settled in Phase B1):

- `saveMoneyEvent`, `setEventStatus`, `removeMoneyEvent` for canonical event changes and linked goal effects.
- `recordGoalContribution`, `adjustGoalOpeningBalance`, `saveGoalDetails`, `archiveGoal`.
- `savePeriodBudget`, `saveScenario`, `deleteScenario`, `saveGoalPlan`.
- `saveSubscription`, `changeSubscriptionStatus`, `updateRecurringSeries`.
- Reuse and extend export, restore, migration, and account-deletion operations.

Financial commands accept a client-generated stable request ID and expected record revision. Retries with the same ID and payload return the original result. Reusing an ID with a different payload is rejected. Stale revisions produce a conflict that preserves the user's draft and offers reload/review. Do not expire financial command receipts in a way that permits a previously committed request to run again.

For the initial release, cloud financial saves require connectivity and acknowledgement. Preserve offline drafts and clearly label cached reads; do not claim an offline callable operation was saved. Keep local-only operations available through the local adapter.

Subscribe by selected period/date range, plus relevant categories, active goals and commitments. Paginate older contribution and event history with stable date/document-ID cursors. Add indexes for owner-scoped date/status/category/goal queries and scheduler collection-group queries as each query is introduced. Client calculations must distinguish a complete period from a partial page; fetch the full bounded period or request a server aggregate, never sum only visible rows and present it as a total.

## Phase B1 — Contracts and existing correctness fixes

- Define shared money/date/status types and fixture-based domain functions usable by local, sample, cloud, and Functions code.
- Audit validators, converters, rules, restore validation, and editor constraints together. Resolve kind naming, field lengths, recurrence bounds, planned/completed writes, nullable fields, and over-target savings.
- Specify command payloads, reference checks, revision errors, opening balances, and archival semantics.
- Add regression cases for status reopening, contribution concurrency, date anchors, and retry preservation of generated occurrences.

Deliverable: reviewed schema/command contract and failing-then-passing correctness tests. Gate: one agreed accounting model; no silent coercion or loss of supported values. Start here before connecting additional screens.

## Phase B2 — Repository and migration foundation

- Introduce explicit sample, local, and cloud capabilities; eliminate sample fallback for real advanced views.
- Add schema readers, v2 converters, rules, indexes, version checks, and safe account-switch subscription cleanup.
- Build an idempotent migration runner with dry-run report, backup requirement, per-user progress, bounded batches, and a write lock during conversion.
- Preserve legacy amounts and dates. Map legacy category names to stable IDs without merging ambiguous categories. Preserve historical contribution rows without inventing duplicate cash outflows. Establish goal opening balances at a documented cutoff; require reconciliation when legacy totals/history disagree.
- Block unsupported old-client writes after a user's migration, with an upgrade message. Deploy compatible server support before activating migration.

Deliverable: an emulator workspace can read old data and safely transition to v2. Gate: dry run, interrupted-run resume, second-run no-op, account isolation, and rollback evidence. Do not migrate production yet.

## Phase B3 — Schedule, Overview, and atomic Goals

- Implement transactional event commands, completion/reopening, contribution recording, and financial corrections.
- Connect existing drawers to real save/conflict/failure states. Retain filters and focus. Expose cloud event completion controls.
- Replace full-history goal array writes with paginated linked-event history; derive Overview and goal progress from the same records.
- Add opening operating cash setup and opening goal balance setup. Define archiving instead of cascading away history; preserve undo for supported event removal.

Deliverable: the real-workspace vertical slice works across two browser sessions. Gate: contribution double-submit, concurrent contributions, lost response/retry, status reversal, deletion/undo, and account switching all preserve amounts. This is the first usable backend milestone.

## Phase B4 — Category budgets and scenarios

- Persist per-month category limits and category lifecycle. Keep the existing monthly guardrail independent.
- Persist named scenario deltas and goal roadmap amounts. Calculate against the chosen real period, not September fixtures.
- Label a changed baseline and require explicit rebase/recalculation; scenario resets affect only that scenario.
- Show distinct draft/saving/saved/conflict states and real empty states.

Deliverable: budgets and scenarios survive reload and synchronize across devices. Gate: limits never change event amounts, trial deltas never enter the ledger, and concurrent edits do not silently overwrite each other.

## Phase B5 — Subscriptions, recurrence, and reminders

- Implement user-managed subscriptions linked to one recurring rule each. Support monthly/yearly billing and retain historical prices on generated events.
- Distinguish “simulate cancellation” from “mark cancelled in my plan.” The latter stops future generation from a chosen date; neither contacts a provider.
- Make occurrence creation and rule-cursor advancement transactional/versioned. Never replace existing occurrences on retry; check rule status/version during generation.
- Define this-occurrence versus future-series edits. Preserve original day/month anchors and handle short months and leap years.
- Compute reminder instants per occurrence using timezone and delivery preferences; retain delivery leases, suppression, and duplicate protection. Process backlogs with bounded pages and safe resumption.

Deliverable: renewal details, schedule occurrences, and reminder state agree. Gate: overlapping scheduler runs, cancellation races, retries, DST boundaries, and failed delivery tests pass before staging email.

## Phase B6 — Real Cash flow and Monthly Review

- Replace fixed sample dates and opening cash with the workspace's checkpoint, period and timezone.
- Forecast actual dated events plus projected recurrence over 30/60/90 days; reconcile generated/projected events and distinguish planned versus completed data.
- Keep negative cash, dated inspection, numerical summaries, and accessible daily tables.
- Compute monthly planned/actual comparisons, category details, savings, and remainder with the same domain functions as Overview and Plan.
- Use complete-period loading/aggregation and clear missing-checkpoint/uncertain-event states.

Deliverable: all redesigned screens describe the same real household. Gate: reconciliation tests from ledger through every view, month/year boundaries, partial-history loading, and no double-counted transfers or recurrence.

## Phase B7 — Backup, migration completion, and operational coverage

- Version the backup envelope independently from document schema. Include all new business collections and relationships; keep request receipts/delivery state server-controlled.
- Replace the 240-document production bottleneck with a designed resumable export/restore process: validated manifest, bounded pages, staging data, write lock, and an atomic activation pointer or equivalent tested cutover. Never expose half-restored data.
- Complete local-personal migration for the new records, with explicit user acceptance and no sample import. Preserve immutable IDs and reference integrity.
- Extend account deletion and retention handling to new documents, receipts, and backup jobs. Test stale retries after restore without recreating old operations.
- Add bounded structured logs, command error metrics, scheduler backlog visibility, and alerts without financial payloads.

Deliverable: real users can safely keep, move, restore, and remove their data. Gate: large-workspace and malformed-backup tests, interrupted restore recovery, migration reconciliation, and complete account deletion. Final restore architecture is a design checkpoint before coding this phase.

## Phase B8 — Staging rollout and release

- Use a separate Firebase staging project with Auth, Firestore, App Check, Functions, scheduler, and controlled email recipients.
- Deploy compatible rules/indexes/functions first; wait for indexes, then release gated frontend capabilities and migrate test accounts.
- Verify real Google sign-in, valid App Check callables, two-device synchronization, failures/offline drafts, reminder delivery, backup/restore, and account deletion.
- Run regression checks on existing Stripe donations and support without changing their business scope.
- Enable production for a small cohort, monitor commands and scheduler backlog, and expand only after reconciliation and recovery gates pass.
- Rollback disables new writes/features while retaining migrated data and compatible readers; never blindly downgrade the schema or replay an old destructive backup.

Deliverable: a monitored release with a documented runbook and rollback path. Production deployment is a separate execution step, not authorized by this planning task.

## Verification matrix

| Layer | Required proof |
| --- | --- |
| Domain | Integer-cent arithmetic, checkpoints, status transitions, over-target goals, timezone dates, recurrence anchors, forecast reconciliation |
| Firestore rules | Cross-user denial for every collection, field allowlists, forbidden direct financial writes, immutable IDs/ownership, reference ownership |
| Functions emulator | Valid authenticated commands, duplicate IDs/payload mismatch, concurrent writes, stale revisions, failures and recovery; missing/invalid App Check rejected |
| Migration/backup | Legacy fixtures, ambiguous history reports, interrupted resume, no-op reruns, large history, no partial activation, no sample migration |
| Browser | Existing desktop/mobile paths, actual empty/loading/error states, preserved drafts/focus, two sessions, account switch and sign-out isolation |
| Staging integrations | Actual Google/App Check flow, scheduled delivery, provider webhook regression, export/restore/delete and operational visibility |

## Implementation sequence and prerequisites

B1 → B2 → B3 is the first release-sized slice. B4 and B5 follow the stable event model; B6 depends on their recurrence/category contracts. B7 is required before broad production migration, and B8 is the release gate. Carry each phase's rule, API, migration, and UI tests with its implementation rather than deferring security or recovery to the end.

Local implementation can begin without production secrets. Before staging, resolve the staging/production Firebase project IDs, region, App Check registration, verified email domain, and controlled test accounts. Keep all credentials outside the repository. Continue USD and one private workspace per user unless product requirements explicitly change.

## Official references checked

- [Firestore transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions): atomic updates and transaction retry/offline behavior inform ledger commands and draft handling.
- [Firebase scheduled functions](https://firebase.google.com/docs/functions/schedule-functions): scheduled invocations can overlap; occurrence generation must tolerate concurrency.
- [Cloud Functions tips](https://firebase.google.com/docs/functions/tips): idempotent operations and bounded execution inform retryable commands and jobs.
- [Firestore best practices](https://firebase.google.com/docs/firestore/best-practices): bounded queries and cursor-based pagination inform history loading.

These references support platform behavior. The schema, write boundaries, phases, and product assumptions above are recommendations based on the repository audit, not Firebase requirements.
