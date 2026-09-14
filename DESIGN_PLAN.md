# Talaan desktop-first UX/UI redesign

Status: Phases 1–8 complete. Frontend redesign delivered; production limitations are recorded below.

This document is the reference for the redesign. Completion of a specification
is not completion of its UI implementation. Update the phase checklist and
verification evidence as each phase is delivered.

## Scope and fixed constraints

- Desktop is the primary design target: 1440×900, followed by 1280×800 and 1920×1080.
- Preserve the existing cream backgrounds, dark ink, rust accents, typography,
  and square-edged visual identity.
- All new behavior is frontend-only: illustrative data and simulated actions.
- Do not add backend integration, migrate real data, change authentication, or
  alter existing cloud contracts as part of this redesign.
- Keep personal and authenticated workspace data separate from preview fixtures.
- Preserve existing workspace URLs and browser back/forward behavior.
- Mobile and tablet remain supported through responsive adaptation.

## Research basis

- [NN/g: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
  expose core tasks clearly and place specialized tools in a discoverable context.
- [NN/g: Consistency and standards](https://www.nngroup.com/articles/consistency-and-standards/):
  share terminology, component behavior, visual rules, and interaction patterns.
- [Material: Understanding navigation](https://m2.material.io/design/navigation/understanding-navigation.html):
  distinguish primary destinations from secondary views; adapt navigation to screen size.
- [Carbon: Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/):
  prioritize important information, limit competing metrics, and use consistent chart conventions.
- [W3C: Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html):
  ensure fixed navigation and drawers do not obscure keyboard focus.

The hierarchy below is a product recommendation for Talaan, not a structure
already validated with representative users. Validate findability in Phase 8.

## Phased delivery plan

### Phase 1 — Structure and design foundations

- [x] Define primary navigation and feature ownership.
- [x] Specify route compatibility and return behavior.
- [x] Define reusable components and visual tokens.
- [x] Define one consistent sample household and state ownership.
- [x] Record acceptance conditions and unresolved implementation work.

Deliverable: the Phase 1 specification below. No interface migration in this phase.

### Phase 2 — Desktop workspace shell

- [x] Build persistent left sidebar and utility navigation.
- [x] Add a compact, consistent page header and flexible content grid.
- [x] Implement the route metadata and aliases defined below.
- [x] Remove repeated shortcut panels and global six-feature navigation.
- [x] Keep all current screens reachable during the transition.

Deliverable: navigable desktop shell. Gate: verify all three desktop target sizes,
active navigation, deep links, and browser history before proceeding.

### Phase 3 — Overview and Schedule

- [x] Build Overview around monthly position, upcoming obligations, and goal progress.
- [x] Introduce a readable event table with aligned amounts and status columns.
- [x] Add an event editor drawer with a fixed action area.
- [x] Preserve filters, scroll position, and focused row when closing the drawer.

Deliverable: two reference screens establishing reusable page and editing patterns.
Gate: validate hierarchy, density, theme, and drawer behavior before expanding.

### Phase 4 — Planning tools

- [x] Add Category budgets and What-if scenarios under Plan.
- [x] Place editing controls beside summaries/results.
- [x] Preserve prototype adjustments during navigation.
- [x] Provide explicit reset and clearly separate scenario changes from the base plan.

Deliverable: connected planning prototypes with reconciled calculations.

### Phase 5 — Goals and Subscriptions

- [x] Combine goal list, detail, contributions, and roadmap into a coherent flow.
- [x] Place Subscriptions within Schedule.
- [x] Connect renewal rows to detail views and simulated cancellation results.

Deliverable: savings and recurring-cost flows using shared interaction patterns.

### Phase 6 — Forecast and Monthly Review

- [x] Place Cash flow and Monthly review under Insights.
- [x] Add wide charts, date inspection, comparisons, and category drill-down.
- [x] Reconcile data across Overview, Plan, Schedule, Goals, and Insights.
- [x] Use consistent labels, colors, legends, and accessible summaries.

Deliverable: analysis pages based on the same sample household.

### Phase 7 — Responsive and accessibility refinement

- [x] Adapt sidebar to compact navigation and labeled mobile bottom navigation.
- [x] Adapt columns, tables, and drawers without losing task context.
- [x] Verify keyboard flow, Escape, focus return, and text alternatives for charts.
- [x] Move populated/empty/loading/error examples to a dedicated design-review page.

Deliverable: usable desktop, tablet, and mobile layouts.

### Phase 8 — Final validation and cleanup

- [x] Verify feature discovery with task-based checks.
- [x] Verify history, deep links, state persistence, reset, and numerical consistency.
- [x] Remove obsolete components and conflicting workspace CSS overrides.
- [x] Run appropriate tests, lint, build, and visual checks.
- [x] Record results and remaining limitations in this document.

Deliverable: coherent frontend design with documented verification.

## Phase 1 specification

### Findings motivating the redesign

The current implementation layers workspace navigation, shortcut panels, a
feature gallery, and global feature tabs. Advanced pages all activate More.
Preview controls consume space before useful content, and planning pages reset
local state on navigation. The old demo and advanced previews also use different
categories and totals. Phase 2 must replace this hierarchy rather than add
another navigation layer.

### Information architecture

| Primary destination | User question | Secondary views | Primary action |
| --- | --- | --- | --- |
| Overview | What needs my attention this month? | Summary with contextual links | Add event |
| Plan | How should I allocate my money? | Category budgets; What-if scenarios | Adjust budget / New scenario |
| Schedule | What is coming in or going out, and when? | Events (list/calendar); Subscriptions | Add event |
| Goals | What am I saving toward? | Goal list/details; Savings roadmap | New goal |
| Insights | What patterns and future changes should I understand? | Cash flow; Monthly review; existing allocation report | View-specific period controls |

Utility destinations: Profile, Settings & data, Help & support, and existing
sign-in/account controls. Utilities sit at the bottom of the desktop sidebar.
They do not count as financial task destinations.

Keep one permanent home for every feature. Contextual links may cross sections,
but must label their destination and activate the destination's correct parent.
For example, a subscription link in an event detail opens Schedule/Subscriptions.

### Route compatibility contract

Keep the current flat hash routing during the shell migration; a nested URL
rewrite is unnecessary. `scope` continues to mean `dashboard` (sample),
`personal`, or `workspace` (authenticated). The table describes future behavior,
not behavior already implemented.

| Existing or proposed URL suffix | Owner | Resolution in the redesigned shell |
| --- | --- | --- |
| `#<scope>` or `#<scope>/overview` | Overview | Overview |
| `#<scope>/plan` (new) | Plan | Category budgets default |
| `#<scope>/budgets` | Plan | Category budgets |
| `#<scope>/scenarios` | Plan | What-if scenarios |
| `#<scope>/schedule` | Schedule | Events; list/calendar is local view state |
| `#<scope>/subscriptions` | Schedule | Subscriptions |
| `#<scope>/goals` | Goals | Goals |
| `#<scope>/roadmap` | Goals | Savings roadmap |
| `#<scope>/insights` | Insights | Cash flow default; preserve allocation report access |
| `#<scope>/forecast` | Insights | Cash flow |
| `#<scope>/review` | Insights | Monthly review |
| `#<scope>/allocation` (new) | Insights | Existing allocation report |
| `#<scope>/more` | Utilities | Compatibility account/settings/help index |
| `#<scope>/profile`, `/settings`, `/help` | Utilities | Existing respective views |
| Unknown workspace suffix | Overview | Safe fallback with no redirect loop |

Use one route metadata source for page title, parent, secondary navigation, and
active state. Do not scatter destination arrays through multiple components.
Navigation should use real hash links; buttons perform actions. Browser history
must continue to work. Feature pages return to their owning section rather than
always displaying “Back to Insights.” Do not change existing saved start-page
validation or cloud schemas in this phase.

### Desktop layout contract

- Reference frame: 1440×900. Sidebar: 224px, persistent and full-height.
- Content: flexible remaining width; 32px desktop outer gutters, 24px grid gap.
- Reading content max-width: approximately 1440px; center it on large displays.
- Header: approximately 72px, expandable when content requires; title left,
  period and primary action right. Avoid separate stacked status/title/action bars.
- Sidebar carries workspace identity and a compact sample-data indicator.
- Financial task screens use at most one secondary navigation row.
- Summary pages: main answer first, supporting metrics next, details afterward.
- Schedule: dense but readable table. Plan: controls/results side by side.
- Editor drawer: approximately 440px with a scrollable body and fixed footer.
- At 1280px, reduce gutters or supporting-panel width before shrinking text.
- At 1920px, preserve readable widths rather than stretching all cards and rows.
- Proposed responsive transition points: 1200px for narrower desktop columns,
  1024px for compact navigation, 768px for mobile layout. Verify content fit rather
  than treating these values as immutable device categories.

### Visual system specification

These are consolidation targets based on the current palette, not a new theme.
Introduce scoped tokens in Phase 2; migrate workspace rules gradually so the
marketing pages are not unintentionally restyled.

| Role | Value / rule |
| --- | --- |
| Canvas | `#eee9df` cream |
| Raised surface / fields | `#f7f1e8` light cream |
| Muted surface | `#e2d8c8` warm paper |
| Primary text / dark summary | `#25231f` ink |
| Secondary text | `#625e55` |
| Primary action | `#bd3e26` rust, light text |
| Text links / focus | `#953d2b` darker rust |
| Divider | `#b7afa0` |
| Corners | Square, including buttons, cards, tabs, and drawers |
| Elevation | Borders for grouping; restrained shadow only on overlays |
| Heading family | Existing Space Grotesk stack |
| Body family | Existing DM Sans stack |
| Data annotations | Existing DM Mono stack, used sparingly |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48px |
| Page heading | 32px / approximately 1.2 line height |
| Section heading | 22–24px |
| Body / table text | 14–16px; avoid shrinking to fit columns |
| Secondary labels | 12–13px; never the only source of essential information |
| Money | Tabular numerals; consistent USD formatting for the same precision |

Rust indicates actions/selection; do not make the same color alone mean danger
or money out. Use text, signs, and icons to distinguish financial states.
Measure contrast on actual component combinations during implementation.

### Shared component inventory

| Component | Contract |
| --- | --- |
| Workspace shell | Sidebar, utility controls, header, main landmark, skip link |
| Section navigation | Local peer views only; parent selection always consistent |
| Page header | Title, period, primary action; one predictable location |
| Summary metric | Label, number, optional context; emphasis follows importance |
| Event table / compact row | Name, category, date, status, amount, accessible row action |
| Filter toolbar | Search, filters, clear action; state preserved on detail return |
| Detail drawer | Accessible name; initial focus; Escape; focus return; sticky actions |
| Form field | Persistent label, help/error association, consistent sizing |
| Chart frame | Title, units, period, legend, text summary, optional detail table |
| State panel | Relevant empty/error/loading message and clear recovery action |
| Sample indicator | One compact label in shell; no repeated promotional panels |

Drawer behavior: preserve unsaved input while navigating fields; ask before
explicitly discarding changed form data. Preserve the underlying row/filter
context on close. A modal drawer traps focus; a nonmodal detail panel does not.
Choose the model based on whether the background remains interactive and apply
it consistently. Default event editor: modal drawer.

### Sample household and frontend state contract

The redesigned preview has one fixed September 2026 household, identified as
illustrative. Do not read or overwrite a personal/cloud workspace to populate it.
The existing demo and planning fixtures remain unchanged until their replacement
is implemented in later phases.

Canonical monthly reference:

| Measure | Amount (USD) |
| --- | ---: |
| Income: two paydays | 3,800 |
| Home & bills: rent 1,200 + utilities 250 | 1,450 |
| Everyday spending | 640 |
| Getting around | 180 |
| Subscriptions: 12 + 10 + 19 + 35 | 76 |
| Little extras | 210 |
| Total spending | 2,556 |
| Savings transfers: 200 + 150 + 100 | 450 |
| Total planned outflow | 3,006 |
| Planned monthly remainder | 794 |
| Starting operating cash on September 1 | 1,240 |
| Projected September closing operating cash | 2,034 |

Savings transfers reduce operating cash but are not categorized as consumption
spending. Opening goal balances are 1,200, 450, and 300, each as of September 1;
September transfers increment them once. Do not include goal balances in
operating cash or count transfers twice.

Proposed fixture model:

- Household: ID, currency, fixed sample date, opening cash amount and date.
- Category: stable ID, name, monthly budget limit.
- Event: stable ID, date, amount in integer cents, kind (income/expense/transfer),
  category ID where applicable, status, optional subscription/goal ID.
- Subscription: stable ID, display name, amount in cents, renewal schedule.
- Goal: stable ID, target cents, dated opening balance, contribution events.
- Scenario: ID, name, income/expense/savings deltas against the base plan.
- View state: period, filter, selection, drawer state; separate from household data.

Derived values—not independent constants—drive totals, allocation, subscription
cost, goal progress, and cash forecasts. Forecasts use dated events from the same
fixture; replace the existing separate $25/day approximation when integrating.
A current-month view labels future transactions as planned. A retrospective
sample review uses an explicitly completed sample month and must not imply that
future September activity has already happened on September 13.

State ownership: a preview-level React state owner persists edits while switching
routes. Scenario deltas remain isolated until an explicit simulated apply action
is designed. Reset sample restores a fresh fixture copy; reset scenario clears
only that scenario. Reload may reset preview state, clearly documented. No
server calls, new persistence service, or storage migration is required.

### Phase 1 verification and handoff

Checked the current `Dashboard.jsx`, `WorkspacePages.jsx`, `PlanningStudio.jsx`,
`planningData.js`, `useRoute.js`, `NavIcon.jsx`, CSS, and validators to establish
this specification. Phase 1 changes documentation only.

- Every advanced feature has an assigned primary owner.
- All existing workspace destination suffixes have a compatibility decision.
- Existing theme and fonts are explicitly retained.
- Monthly sample arithmetic reconciles: 3,800 − 2,556 − 450 = 794;
  1,240 + 794 = 2,034.
- Phase 2 is the next implementation step. It must not claim sample-data
  unification or redesigned screens complete until those later phases are built.


## Phase 2 implementation and verification

Implemented the desktop shell in `WorkspaceShell.jsx` with scoped CSS. Route
metadata in `workspaceRoutes.js` owns primary/secondary navigation, titles,
legacy aliases, and fallback behavior. Marketing-page layout remains separate.
The sidebar includes five task destinations, utility links, and existing account
actions. Old feature galleries, shortcut panels, and global feature tabs were
removed from rendering. Preview state controls remain until Phase 7.

- Visually verified 1440×900, 1280×800, 1920×1080, and mobile 390×844.
- Browser-verified the legacy Insights URL, Plan entry, Schedule/Subscriptions,
  and browser Back. Route unit tests cover all legacy suffixes, scope links,
  section defaults, and unknown-route fallback.
- Lint, 20 unit tests, and production build passed. Existing large-bundle warning remains.
- Existing feature views are hosted in the new shell. The Schedule table,
  drawer redesign, cross-page prototype state, and unified fixtures remain for
  later phases. No backend integration was added.


## Phase 3 implementation and verification

Overview now groups monthly position, upcoming money events, outstanding
confirmations, and savings progress. Totals derive from the selected workspace
and month; future income is explicitly described as planned, not bank balance.
`WorkspaceOverview.jsx` and `WorkspaceSchedule.jsx` share the event table.
Schedule includes search, type/status filters, result counts, empty results,
date ordering, and aligned amounts.

The existing event form now opens in a 440px desktop drawer with a fixed action
area and a scrollable body. Mobile uses the full viewport width. Closing returns
focus to the opening event and restores page scroll while retaining filters.
Save failures retain the draft and show an inline error. Draft restoration waits
for the workspace to load. Existing save/remove/undo behavior is retained;
no backend integration or data migration was added.

- Verified Overview at 1440×900 and 1920×1080; Schedule and drawer at
  1280×800 and 1440×900; both screens and drawer at 390×844.
- Browser checks passed: combined search/type/status filters, clear filters,
  empty results, Escape, initial name focus, restored row focus, scroll retention
  at 176px, and opening a persisted draft after reload.
- Fixed inherited event-name styles and vertical auto margins that caused
  short workspace pages to move downward.
- Lint, all 20 unit tests, and production build passed. The existing bundle-size
  warning remains. Cloud writes were not exercised in this design phase.
- Phase 4 is next: planning tools, side-by-side controls/results, and prototype
  state retained during navigation. Cross-page fixture unification remains open.


## Phase 4 implementation and verification

Category budgets and What-if scenarios now share a desktop workbench pattern
in `PlanningTools.jsx`: controls on the left, a summary or comparison on the
right. Category budgets use a semantic table with editable limits and category
over-limit feedback. Scenarios offer presets, sliders, exact whole-dollar
inputs, and an explicit comparison with the unchanged base plan.

`Dashboard.jsx` owns the planning reducer, so trial limits and scenario changes
survive navigation to other workspace screens and back. Each tool has an
independent reset. Reload or leaving the workspace restores the sample; the UI
states this limitation. Display-state previews do not own these adjustments.

Calculations derive from the shared category spending fixture: income $3,800,
planned spending $2,556, savings $450, base remainder $794. Default category
limits total $2,920, leaving $430 unallocated after savings. Limits are ceilings,
not expenses: changing them does not silently change planned spending or the
scenario baseline. A $300 income increase and $100 savings increase yield a
$994 scenario remainder. No action applies a scenario to an account.

- Browser verified edits survive a trip through Schedule and back to Plan.
- Verified a scenario reset preserves a changed $1,800 category limit.
- Checked 1440×900 and 1280×800 desktop layouts, 1920×1080 column sizing,
  and stacked 390×844 mobile layouts. No page-level horizontal overflow;
  the category table has a keyboard-focusable horizontal scroll region.
- Lint, 22 unit tests, production build, and whitespace checks passed.
  Tests cover arithmetic, immutable updates, independent resets, input bounds,
  and negative scenario remainders. Existing bundle-size warning remains.
- Theme and palette remain unchanged. No backend integration was added.
- Phase 5 is next: Goals and Subscriptions. The other planning previews retain
  their existing state behavior; full cross-page fixture unification remains
  for later phases.


## Phase 5 implementation and verification

Goals and Savings roadmap now use the same workspace goals and selected goal.
The desktop list opens a detail panel with saved balance, remaining target,
contribution history, and a linked roadmap estimate. The existing goal editor
uses the fixed-action drawer pattern, with initial focus, Escape, focus return,
discard protection, and inline save errors. Existing goal save/remove operations
are retained. Contribution amounts use integer cents when added to balances.

Roadmap estimates are frontend-only trial monthly amounts; they do not record
contributions or schedule payments. Amounts persist across workspace navigation
and reset on reload. An already reached goal is shown as reached, and a zero
trial contribution prompts the user to choose an amount. This replaces the
separate sample roadmap so a selected goal remains consistent between views.

Subscriptions remains within Schedule. Filtered renewal rows select a detail
panel containing price, billing cycle, renewal date, and a simulated cancellation
result. Trial totals include all services regardless of the current filter.
Cancellation previews can be restored individually or reset together, and remain
intact across navigation. No provider is contacted or subscription cancelled.

- Browser checked goal-to-roadmap navigation, a $200 monthly estimate yielding
  nine months for the current $1,800 gap, and retained trial amounts after leaving
  Goals. Verified goal drawer initial focus and Escape returning to its opener.
- Verified a $12 simulated cancellation changes monthly total from $76 to $64,
  annual equivalent to $768, and potential annual savings to $144. Navigation
  preserves the simulation; reset restores the base. Category filtering selects
  a matching detail view.
- Checked desktop at 1440×900, laptop sizing at 1280×800, wide desktop sizing at
  1920×1080, and mobile detail layouts at 390×844. Mobile row selection brings
  details into view. No page-level horizontal overflow was observed.
- Lint, all 23 unit tests, build, and whitespace checks passed. Contribution tests
  cover cent arithmetic, retained history, zero amounts, and immutable updates.
  Existing bundle-size warning remains. Cloud writes were not exercised.
- Theme and palette retained; no backend integration added. Phase 6 is next:
  Forecast, Monthly Review, and reconciliation across the sample household.


## Phase 6 implementation and verification

Cash flow and Monthly review now use desktop analysis layouts in
`WorkspaceAnalysis.jsx`. Cash flow provides 30/60/90-day views, a zero baseline,
negative-balance scaling, keyboard date inspection, dated event details, and a
daily balance table. Monthly review defaults to completed sample August;
September is explicitly a full-month plan. Category comparisons show numeric
changes alongside bars and open dated entry details.

`sampleHousehold.js` and `useSampleHousehold.js` replace the disconnected demo
fixtures with an in-memory household. Overview, Schedule, Plan, Goals,
Subscriptions, and analysis derive their sample figures from its events.
August is included as historical sample events; September is the editable base.
Personal/cloud records and legacy browser storage are not migrated or overwritten.
Advanced views outside the sample workspace remain explicitly sample previews.

September reconciles to $3,800 income, $2,556 consumption spending, $450 savings,
and $794 remaining. Opening operating cash is $1,240 on September 1, with a
$2,034 projected closing balance. The old $25/day forecast allowance was removed.
Later forecast months repeat the dated September plan, including month-end
payday adjustment. Existing savings balances are separate assets; completed
linked savings events update goals once, and recorded sample contributions also
create a corresponding cash event. Trial cancellations and scenarios stay
isolated from the base schedule.

Reset sample restores household data and trial controls. Reload restores the
sample as well. Preview display states remain in place until Phase 7.

- Browser verified an $8 increase to Soundtrack updates Overview remainder to
  $786, budget subscription spending to $84, subscription total to $84, and
  projected closing cash to $2,026. Reset restored the canonical figures.
- Verified September 30 date inspection, 90-day selection, completed August
  totals ($2,591 spending / $759 remainder), September comparisons, and
  subscription-category drill-down.
- Checked 1440×900 and 1920×1080 desktop views, 1280×800 column sizing, and
  mobile 390×844 chart/review layouts without page-level horizontal overflow.
- Lint, 25 unit tests, production build, and whitespace checks passed. Tests
  cover shared totals, dated cash flow, month-end paydays, negative balances,
  savings completion idempotence, and immutable contribution calculations.
  Existing bundle-size warning remains. No cloud writes were exercised.
- Theme and palette retained. No backend integration or storage migration added.
  Phase 7 is next: responsive/accessibility refinement and dedicated design review.


## Phase 7 implementation and verification

Refined the compact tablet sidebar and labeled mobile navigation, including
safe-area spacing, wrapping header controls, and 44px control targets. Added
visible focus to form controls, disclosures, and scroll regions. Tables support
keyboard scrolling, navigation moves focus to page content, and reduced-motion
preferences suppress workspace animation and smooth scrolling. Stacked monthly
review categories bring their details into view when selected.

Populated, empty, loading, and error examples now live at `design-review`,
reachable from desktop utilities and the mobile Account page. The review page
has its own sample and trial state. Normal feature pages no longer contain
preview-state controls. The global sample reset is omitted from design review
so its controls cannot reset the working sample household.

Keyboard testing exposed a native modal boundary where Tab could leave the
event drawer. The shared `dialogFocus.js` handler now wraps forward and reverse
navigation in both event and goal drawers, retaining native dialog modality.

- Verified 22 consecutive forward Tab stops stayed inside the event drawer;
  Shift+Tab from its first control wrapped to the last. Goal drawer boundary
  navigation also passed. Escape restored each drawer’s opening control.
- Verified page-navigation focus and the Skip to content link.
- Exercised empty, loading, and error examples and recovery to populated content.
  Checked design-review discovery from desktop utilities and mobile Account.
- Checked compact tablet navigation at 768×1024 and narrow mobile views at
  320×740, including Schedule, event drawer, and Design review. No page-level
  horizontal overflow was observed; secondary navigation scrolls locally.
- Verified keyboard forecast date inspection and a focusable daily-balance table
  at desktop size. Charts retain text summaries and numeric alternatives.
- Lint, all 25 unit tests, production build, and whitespace checks passed.
  Existing bundle-size warning remains. This was browser/keyboard verification,
  not a full assistive-technology audit.
- Theme and palette retained; no backend integration added. Phase 8 is next:
  final task-based validation, obsolete-code cleanup, and remaining limitations.


## Phase 8 final validation and cleanup

The eight-phase frontend redesign is complete. Preserved the cream, ink, and
rust palette, typography, square-edged identity, legacy workspace links, and
existing personal/cloud operations. No backend integration or deployment was
added as part of the redesign.

Removed obsolete planning galleries, cards, forecast/review layouts, roadmap
styles, and shortcut rules from `PlanningStudio.css`, reducing that file from
10,917 to 2,534 bytes. Retained the shared primitives used by current screens.
Removed the old conflicting event-name rule, unused preview selectors, unused
date-format exports, and the duplicate planning-page catalog. Route metadata
now supplies the set of planning destinations. README reflects the delivered
navigation, in-memory sample lifecycle, and dedicated Design review page.

### Final evidence

- Lint, all 25 unit tests, and production build passed before and after cleanup.
  Whitespace checks passed. The JavaScript bundle warning remains.
- Browser followed visible links through category budgets, what-if scenarios,
  Schedule, Subscriptions, Goals, Savings roadmap, Cash flow, and Monthly review.
- Verified the legacy `#dashboard/insights` deep link opens Cash flow. Route tests
  also cover section aliases, supported scope links, and unknown-route fallback.
- Recorded a $50 sample goal contribution: saved balance became $1,250, history
  included the new entry, and forecast closing cash became $1,984. Reset restored
  the $2,034 baseline. Browser Back and Forward returned to Goals and Cash flow.
- Rechecked desktop budget appearance after CSS cleanup and mobile Cash flow at
  390×844 without page-level horizontal overflow. Previous phase evidence covers
  320px mobile, 768px tablet, 1280px laptop, and 1440/1920px desktop layouts.
- Earlier phase browser checks establish trial-state persistence, independent
  resets, cancellation arithmetic, drawer focus containment, Escape/focus return,
  category inspection, and isolated design-state recovery.

### Remaining limitations and intentional boundaries

- This is a frontend design prototype, not production validation of banking,
  payments, reminders, subscription providers, authentication, or cloud writes.
- The fixed sample household resets on reload or Reset sample. Personal browser
  records and signed-in records retain their existing separate behavior. Advanced
  previews in those workspaces still display labeled sample data.
- Existing account/settings/backup functions are outside this redesign’s sample
  simulation. The in-memory sample is not a persisted backup format.
- Forecasts repeat the September plan for later months and assume fixed prices;
  they do not predict real income, bank balances, or changing spending patterns.
  Scenario and cancellation previews deliberately do not apply to the base plan.
- Validation used unit tests and browser/keyboard inspection, not a full
  screen-reader audit, every browser/device combination, or production load tests.
- Vite reports a large JavaScript chunk. A separate performance pass can assess
  code splitting when production scope and loading requirements are established.
- Shared marketing/legacy CSS remains where existing pages still depend on it;
  this cleanup removed confirmed obsolete workspace styles rather than rewriting
  unrelated public pages.
