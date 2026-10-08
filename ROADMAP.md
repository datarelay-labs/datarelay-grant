# DataRelay Grant — 1.0 Product Roadmap

Accepted: 2026-10-07
Owner accepted G10A-0..5 roadmap and safe per-answer email UX: 2026-10-08
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

Email approvals in this baseline use a **single request-detail link**, not
three patent-style decision links; emailed PIN/OTP verification is not present.
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

Development candidate: Work Packet #46 implements read-only integration
diagnostics, credential-role presets, bounded audit/connection-test history,
and a non-executable safe configuration metadata export. Full validated import,
real DataRelay/Stellar integration, external E2E and release acceptance remain
uncompleted gates. No test fixture is promoted to external PASS.

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

Development candidate: Work Packet #48 implements bounded admin audit search,
typed redacted CSV/JSON evidence export, request-to-result chain inspection,
backup/restore verification and nonmutating policy/template conflict preview.
Configuration import/apply, operator identity mapping, release and external
consumer/Stellar acceptance remain separately gated; preview is not import.

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

Development candidate: Work Packet #50 extends current-authority read/role
verification, concurrent grant decisions, audit-export anomalous value and CSV
formula handling, CSRF/Origin and safe import-preview misuse testing. This is
source hardening, not proof of external consumer authorization; exact HEAD
CI, browser, G11 and release qualification remain independent.

### G10A — Patent-aligned email decisions with default four-digit code

Priority: **P0 before G12 final 1.0 acceptance**  
Status: **OWNER-ACCEPTED (2026-10-08); NOT IMPLEMENTED / NOT QUALIFIED.**  
Canonical requirements: `docs/PRODUCT_STANDARD.md` §§10.5–10.9.  
Trust-boundary rationale: `docs/ADR_EMAIL_PIN_DECISION.md`.  
Supporting vendor survey: `docs/APPROVAL_COMPETITIVE_REVIEW.md`.  
Dependencies: G2 templates/outbox, G3 approval plans, G4 delegation and
G10 security. Approval control remains separate from the external execution
consumer and its outcome callback.

#### Accepted default email decision journey

1. Grant sends a **separate email to each eligible approver**, containing
   unique, unguessable **Approve / Hold / Deny** response-intent links (and
   a neutral View Details link) plus one random **4-digit confirmation
   number in the SAME approval email**, bound to that request, approver
   assignment and issuance generation.
2. The approver opens a chosen link. The GET/HEAD, including Safe Links
   scanners and link previews, **only shows a generic read-only decision
   landing and code input**. It neither sends new OTPs nor mutates
   approval/execution state or discloses restricted request details.
3. The approver enters the four-digit number. A protected PIN-validation
   POST binds the link and code and grants only a short-lived,
   action/assignee/outcome-scoped confirmation context; then the page
   displays enough immutable request details for an informed decision.
4. If that customer policy requires it, the same decision also requires
   a **separately requested OTP** or **fresh MFA/identity step-up**.
   OTP delivered to the same mailbox is *not MFA*. The default mode
   **does not require Grant login**.
5. The approver deliberately presses **Confirm Approve / Hold / Deny**.
   A separately protected final POST revalidates the current assignment,
   selected outcome, action, deadline, PIN context and optional higher
   assurance, commits one human-intent event and records assurance.
   Final approval never directly executes a connected system operation.

No-login email PIN confirms possession/control of the **recipient mailbox
and email contents**, **NOT the specific named person's identity**:
a forwarded or compromised email discloses both code and URLs.
When no independent identity step-up occurred, audit records identify
the *assigned recipient* and verification method `EMAIL_LINK_PIN`
but must NOT claim that a particular person was authenticated. Verified
person/delegate identities are recorded separately only when actually
established. Customer policy can select OTP/MFA to improve assurance.

Each response link is independently unique for
`request × seat/approver × active step × chosen outcome × immutable action
fingerprint × assignment epoch × issuance generation`. A normal vote
increases mutable state revision without invalidating a different
still-eligible reviewer's link. Terminal decision consumes its link and
revokes its sibling choices, with each seat counting at most once.
`HELD` is provisional and may later become Approved/Denied within
the original business deadline.

