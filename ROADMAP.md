# DataRelay Grant — 1.0 Product Roadmap

Accepted: 2026-10-07
Repository: `datarelay-labs/datarelay-grant`
Canonical product rules: `docs/PRODUCT_STANDARD.md`
Status: pre-release development candidate

## Product outcome

Grant 1.0 is not an MVP approval demo. It is a usable approval-control product for
small teams, operators, MSP/MSSP workflows and connected systems that need a human
decision before a bounded action may execute.

The 1.0 exit bar is:

> A team can configure approval policies, route real requests to the right people,
> collaborate and escalate when needed, safely activate policies, receive and manage
> notifications, understand pending/failed work, authorize exact actions, and audit
> the complete path through execution result.

Generic workflow automation remains out of scope.

## Current implementation baseline

The current development candidate already provides:

- Product Foundation shell/auth/account/session/health/audit adapters;
- immutable requested action and fingerprint;
- explicit approve/hold/deny;
- request deadlines, reminders, cancellation and linked replacement;
- versioned approval policies with Draft -> Testing -> Active -> Disabled lifecycle,
  bounded deterministic matching, clone/history and shared runtime/preview resolution;
- event-oriented notification template sets with safe variables, preview/test send,
  delivery health, branding and sender display name;
- request-time policy-version and complete notification snapshot behavior;
- scoped integration identities and credentials;
- durable SMTP/HTTP outbox and signed outcome callbacks;
- action-bound consume/replay protocol and result reporting;
- backup/restore and conservative recovery;
- real browser user journeys and live Gmail delivery evidence;
- generic DataRelay/Stellar integration contracts.

This baseline is not the 1.0 completion bar.

## 1.0 workstreams

### G0 — Product Foundation convergence and task-oriented UX

Priority: **P0 — precedes additional product-surface expansion**

Grant must consume the pinned DataRelay Product Foundation as the common application
platform rather than independently recreating login, shell, account/session or System
Administration interaction patterns.

Deliver:

- consume the exact reviewed Foundation package set through the consumer SDK and typed
  product adapters; no copied/forked Foundation source in Grant;
- Foundation Auth UI for DataRelay-family sign-in/MFA/session presentation, with the
  same centered product composition used by the mature Control reference while Grant
  keeps its own cookie/session authority;
- Foundation Product Shell baseline: semantic tokens, 260px/57px responsive sidebar,
  grouped navigation, product identity, user/session footer, focus/mobile behavior;
- task-oriented primary information architecture:
  - **Home**
  - **Work** — My approvals, Requests
  - **Configuration** — Approval policies, Notifications, Integrations
  - **Administration** — Administration
  - Account & Security lives with the signed-in user instead of consuming primary
    navigation space;
- Home is an action center, not an NOC/BI dashboard: work needing a human decision,
  overdue/exception work, and recent requests take priority over charts;
- Request surfaces use queue/table patterns for scanning, filtering and action;
- Approval Policies use list -> policy detail with bounded lifecycle/preview/history
  sections rather than one permanently expanded settings form;
- Notifications use Template Sets / Delivery Health / Branding with template detail and
  event-focused editing instead of one long settings canvas;
- common System Administration uses Foundation capability projections, adapters and
  AdminTaskCatalog/shared status/account/audit components; unsupported operations remain
  explicitly unavailable;
- shared styling uses Foundation semantic tokens and icons; Grant CSS is limited to
  domain layout and product-specific composition.

Exit evidence:

- no Grant-owned duplicate login/sidebar/common System Administration implementation;
- Foundation adapter/capability conformance remains PASS;
- desktop/mobile browser evidence covers login, shell collapse/navigation, account
  security and Administration task entry;
- product browser regression remains clean after shared-surface replacement;
- docs/UX_INFORMATION_ARCHITECTURE.md and docs/PRODUCT_STANDARD.md agree with the
  implemented navigation and shared-UX boundary.

### G1 — Policy lifecycle and safe administration

Priority: **P0**

Deliver:

- lifecycle `DRAFT -> TESTING -> ACTIVE -> DISABLED`;
- versioned policy edits;
- clone policy;
- policy change history;
- no live effect from save alone;
- bounded conditions: integration, action, tenant, environment, severity, risk;
- deterministic matching order/conflict handling;
- policy preview using sample request;
- preview resolved policy, approvers, timing, notification and execution-grant
  parameters;
- isolated test request;
- explicit Activate action with audit.

Exit evidence:

- active policy cannot be mutated in place;
- preview matches runtime policy resolution;
- test mode never authorizes real execution;
- conflicts and no-match behavior are deterministic;
- browser administration and API tests pass.

### G2 — Notification center

Priority: **P0**

Replace standalone mail-template CRUD with a coherent Notifications area.

Deliver:

- notification template sets;
- events: requested, reminder, approved, denied, expired, cancelled, execution
  succeeded, execution failed/unknown;
