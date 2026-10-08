# Grant 1.0 implementation status

Updated: 2026-10-08. G8 implementation lane: Issue #46; G7 predecessor: Issue #44 / PR #45; G5/G6: Issue #42 / PR #43; G3/G4: Issue #40 / PR #41; G0/G1/G2: Issue #38 / PR #39; external baseline: Issue #33 / PR #34.
Status: Grant 1.0 development candidate, not production/GA or full 1.0 acceptance.
Exact HEAD, CI and execution receipts belong in the live Work Packet rather than
in a self-referential source commit.

## Product direction

The accepted target is now **Grant 1.0**, governed by `docs/PRODUCT_STANDARD.md` and
sequenced by `ROADMAP.md`. The current branch remains a development baseline, not a
claim that all 1.0 workstreams are implemented. Existing R1 evidence is retained as
historical/current baseline evidence and maps into the broader 1.0 roadmap.

## Accepted UX/IA direction

The accepted Grant 1.0 UX/IA direction is recorded in
`docs/UX_INFORMATION_ARCHITECTURE.md` and the Product Standard sections 11-13. It adds
G0 Product Foundation/task-oriented UX convergence ahead of further product-surface
expansion. Acceptance of this direction is not implementation evidence; current
capability remains whatever is present and tested at the committed candidate HEAD.

## Implemented candidate

- Pinned unpublished Foundation SDK and public imports with Foundation-backed auth,
  shell, MFA/recovery, accounts/sessions, health and audit adapters. The G0 development
  candidate includes centered shared login, task-oriented Home, grouped Work / Configuration
  / Administration navigation and focused configuration pages, covered by real browser
  journeys. Final integration and release qualification are not yet complete.
- Versioned approval policies with explicit Draft -> Testing -> Active -> Disabled
  lifecycle, clone/history, bounded deterministic selectors and shared runtime/preview
  resolution. The browser request form populates configured policy selectors
  (tenant/environment/severity/risk) and disabling an old ACTIVE version does not
  overwrite the latest DRAFT editor. Saving never makes a policy live; isolated
  tests cannot authorize execution.
- A coherent Notifications area with complete event template sets, explicit safe
  variables, rendered preview/test send, delivery health/retry visibility and system
  branding. SMTP failure counts are separate from webhook delivery state. Until an
  explicit safe-test-recipient registry is implemented, sending a notification test
  is restricted to the currently authenticated administrator's own mailbox. Each
  request snapshots the exact policy version and notification content so
  later policy/template/branding changes apply only to new requests.
- G3 development candidate: approver groups and Single / Any One / All / N-of-M /
  Sequential modes, validated quorum bounds, policy-plan preview, request-time membership
  snapshots and auditable per-member decisions. An approval plan cannot silently count
  duplicate votes or allow approval by an unavailable member.
- G4 development candidate: time-bounded self-service delegation and revocation,
  administrator reassignment (recorded voters cannot be silently replaced), user/group
  escalation with snapshotted targets, overdue/escalated request projections, and
  delegated work queue/administrator browser controls.
- G5 development candidate: auditable requester/approver comments and questions,
  explicit information requests that block approval until requester response,
  change requests that require cancellation and fresh linked resubmission,
  role-checked material-field comparison across revisions and preservation of
  original immutable action/fingerprint. Migration v7 to v8 is additive and re-entry
  tested. G5 browser collaboration and replacement-diff journeys are exercised;
  this is not a release claim.
- G6 development candidate: role-scoped server-filtered approval inbox views
  (needs, held, overdue, delegated, recently decided and escalated), dedicated My
  requests workspace, administrator-selectable policy/requester/approver/group and
  integration filters, action/date/delivery/execution search and stable pagination.
  A request's approval progress and waiting party derive from the authoritative
  decision ledger, approval-plan snapshot and collaboration state. Large-list API
  pagination and actual browser requester/approver journeys are covered by tests;
  final exact-head qualification is still outstanding.
- G7 operations development candidate: read-only, admin-authorized metrics
  derived from persisted requests, decisions, escalation and transport outbox;
  pending/held/overdue, terminal states, human approval latency, failed SMTP or
  callback notifications, unused grants and uncertain/failed execution.
  Each task count links to a role-checked server-filtered request queue;
  integration observations distinguish transport acceptance from business
  execution. Backend reconciles counts with exception queues and covers 100+
  requests. Full G0-G7 local verification on this worktree passed **187
  Python/API tests**, 12 frontend unit tests, static/typecheck/build, and **15
  real Chromium journeys** including two G7 operator/admin-boundary scenarios.
  These are pre-commit development-worktree observations; exact-HEAD CI and
  owner/release acceptance remain separate.
- G8 development candidate: administrator-only read-only integration diagnostics
  (requests, callback transport acceptance/failure, scoped credential metadata and
  issuance/revocation events, connection test history), explicit producer/executor
  purpose presets and a metadata-only planning manifest for safe configuration
  export. It never serializes callback destinations, credentials or mail text
  and is not an executable backup or configuration import. Last accepted HTTP
  callback is not proof of product execution. Real DataRelay/Stellar approval
  integration and reversible validated import are NOT implemented.