**Parallel hold:** for ANY_ONE / ALL / N_OF_M, Hold affects **only that
approver's seat**; other eligible approvers continue, and a satisfied
threshold may authorize despite a held seat (ALL still requires all).
**Sequential hold:** the current step's Hold **blocks all downstream
steps**, which are neither activated nor mailed until the current
step explicitly approves. A Deny is terminal under existing 1.0 rules.
**Deny reason is optional by default, or required if the active
snapshotted approval policy sets `denial_reason_required=true`.**
Reject missing/blank required reasons server-side before consuming an
intent or committing a vote.

**Non-exclusive delegation (accepted):** during a currently valid,
non-revoked delegation, both the original assignee and their named
delegate receive **independent per-recipient emails, links and
four-digit PINs**, can reach the same represented seat, and may
choose Hold/Approve/Deny. A Hold is provisional and either party
may later resolve it. The first valid **terminal** approval or
denial commits atomically for that seat; it revokes both parties'
remaining decision links and counts as **one** seat vote only.
A losing concurrent response, revoked/expired delegate link, or
duplicate click creates no additional decision or effect.
Delegation expiry removes the delegate's authority without
removing the original assignee's rights. Audit precisely which
original/delegate mailbox capability was used and whether any
person's identity was independently established; EMAIL_PIN alone
is only mailbox possession, not verified personal identity.

**Link expiration:** each customer chooses a default and may override
per approval policy. Out-of-box **maximum validity is seven days** per
issuance; actual expiry = min(request approval deadline, issued-at +
customer-configured TTL). Shorter/longer customer-configured durations
are supported within server-defined safe bounds. Reminder reuse is
allowed while still valid; a deliberate reissue rotates links/code
and invalidates superseded generation without extending the request
deadline. TTL snapshots preserve in-flight behavior.

**Customer policy modes (P0):**

| Mode | Decision proof | Customer control |
| --- | --- | --- |
| `EMAIL_PIN` **default** | Per-answer link + same-email four-digit code + explicit confirmation; no login | Normal use |
| `EMAIL_PIN_PLUS_OTP` optional | Base proof plus separately requested short-lived OTP; same-email OTP is still not MFA | Per customer/policy |
| `EMAIL_PIN_PLUS_MFA` optional | Base proof plus fresh independently authenticated MFA/SSO step-up | Per customer/policy and trusted risk/action classification |

4-digit code security relies on a high-entropy opaque link plus
keyed protected PIN storage, rate limiting and maximum failed attempts,
scoped one-use verification state, anti-CSRF/Origin checks, safe
reissue/lockout recovery and monitoring. Never claim 4-digit
in-email PIN alone prevents a stolen/forwarded-mail attacker.
No untrusted requester-provided severity/risk label may lower
an administrator-defined required verification tier.

#### G10A implementation sequence — six bounded P0 deliverables

| Phase | Delivery | Evidence/exit |
| --- | --- | --- |
| **G10A-0 — Versioned approval seats** | Durable assignment/step identity and epoch independent of mutable state revision, v8→v9-or-later migration with old-request compatibility, seat-local Hold vs sequential-step blocking; versioned `denial_reason_required` flag (default false); original/delegate rights map to one seat | ALL/ANY_ONE/N_OF_M unaffected by other votes, SEQUENTIAL Hold prevents next stage, reason required/optional API validation, original-vs-delegate first terminal wins, rollback/restore valid |
| **G10A-1 — Recipient mail fanout** | Each eligible approver independently receives HTML + text with 3 unique answer links and **their own 4-digit code**. When delegation is active, mail original and delegate independently for the same seat. Sequence stage activation and reassignment handled, original one-link fallback retained | Separate recipient-specific codes/links for both parties, no duplicate seats, no CC/shared URL or inactive-step mail, no PIN/link leak in queues/previews; real SMTP receipt measured |
| **G10A-2 — PIN-scoped decision API/UI** | 256-bit opaque intents and protected binding/digests, GET/HEAD no state mutation, no-login PIN POST, bounded decision context, final explicit protected POST, policy-enforced Deny reason, first-terminal-wins per represented seat and atomic original/delegate sibling revocation | Scanner GET cannot decide; missing required Deny reason rejected, optional Deny reason allowed, no login for EMAIL_PIN, duplicate/competing original-delegate decisions, replays, expiry and forwarded email tested |
| **G10A-3 — Customer verification policy** | Tenant/installation defaults and policy override for EMAIL_PIN/EMAIL_PIN_PLUS_OTP/EMAIL_PIN_PLUS_MFA; trusted risk selector, requested OTP + fresh identity step-up and secret redaction | Customer can select code-only vs OTP/MFA; Same-email OTP not mislabelled MFA; missing mandatory MFA fails closed; old policy snapshot not silently downgraded |
| **G10A-4 — Audit + operator lifecycle** | Persist original seat, original/delegate issued mailbox capability, independently proven person (if any), decision/reason/Hold history, PIN/OTP assurance, revoke/issuance, delivery and protected queue, backup/recovery | Audit separately shows original assignment, email link recipient and verified identity if established; `EMAIL_LINK_PIN` alone never claims person verified, no raw token/code; restore and retries cannot double count or resurrect links |
| **G10A-5 — Actual Full User E2E** | Update repository-local user scenarios and surface reconciliation for unique per-person mail/PIN and optional OTP/MFA; directly test parallel/sequential Hold, optional/required Deny reasons, active delegation original/delegate independent links, first terminal race and revocation, audit assurance, execution separation | New frozen exact HEAD, independent direct two-person email/browser PASS, no double-count after competing delegate vote; exact backend readback, deterministic+full qualification and independent G11/G12 external and owner acceptance gates |

