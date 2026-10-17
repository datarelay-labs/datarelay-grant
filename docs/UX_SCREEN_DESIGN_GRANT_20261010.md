# DataRelay Grant — five-screen UI layout and interaction blueprint

**Design revision 1, 2026-10-10. Status: design proposal / source work in progress, not deployed user UI acceptance.** User goal: replace generic monitoring-first experience with a task-first approval application. Inputs: [Keycloak 26.5.7 static REA evidence](UX_REA_KEYCLOAK_20261010.md), [six-vendor evidence Gap Matrix](GRANT_UI_UX_GAP_MATRIX.md), original [Product Standard](PRODUCT_STANDARD.md), exact current integrated source. Preserve existing Foundation shared components and Grant API/security semantics.

### Global shell (Foundation-owned; not forked)

Desktop proposal: **240px bounded collapsible left navigation**, **64px top context/header**, main content max width **1,180px** with consistent left alignment; two-level groups **My work**, **Configuration**, **Administration**. Nav parent/child auto-expands for the current route, supports keyboard and `aria-expanded`; capability map AND backend RBAC decide actual access. Mobile design targets: **320×568** and **375×667**; one content column, no white body gutters or horizontal overflow, account/help controls keyboard reachable and a visible early login form. These dimensions are **proposed acceptance criteria**, not measured deployed screen facts. Existing `AuthLayout/ProductShell/AdministrationHub` should be reused; Administration/app/styles/mobile paths were previously platform safety-denied and are NOT changed by this rev8.

```text
┌─────────────────────┬────────────────────────────────────────────────────────┐
│  GRANT              │ My approvals                  Account / Security       │
│  Home               ├────────────────────────────────────────────────────────┤
│  My work  ▾         │ My work › My approvals               [New request]    │
│    My approvals     │ [Needs my decision] [On hold] [Delegated] [Recent]      │
│    My requests      │ [Search] [Work view] [Decision] [Information]          │
│    Requests         │ [Request / exact action] [Decision] [Due] [View]       │
│    Delegations      │ compact task table, no decorative monitoring graphs   │
│  Configuration ▸    │                                                        │
│  Administration ▸   │                                                        │
└─────────────────────┴────────────────────────────────────────────────────────┘
```

## UX-A — Approver Inbox (Grant M1; **one scoped source improvement in rev8**)

**Entry:** `/approvals` (already routed). **Hero:** "Your approval queue", one sentence that approval is a human decision, not execution. Under header: four quick task controls: `Needs my decision`, `On hold`, `Delegated to me`, `Recently decided`; reflect selection using `aria-pressed`; resetting to one work view also clears earlier search/advanced fields and page offset. Continue using `GET /requests?view=...&limit=50&offset=0` and server role filtering. Never infer unbounded total from page size or automatically execute a protected action.

**List:** actionable request title/external ID and action target (if already present), decision-state distinction, approval seat progress, deadline and visible detail entry. Advanced filters stay under disclosure; callbacks/execution are secondary columns, not the hero. `Overdue or expired` remains in the existing Work view selector but **not a promoted quick button** until the known approved-grant expiry false-positive in `grant/core.py` is truly resolved. Do not add a client-only false semantic workaround.

**Actual rev8 source:** only `web/src/request_inbox.tsx` + `web/tests/unit/request-queue-disclosure.test.ts` for quick views, no changes to app routes, shared CSS or backend. Unit RED→GREEN, Web/build/Static required; actual live user E2E still M7.

## UX-B — Human email decision portal (Grant M4; **DESIGN ONLY, BLOCKED SOURCE**)

**Entry when legitimately mounted:** opaque recipient/request/choice-scoped emailed link. Server GET must be **read-only**, no automatic approval/OTP send; show only bounded request identity and selected outcome. User reviews the exact action, manually enters **four-digit PIN**, optionally verifies same-mailbox OTP **or** independently authenticated fresh Grant TOTP according to current trusted policy, then separately reviews and **confirms final decision with POST**. Deny reason appears only where policy requires. Same-message PIN proves mailbox possession, **not** named-person MFA. Email link expiry/replay and revoked/delegated seat fail closed. Never treat transport accepted as external execution.

**Layout:** standalone centered card `max-width:480px`; eyebrow `Review approval request`; immutable task/target/status, “Step 1: Verify email code,” “Step 2: Additional verification when required,” “Step 3: Confirm Approve/Hold/Deny.” Clear expired/already-used/recipient-removed states and return to request/inbox where authorized. No login for basic EMAIL_PIN. **Actual problem:** `grant/decision_links.py` issues an API JSON GET and the existing `email_decision_portal.tsx` isn't mounted; `web/src/app.tsx` change previously blocked, no alternate mount attempted by this design.