- safe-variable registry;
- sample-data preview;
- rendered message preview;
- Send test to me / designated test recipient;
- actual delivery state vs inbox receipt distinction;
- system-owned layout/branding;
- sender display name;
- delivery-health view;
- retry/resend visibility;
- global defaults plus policy-level template selection;
- existing-request notification snapshot preservation.

Exit evidence:

- unsafe variables rejected;
- template edits do not rewrite in-flight request semantics;
- live Gmail request/reminder/result messages verified;
- notification preview matches delivered content.

### G3 — Approver groups and multi-approval

Priority: **P0**

Deliver:

- approver groups;
- group membership administration;
- approval modes:
  - Single
  - Any one of group
  - All
  - N-of-M
  - Sequential steps
- step-level decision state;
- optional/required decision reason;
- self-approval prevention;
- deterministic concurrency handling;
- policy preview of the full approval plan.

Exit evidence:

- race-safe thresholds;
- duplicate decisions do not double-count;
- group membership changes do not rewrite already-created request snapshots;
- two-step and quorum browser scenarios pass.

### G4 — Delegation, reassignment and escalation

Priority: **P0**

Deliver:

- time-bounded delegation;
- substitute approver;
- administrator reassignment;
- reminder schedule;
- escalation timer;
- escalation target user/group;
- overdue state;
- audit of original and acting approver identity.

Exit evidence:

- delegation expiration enforced;
- reassignment preserves history;
- escalation cannot create duplicate authorization;
- overdue/escalated inbox behavior verified.

### G5 — Request collaboration and revision

Priority: **P0**

Deliver:

- requester and approver comments;
- request-more-information / request-changes;
- linked resubmission;
- revision history;
- material-field diff;
- prior authorization invalidation after material change;
- request context/evidence references using bounded safe fields.

Exit evidence:

- comments cannot mutate the action;
- changed action always requires fresh authorization;
- requester/approver browser collaboration flow passes.

### G6 — Approval Inbox and requester workspace

Priority: **P0**

Deliver approver views:

- Needs my decision
- Overdue
- Held
- Delegated to me
- Recently decided

Deliver requester views:

- My requests;
- current approval stage;
- waiting approver/group;
- deadline/escalation;
- comments;
- notification status;
- execution status/result;
- revision history.

Add filters/search for state, policy, requester, approver/group, integration, action,
date, delivery and execution state.

Exit evidence:

- role-scoped search/filtering;
- no cross-user data leakage;
- pagination and empty/large-list behavior verified.