**Required implementation corrections found in current source:**
`_mail_event` sends to one representative `approver_id` despite group
plans; `decide` mutates global revision after each vote; current
`get` calls expiry mutation from GET; only neutral `request_url`
is rendered; `outbox.payload` holds plaintext data; schema v8
has no per-answer intent/PIN/seat-ledger structure. Preserve
existing G0–G10 behavior and fail closed during additive migration.
Existing R1 `/requests/{id}` login flow remains available for old
requests and normal authenticated users.

**Owner choices closed (2026-10-09):** Deny-reason requirement is a
versioned per-policy optional/required switch, default optional.
Original OR valid delegate may decide, via separate links/codes for
one seat; first terminal result wins, no duplicate vote, while a
provisional Hold can be resolved by either party. No remaining G10A
business-default decision is pending. Risk-based OTP/MFA and link TTL
remain **customer-configurable policies**. Engineering verification
still required for fresh MFA API, protected mail/crypto lifecycle,
delegation expiry/races and migration/rollback.
If safety/tool restrictions block E2E-contract changes, document
that gap honestly and do not claim G10A-5 or G12 PASS.

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

G11 readiness evidence (Work Packet #52): an online development Control
instance and an existing failed-delivery replay endpoint were inspected
read-only. Grant contract guard and correlation checks are locally tested.
No source-side Grant guard, actual protected replay/destination readback or
Stellar installed receiver has yet passed external acceptance. M3/M4 are
WAITING_INTEGRATION; this is not the G11 completion gate.

### G12 — 1.0 quality closure and release

Priority: **P0**

Required final sequence:

G10A is the **P0 planned 1.0 product gate** before final G12 closure. Its
implementation and acceptance must be reflected in final same-head Surface
Reconciliation and direct Full User E2E rather than inferred from the
patent or earlier browser fixtures. Do not silently drop G10A or mark 1.0
released without separate explicit owner scope/acceptance decision.

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
- email-to-request creation with verified inbound sender and idempotent parsing;
- authenticated inbound email-reply approvals (only with real sender proof; no free-form inference);
- external guest/no-account approvals with narrow declared trust policy;
- Outlook authenticated Actionable Messages/adaptive cards with verified Microsoft user token and web fallback;
- reviewer-role based differentiated denial thresholds beyond 1.0 any-denial finality;
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

`G0 convergence + G1/G2 closure -> G3/G4 -> G5/G6 -> G7/G8 -> G9/G10 -> G10A -> G11 -> G12`

Current approval/execution integrity and existing tests are preserved throughout.
External integration waits must not block independent product work.

## Status authority

- Product requirements: `docs/PRODUCT_STANDARD.md`
- Product roadmap and sequencing: this file and tracking Issue #37
- Comparative research: `docs/APPROVAL_COMPETITIVE_REVIEW.md` (reference only)
- Actual implementation/evidence: `docs/STATUS.md` and current Issue #54 G12 QA Work Packet; predecessor packets are not present implementation authority
- External-integration waiting evidence: GitHub Work Packets #33 and #52
- UX/IA design guide: `docs/UX_INFORMATION_ARCHITECTURE.md`
- Architecture/security details: `docs/ARCHITECTURE.md`
- User quality gates: `docs/SURFACE_RECONCILIATION.md`, `docs/FULL_USER_E2E.md`
- Engineering process: repository `AGENTS.md` and adopted Engineering System

Roadmap items are not implemented capability until code and required evidence exist.