## UX-C — Login and Administration (Foundation B2 + Grant M2; **DESIGN ONLY**)

**Login:** combined identity/form centered on wide desktop; on 320px screen the credentials form is above any resource links, no white outer frame, account creation remains admin-only, MFA route is explicit, no auto-filled example credentials.

**Admin:** top-level **System Administration** hub with four conventional groups (per current Foundation shared contract), Grant Mail as a labeled extension; only actual supported tasks have enabled Manage/View actions. Member must not see misleading `core.users` or `grant.smtp.test` managed actions. Do not create editable SMTP credentials or backup restore controls that have no live API. Navigation hierarchy from Keycloak is a **pattern**, not a permission source. Source issues remain in `web/src/administration.tsx`/Foundation capability mapping; previous safety denials persist.

```text
Administration › System management
[Health & status]    [Accounts]            [Audit]
[Platform/network: Operator-owned, view only]
[Backup/restore: Procedure only; no Web mutation]
[Mail & Notifications: delivery test (admin), SMTP config unavailable]
```

## UX-D — Policy/approval group/notification editor (Grant M3; **DESIGN ONLY**)

**List first:** search + lifecycle badge `Draft / Testing / Active / Disabled`, approver group, integration, last-reviewed version; open actual policy detail, avoid all settings dumped at top level. **Detail progressive sections:** General / Scope / Approval Steps / Timing / Decision Verification / Notifications / Preview & Test / History. Review policy changes and require explicit Testing and Activate; never silently use unsaved editor values. Policy/notification **two-admin optimistic concurrency** and Deny/MFA/integration security-floor requirements need backend CAS, not a decorative modal. Provide conflict explanation that current saved values must be reloaded. Source `policies.tsx` already implements much of layout; do not duplicate an existing editor.

## UX-E — Request detail, audit and execution (Grant M1/M5/M6; **DESIGN ONLY**)

**Above fold:** business request title, immutable action kind/target, requester and decision deadline; one dominant permitted user action, explicit workflow stage, current approver-seat voting. **Separate evidence:** chronological audit events/notification attempts collapsed by default with clear counts and distinction between record count vs truncated projection. **Execution block** states `NOT_STARTED, UNKNOWN, REPORTED_FAILED, REPORTED_SUCCEEDED` as **product reports**, not independently confirmed effects. No "Approve" if user cannot decide; no "Executed" simply because email PIN was verified.

Source `request_action_summary.tsx` and `request_evidence.tsx` already provide action/seat/timeline, `audit_explorer.tsx` source cap, so this is mostly hierarchy/acceptance after current P0 functional fixes, not a new monitoring dashboard.

## Delivery stages and explicit gates

| Stage | Owner | Deliverable | Gate / status |
| --- | --- | --- | --- |
| 0 — Real competitor static analysis | Grant/PF-CI tools reused | Keycloak pinned 17-file Apache-2.0 REA evidence; 0 UI runtime captures | **SOURCE_STATIC_PASS**, limitations documented |
| 1 — Screen design | Grant | This blueprint + five-view **standalone interactive HTML**; demo synthetic only | **DESIGN_ARTIFACT**, not mounted or user accepted |
| 2 — First safe in-product UI improvement | Grant #67 rev8 | Task-first approval shortcuts in existing `RequestList`; server filters preserved | Web RED→GREEN, official Web/Static, Git normal push; human E2E separate |
| 3 — Shared Auth/Admin/mobile | Foundation B2 → Grant M2 | role capability consistency; desktop/320/375 login, keyboard and nav | **WAITING** previous platform denial, owner/legitimate execution route |
| 4 — Secure human email landing | Grant M4 | mounted no-login PIN/OTP/MFA/Confirm, 2 real mailboxes | **WAITING** prior blocked source route, real mailbox E2E |
| 5 — Correct approval & admin concurrency | Grant M1/M3 | overdue exclusion + two-admin CAS, source and real E2E | **WAITING** protected backend source |
| 6 — External effects + release | Control/Stellar M6, Grant M7/M8 | one durable effect/readback, two-user same-head E2E, exact CI/release | **NOT PASSED** |

**Nonnegotiable:** no proprietary competitor source copied, no new framework, no IAM resource catalog, no cross-product UI fork, no unauthorized browser collector, no platform-denied source operation retried or relabeled. Owner may evaluate this prototype as a design proposal, not live Grant.