- Immutable action, explicit approve/hold/deny, expiry, bounded reminders,
  cancellation and a linked replacement request.
- Source-scoped credentials, metadata/revocation and current-authority checks.
  An integration credential cannot make a human decision.
- Transactional decision/outbox, HTTP/SMTP delivery, registered endpoints, TLS,
  signatures, retry/resend and separate decision/delivery/execution states.
- Action-bound consume/replay and a non-executing Python integration client.
  Receipt, claim and result responses must match the submitted identifiers and
  action; ambiguous/oversized JSON and non-finite values fail closed.
- Protected local state, new-path backup/restore, paused reconciliation and
  conservative invalidation of restored approvals; no blind external replay.
- Locked dependency/SDK setup, source+compiled-web candidate packaging, independent
  archive/HEAD/file-hash verification, operator and external acceptance contracts.

## Observed development evidence

G0/G1/G2 PR #39 review hardening passed 139 Python/API, 12 frontend,
seven Chromium journeys at exact predecessor source HEAD 75fb144. All five
latest actionable reviews were resolved: browser policy selectors, recipient-
restricted test email, latest Draft retention, overdue/EXPIRED counting, and
SMTP error visibility. Engineering System and API/Static GitHub CI passed;
private Foundation Web read credential remains a separate approval gate.

G3/G4 + G1/G2 non-force merged PR #41 candidate passed 160 Python/API,
12 frontend and 10 actual browser journeys at exact source HEAD b6a434c.
G5/G6 plus merged G0-G4 predecessor fixes passed 175 Python/API, 12 frontend,
static/typecheck/production build and 13 actual Chromium journeys on earlier
merged source. Five new PR #43 review issues were subsequently fixed:
expired change-request linked resubmission, comparison visibility for a
replacement approver, suppression of pending/reminder delivery during blocked
collaboration, transactionally durable deadline expiry on stale comment
submission, and terminal execution progress marking. Focused request and
inbox regressions cover these five cases. Combined source has now passed
180 Python/API cases, 12 frontend unit checks, static/typecheck/production
build and 13 Chromium journeys (actual browser). Exact committed-head CI,
release provenance and owner acceptance remain in Work Packet #42.

G8 read-only integration diagnostics source passed a full **196 Python/API**,
**12 web unit**, static/typecheck/production build and **17 real Chromium**
journeys, including G8 safe metadata export and admin-only diagnostic UI.
Additional focused negative/portability cases cover callback audit timestamps,
history partitioning, redacted template bodies and nonexecutable export. These
are development-worktree tests and do not meet real DataRelay/Stellar E2E,
final committed-head CI or owner release acceptance.

Browser test sessions use disposable accounts and actual loopback SMTP/HTTP.
These are not real DataRelay/Stellar integration or production evidence.

Browser cases include two independently signed-in requester/approver passes,
mobile shared administration, cancellation/replacement, account creation,
notification-template/policy lifecycle administration and scoped credential revocation.
Screenshots were inspected. Browser tests use actual loopback SMTP/HTTP and disposable
accounts; the executor is explicitly a
fixture, not the real DataRelay consumer. Never promote these into external PASS.
Raw fixture credentials and trace archives remain private and untracked.
A Starlette TestClient deprecation warning is recorded without suppressing it.

## Milestone disposition

| Milestone | Disposition |
| --- | --- |
| M0 | Foundation/auth/admin baseline implemented and locally tested; unsupported lifecycle/TLS mutations stay unavailable |
| M1 | Core/UI plus versioned approval-policy and Notification administration tested; baseline Gmail STARTTLS/AUTH/submission and actual receipt at a distinct designated mailbox verified |
| M2 | API, strict consumer replies, durable transport and recovery tested on the development server |
| M3 | Consumer contract/client implemented; actual existing DataRelay operation NOT integrated/accepted |
| M4 | Stellar request/tenant/callback contract and guide implemented; actual Stellar receiver evidence missing |
| M5 | Browser/recovery/build verification available; actual integrations and owner acceptance still open |

## Real prerequisites, not development permission problems

1. The private Foundation web CI job requires an approved read-only dependency
   credential. The Grant repository has no repository Actions secrets at this
   observation. Host credentials are not exported or copied into Actions.
2. Read-only Control coordination reports its dev API intentionally stopped for
   preserved-database compatibility repair: datarelay-labs/datarelay-control#388,
   PR #389. Do not reset/redeploy that database or disturb its browser audit.
   Recheck the dependency and connect one actual operation at the product-owned
   execution boundary. Fixture execution is not M3 completion.
3. Stellar's deployed version, outgoing responder, actual supported webhook
   receiver and tenant/auth contract must be provided or located in the approved
   development environment. No production experiment or new relay is authorized.
4. Reconcile actual consumer/receiver evidence on the frozen candidate before
   full R1 acceptance. Publication, production and credential changes stay separate.

Remote dev-atlas execution, source editing, and authenticated GitHub coordination
are available. Engineering System migration #32 remains a separate workstream.