Development candidate: G6 server-side role-filtered Inbox and My requests UI,
request approval-progress projection, and bounded paging tested. Final exact-head
CI/browser qualification and release reconciliation remain required (Work Packet #42).

### G7 — Operational dashboard and exception handling

Priority: **P0**

Deliver a small operations dashboard:

- pending;
- overdue;
- held;
- approval latency;
- denied/expired/cancelled;
- delivery failures;
- approved but not consumed;
- execution UNKNOWN;
- execution failures;
- integration health and last successful callback.

Every card links to filtered source requests.

Add exception queues for:

- delivery failed;
- approval expired;
- execution grant unused;
- execution unknown;
- execution failed.

Exit evidence:

- metrics derive from authoritative records;
- dashboard values reconcile with request lists;
- restart/restore does not create false operational state.

Development candidate: G7 read-only operator counts, integration transport
observations and role-checked exception queues implemented in Work Packet #44.
G0-G7 combined development worktree passed 187 Python/API, 12 frontend and
15 real-browser scenarios; exact committed-head CI, external integration and
release/owner acceptance remain separately required.

### G8 — Integration management

Priority: **P0**

Deliver:

- clearer producer vs executor/reporting credentials;
- integration health;
- last request/callback success and failure;
- credential creation/revocation history;
- connection-test history;
- configuration import/export without secrets;
- policy/template portability;
- supported DataRelay adapter examples;
- Stellar request/return mapping guidance.

Actual 1.0 integrations:

1. one real DataRelay product-owned action;
2. Stellar Cyber outgoing request and actual receiving path.

Exit evidence:

- real DataRelay approve/deny/expire/duplicate execution behavior;
- actual Stellar approved/denied correlated events;
- no fixture promoted to external evidence.

### G9 — Audit, export and operations

Priority: **P0**

Deliver:

- searchable audit timeline;
- policy/version/activation events;
- group/delegation/reassignment events;
- notification attempts;
- execution commitment/result chain;
- bounded CSV/JSON audit export;
- versioned policy/template configuration export/import;
- backup/restore coverage for all new state;
- schema migration/rollback runbook.

Exit evidence:

- end-to-end request-to-result chain reconstructable;
- export contains no raw credentials;
- upgrade and restore retain policy/request semantics.

### G10 — Security and product hardening

Priority: **P0**

Maintain and extend:

- MFA/session lifecycle;
- current-authority validation;
- scoped API credentials;
- CSRF/rate/payload controls;
- destination allowlisting/TLS;
- safe notification variables;
- action fingerprinting;
- approval-plan snapshot integrity;
- concurrency/race tests;
- audit attribution;
- secret redaction.

Add focused security testing for multi-approval, delegation, policy activation/import
and notification preview.

### G11 — DataRelay and Stellar external acceptance

Priority: **P0**

DataRelay:

- choose one representative existing product action;
- source system creates approval request;
- no fresh grant => operation blocked;
- valid grant => existing path executes;
- duplicate consume cannot cause duplicate business effect;
- actual result returned and reconciled.

Stellar Cyber:

- deployed version recorded;
- Universal Webhook Responder request configured;
- stable source/tenant identity;
- actual supported receiver configured;
- approved/denied/held/expired outcomes correlated;
- feedback loop excluded.

### G12 — 1.0 quality closure and release

Priority: **P0**

Required final sequence:

1. complete Surface Reconciliation;
2. remediate all actionable findings;
3. complete Full User E2E on the same candidate;
4. verify real DataRelay and Stellar evidence;
5. verify email notification lifecycle;
6. verify install/upgrade/backup/restore;
7. freeze candidate;
8. exact-head CI and Foundation checks;
9. candidate artifact/hash/provenance required by release contract;
10. owner acceptance;
11. separate release/tag/publication authorization;
12. post-release smoke if published.

No earlier local fixture or different-HEAD result substitutes for final same-candidate
evidence.

## 1.0 UX and information architecture direction

The accepted 1.0 application structure is task-oriented rather than monitor-oriented.
The canonical requirements are in `docs/PRODUCT_STANDARD.md`; the implementation/design
guide and competitive rationale are in `docs/UX_INFORMATION_ARCHITECTURE.md`.

Primary navigation converges to:

~~~text
Home

Work
├── My approvals
└── Requests

Configuration
├── Approval policies
├── Notifications
├── Integrations
└── Approvers          # when G3/G4 capability exists

Administration
└── Administration

Signed-in user
└── Account & Security
~~~

Home is an action center, not an NOC/BI dashboard. Requests and approvals are work
queues. Policy and notification administration use list/detail and progressive
disclosure rather than permanently expanded settings walls. Login and shared shell
composition follow the DataRelay Product Foundation and the mature DataRelay Control
family reference without copying Control product internals.

## 1.0 usability requirements

Grant 1.0 must be usable without reading API documentation for ordinary admin/request/
approval work.

Required UX qualities:

- clear empty states;
- safe defaults;
- human-readable time units;
- explicit destructive/activation confirmation;
- preview before activation/import;
- concise state explanations;
- no raw UUID dependence for normal work;
- mobile approval usability;
- visible distinction between decision, delivery and execution;
- deep links from alerts/dashboard to the exact request/problem.

## Post-1.0 candidates

Prioritize from actual use rather than speculative breadth:

- Slack and Microsoft Teams approval/notification channels;
- richer policy condition operators;
- reusable policy bundles/customer packs;
- optional SSO/enterprise identity federation;
- additional DataRelay product adapters;
- supported Stellar execution-resumption/result adapters;
- configurable branding themes;
- API-managed group sync;
- policy analytics and approval bottleneck reporting;
- AI-assisted policy explanation and request summarization with no approval authority.

## Explicit non-goals

Grant 1.0 does not include:

- generic workflow canvas;
- arbitrary scripts or remote code execution;
- SOAR playbook authoring;
- arbitrary JSON transformation language;
- IAM account/role provisioning;
- ticket/case-management replacement;
- custom database/query engine;
- billing/subscription/multi-tenant SaaS control plane;
- autonomous AI approval.

## Delivery discipline

Implementation should progress in coherent user-visible slices, not one massive rewrite.

Recommended sequence:

`G0 convergence + G1/G2 closure -> G3/G4 -> G5/G6 -> G7/G8 -> G9/G10 -> G11 -> G12`

Current approval/execution integrity and existing tests are preserved throughout.
External integration waits must not block independent product work.

## Status authority

- Product requirements: `docs/PRODUCT_STANDARD.md`
- Product roadmap and sequencing: this file
- Actual implementation/evidence: `docs/STATUS.md` and current GitHub Work Packet #42 (G5/G6); predecessor #40 (G3/G4), #38 (G0-G2)
- External-integration waiting evidence: GitHub Work Packet #33
- UX/IA design guide: `docs/UX_INFORMATION_ARCHITECTURE.md`
- Architecture/security details: `docs/ARCHITECTURE.md`
- User quality gates: `docs/SURFACE_RECONCILIATION.md`, `docs/FULL_USER_E2E.md`
- Engineering process: repository `AGENTS.md` and adopted Engineering System

Roadmap items are not implemented capability until code and required evidence exist.
