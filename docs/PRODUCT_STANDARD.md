# DataRelay Grant Product Standard

Version: 1.0 draft
Accepted product direction: 2026-10-07
G10A email decision/verification lifecycle direction owner-accepted: 2026-10-08
Repository: `datarelay-labs/datarelay-grant`

## 1. Product definition

DataRelay Grant is a reusable **human approval control layer between a requested
action and execution**.

It accepts an action request from an existing system, resolves the applicable
approval policy, obtains explicit human authorization, binds that authorization to
the exact action, exposes a bounded execution grant to the existing executor, and
tracks the reported execution result.

Grant is not a generic workflow engine. Existing DataRelay products, Stellar Cyber,
and other integrated systems keep their own execution, permissions, durable
operation ledger, and business logic.

The product promise is:

> Know exactly what was requested, who approved it, what was authorized, what was
> actually attempted, and what result was reported.

## 2. Product category and positioning

Grant combines the strongest useful ideas from approval-workflow products, ITSM
approval systems, and just-in-time access-control products without becoming any of
those categories in full.

Product positioning:

- lighter than ServiceNow/Jira-style ITSM;
- more execution-bound than general approval products such as ApproveThis;
- more general-purpose than infrastructure-specific JIT products such as Teleport
  or StrongDM;
- intentionally narrower than Power Automate, Tines, Torq, n8n, or SOAR/workflow
  automation platforms.

Grant competes on **approval-to-execution integrity**, not on workflow-canvas breadth.

## 3. Non-negotiable product principles

1. **Human decisions are explicit.** Silence, email opens, ambiguous free text, time
   expiry, and notification delivery never become approval.
2. **Approval is not execution.** Approval, notification delivery, execution
   commitment, and execution result are separate states and separate evidence.
3. **Authorization binds to the exact action.** Material action changes require new
   authorization.
4. **Existing systems execute.** Grant does not introduce a generic Runner.
5. **Policies are safe to administer.** Policy edits are drafted, previewed, tested,
   and activated intentionally.
6. **In-flight approvals are stable.** A request snapshots the applicable policy,
   approver plan, timing, and notification content needed to preserve semantics.
7. **External execution is not claimed exactly once.** Consumers use durable
   execution IDs, idempotency, reconciliation, and UNKNOWN when outcome is ambiguous.
8. **Notifications are not approval decisions.** Email delivery, opens, link GETs,
   Slack/Teams messages and outgoing webhooks grant no execution permission.
   A policy-authorized email decision is an explicit *scoped* human-intent
   workflow: separate outcome link + four-digit in-message code + an
   independent final confirmation POST, with recorded assurance level.
9. **Sensitive context is minimized outside Grant.** External notifications
   use bounded safe variables. Full approval detail is accessible on Grant
   only after appropriate scoped email-PIN verification or authenticated
   account/step-up, according to the customer policy.
10. **Operational exceptions are first-class.** Overdue approvals, failed delivery,
    unused approvals, UNKNOWN execution, and failed execution must be visible.

## 4. Canonical object model

### 4.1 ApprovalPolicy

An ApprovalPolicy determines when approval is required and how authorization is
obtained.

Minimum fields:

- stable policy ID and version;
- name and description;
- lifecycle state;
- integration/source scope;
- action type;
- optional bounded matching conditions;
- approval plan;
- decision-reason requirements, including the versioned optional/required
  denial-reason flag (default optional);
- response deadline;
- escalation/delegation behavior;
- execution-grant validity;
- notification template set;
- created/changed/activated actor and timestamps.

### 4.2 ApprovalRequest

An ApprovalRequest is one immutable requested action plus its approval lifecycle.

It snapshots the effective policy version, approval plan, action, safe notification
content, deadline and execution-grant settings required to preserve in-flight
behavior.

### 4.3 ApprovalDecision

A decision is one of the explicit supported outcomes and must be attributable
at the level of assurance actually established by the selected policy.
An authenticated account/SSO decision identifies a verified user. An email-link
plus same-message PIN decision, by contrast, is attributed to the *assigned
recipient's mailbox authorization*, not proof that the named person actually
clicked it. Both require an explicit final POST and must record the method and
strength honestly. Decisions never come from notification transport success.

Required first-class outcomes:

- APPROVED
- HELD
- DENIED

Product 1.0 also supports a collaboration outcome:

- CHANGES_REQUESTED / MORE_INFORMATION_REQUIRED

A changes-requested flow must not silently reuse prior authorization. Material
request changes create a new revision/request with explicit history.

### 4.4 ExecutionGrant

An ExecutionGrant is the bounded result of a valid approval.

It is bound to:

- request ID;
- policy/version;
- action fingerprint;
- stable execution ID;
- validity window;
- consumer/integration identity.

A grant is not proof that execution occurred.

### 4.5 ExecutionResult

Execution results are separately reported as:

- RUNNING
- REPORTED_SUCCEEDED
- REPORTED_FAILED
- UNKNOWN

Reported success is not independent verification unless a separate verifier exists.

### 4.6 NotificationTemplateSet

A template set groups notification content by event instead of treating email bodies
as arbitrary standalone documents.

Product 1.0 event set:

- Approval requested
- Reminder
- Approved
- Denied
- Expired
- Cancelled
- Execution succeeded
- Execution failed / unknown

Templates use system-owned layout and bounded editable content. Arbitrary executable
mail scripts or unrestricted HTML are not part of the core product standard.

## 5. Approval policy lifecycle

Policies use an explicit lifecycle:

`DRAFT -> TESTING -> ACTIVE -> DISABLED`

A policy is never made effective merely by saving edits.

### DRAFT

- editable;
- not matched for live requests;
- may be previewed.

### TESTING

- evaluated with sample or isolated test requests;
- notification content can be previewed;
- test notifications may be sent only to the authenticated administrator or a
  designated safe test recipient;
- no production business action is authorized.

### ACTIVE

- eligible for live policy matching;
- version is immutable for already-created requests;
- edits create a new draft version rather than mutating active historical semantics.

### DISABLED

- no new requests match the policy;
- historical requests and audit remain available.

Policy clone is supported for safe reuse.

## 6. Policy matching

Product 1.0 supports a bounded condition model, not a generic expression language.

Core selectors:

- integration/source;
- action type;
- tenant/customer scope;
- environment;
- severity;
- risk level.

The default matching model is deterministic AND across configured selectors.

No arbitrary scripting, loops, remote lookups, or user-authored code is allowed in
policy matching.

A policy-preview function must show which policy would match a sample request and why.

## 7. Approval plans

Product 1.0 supports:

- Single approver
- Any one of a group
- All approvers
- N-of-M
- Sequential approval steps

Approvers may be:

- individual Grant users;
- administrator-managed groups.

Self-approval remains prohibited unless a future explicit product requirement says
otherwise for a narrowly defined use case.

Each step records its own state, actors, timestamps and comments/reasons.

## 8. Delegation, reassignment and escalation

Real operations must not stop because one person is absent.

Product 1.0 supports:

- time-bounded delegation/substitute approver;
- administrator reassignment with audit;
- reminder schedule;
- escalation after configured elapsed time;
- escalation to another user or group.

Delegation and reassignment never rewrite historical attribution.

## 9. Request collaboration

Approval is a decision process, not only two buttons.

Product 1.0 supports:

- requester context and reason;
- bounded comments;
- approver questions;
- request-more-information / request-changes;
- linked resubmission/revision;
- revision comparison for material fields;
- immutable history across revisions.

Comments never modify the authorized action.

## 10. Notification standard

### 10.1 Channels

Email is required for 1.0.

Slack/Teams are supported extension channels after the email and webhook contracts
are stable; they must use the same notification-event model and never create an
alternate approval authority.

### 10.2 Safe variables

Only explicitly approved variables may appear in external notifications.

Core safe variables include:

- request title;
- request URL;
- external request ID;
- action type;
- target when allowed by policy;
- bounded reason when allowed by policy;
- deadline;
- decision state;
- execution state.

Secret values, credentials, raw tokens, private keys, arbitrary request parameters
and unbounded source payloads are forbidden.

### 10.3 Preview and test

Administrators can:

- preview each event template with sample data;
- preview the complete rendered message;
- send a test message to themselves/designated test destination;
- see transport acceptance separately from actual inbox receipt.

### 10.4 Branding

System-level notification branding owns product name, sender display name, logo and
basic visual identity. Policy-specific content can override text, not security-owned
layout or authority controls.

### 10.5 Email decision links (owner-accepted G10A; backend-only candidate)

The requested/reminder email for each currently eligible assigned approver
contains four separate actions: **Approve**, **Hold**, **Deny** and
**View Details**. Every decision button has its *own* unguessable URL,
bound server-side to the immutable requested action, approval step and
assigned approval seat. This follows the multiple response choices described
by US 12,056,667 B1 (Figures 13–16) without allowing mail-scanner
GET/prefetch requests to record a decision.

A decision-intent reference is bound to:

`(request_id, approver_assignment_id, approval_step_id, selected_outcome,
  action_fingerprint, assignment_epoch, issuance_generation)`

A cryptographically random **at least 256-bit opaque token** identifies each
intent. Tokens cannot be composed from user IDs, addresses or answers and
must be collision-safe and unique for every request, approver, answer,
step and issuance. Server records store a protected digest, binding,
expiry, and current/redeemed/revoked status; raw URLs, token values and
the four-digit code must not appear in audit exports or diagnostic logs.
Reminders may reuse a valid generation; an authorized reissue rotates it
and invalidates superseded links.

**Opening the email link (GET/HEAD/preview/prefetch) does not commit a
decision, start OTP delivery, expose request details, or execute anything.**
It only opens a safe page with the intended answer preselected and a
four-digit confirmation-code input. A normal mail-security scanner GET
therefore cannot accidentally approve or deny.

### 10.6 Customer-controlled decision verification (owner-accepted G10A)

**Default for a newly configured customer/policy: `EMAIL_PIN`.**
The user receives a separate Approve/Hold/Deny link and a **four-digit
random confirmation number in the SAME approval email**, uses the chosen
link, enters the code on the web page, sees the decision context, and
explicitly chooses the final Confirm action. **No Grant username/password
login is required by default.**

An optional customer/approval-policy setting raises the verification
requirement based on trusted action classification:

| Verification policy | Required user actions | Assurance meaning |
| --- | --- | --- |
| `EMAIL_PIN` (**DEFAULT**) | Unique response URL + same-email four-digit code + separate Confirm POST; **no login** | Mailbox/link possession and explicit intent only; NOT verified identity / NOT MFA. |
| `EMAIL_PIN_PLUS_OTP` (**OPTIONAL**) | Default flow plus independently requested short-lived OTP (e.g. six-digit, new message) | Additional proof of ongoing access to the chosen delivery channel. An OTP delivered to the **same email** remains single-factor; do not label it MFA. |
| `EMAIL_PIN_PLUS_MFA` (**OPTIONAL**) | Default flow plus fresh policy-configured identity/MFA step-up (for example SSO + approved second factor) at decision time | Stronger, separately verified actor identification **only when the installed mechanism provides it**; if unavailable, fail closed. |

A customer may apply these tiers by policy/integration/trusted action
kind and approved asset/risk classification. Do not allow an untrusted
requester's `risk_level`, `severity` or free-form fields to downgrade
required verification. Defaults and security settings are versioned and
snapshotted into the request; newly changed customer settings do not
silently relax in-flight requests. Security administrator revocation
and account/assignment disablement override stale issuance.

The four-digit number is generated with a cryptographic RNG **separately
for each request + eligible assignee + issuance generation**, and may
be shared across the three distinct choice URLs sent in that one
recipient's email. It is NOT appended to those URLs and is never
accepted independently of its matching opaque link and exact action.
Validate on the server with keyed nonreversible storage; provide tight
per-assignment/token, per-recipient and global attempt/rate limits
(proposed default: five failures, then revoke and require safe reissue)
to protect a 10,000-value code space. Brute-force limits, lockout
recovery and denial-of-service tests are release gates. Do not use a
plain unkeyed hash of a four-digit PIN as an offline secrecy guarantee.

For optional emailed OTP: issue only after a deliberate, verified
request POST, never as a GET side effect; expire promptly (proposed
five minutes), allow at most three failures per challenge, rate-limit
reissuance, consume once and bind to the same action/seat/selected
outcome. The extra email OTP is an optional friction and freshness
measure; a compromised/shared mailbox defeats both email proofs.
For genuine MFA, validate a fresh identity factor through a
supported, securely implemented mechanism; an email code alone is
never called an authenticator satisfying MFA.

### 10.7 Approval assignments, mail fanout and state versions (G10A)

Keep three independent state dimensions:

- `action_fingerprint`: immutable requested business operation. Any
  material change requires a new request and new authorization.
- `approver_assignment_id`, `approval_step_id`, `assignment_epoch`:
  stable approval seat and authority version, changed by reassignment,
  revocation, authorized delegation or material step changes.
- `state_revision`: mutable optimistic-concurrency value for votes and
  operational updates. One approver voting must NOT invalidate links
  for other currently eligible assignees whose assignment epoch
  and action remain unchanged.

Mode semantics are accepted as follows:

- `SINGLE`: one pending seat; notify its assigned email address.
- `ANY_ONE`, `ALL` and `N_OF_M`: deliver **independent** recipient
  emails with their own decision links/code; do not CC one shared
  URL. A provisional **Hold applies only to that approver seat**.
  Other eligible users continue, and the threshold may be satisfied
  despite another seat being on Hold. Under ALL, every required seat
  still needs an explicit approval.
- `SEQUENTIAL`: activate and notify ONLY the current step. If that
  approver selects Hold, **the next step does NOT start**. Only a
  valid approval of the current step advances and issues email links
  to the next step. A denial terminates under current 1.0 rules.
- `HELD`: a reversible decision for that seat within the original
  deadline; it never authorizes execution. While delegation remains
  valid, either the original assigned approver or an eligible delegate
  may later Approve or Deny with their OWN independently issued
  current intent; neither can add a second vote for the same seat.
  Other seats stay unaffected.
- `APPROVED` / `DENIED` final decisions consume their selected
  intent and revoke ALL remaining unused choices for that SAME
  approval seat, including the original recipient's and delegated
  recipient's links. Other seats remain eligible only while the
  quorum/stage is still open. No duplicate vote from original plus delegate.

**Accepted non-exclusive delegation (owner decision):** throughout an
active, non-revoked delegation window, the original assigned approver
and the designated delegate **both remain eligible to decide for the
same single approval seat**, using independently generated recipient-
specific links and 4-digit email codes. This never creates a second
seat or raises the approval quorum. The **first valid terminal
decision** (Approve or Deny) wins for that seat, atomically and
exactly once; concurrent or later conflicting decisions by the
other actor fail with a safe already-decided result and no new
outbound business effect. A provisional Hold may be superseded
by either eligible party before the deadline. Delegation expiry
or revocation invalidates only the delegate's remaining authority,
not the original assigned approver's valid right to decide.
Always revalidate delegation/window/approval-step/assignment epoch
at final confirmation. Audit original seat, link recipient
(original or delegate), method/assurance and independently verified
person (if established) **separately**; receiving a forwarded
email never proves the named recipient personally acted.

Reassignment, delegation, escalation, account disablement and revocation
recompute CURRENT eligible seat/actor, revoke unauthorized issued
links, and independently notify new eligible recipients. Pre-G10A
unsealed approval invitations queued before such changes must be
revalidated against current eligible approvers/delegates and registered
mailbox addresses at dispatch, including historical rows lacking
recipient metadata; obsolete destinations must be superseded. An
unbound G10A sealed decision email never qualifies as legacy mail.
New delegate mail must not reveal or reuse the original person's
response links or code. A historical policy snapshot never
restores permission revoked by a later security event. Current 1.0 semantics **any denial is terminal**; if the
customer wants configurable denial thresholds or global Hold veto,
that is a separate explicit product design decision, not implicit
in this accepted Hold model.

**Accepted configurable Deny reason (owner decision):** each approval
policy version defines `denial_reason_required: boolean` (default
`false`, i.e. optional). Administrators may set it to `true` to
require a bounded nonblank explanation whenever the final choice is
Deny, including loginless EMAIL_PIN and delegated decisions.
UI validation and server-side final-confirmation POST validation
must enforce the effective snapshotted policy; a missing/blank
required reason does not consume the intent or record a denial.
When disabled, Deny must succeed without a reason; an optional
provided reason remains in the protected audit event. Changes
to the policy must not retroactively alter in-flight requests.
Approve/Hold reason handling is separate and remains governed by
their existing policy settings, if configured. This does not
change the any-Deny-is-terminal rule.

### 10.8 Protected decision execution, evidence and recovery (G10A)

**Loginless scoped decision context:** the link's opaque reference
identifies an *intent*, not a general authenticated Grant user. A
four-digit PIN is submitted by a protected POST, with CSRF/Origin and
rate-limit defenses, against that exact intent and assignee
generation. Only after successful PIN validation may a very short-lived,
one-use **decision-scoped** confirmation context show the minimum
required immutable request details and enable the final
`Confirm Approve` / `Confirm Hold` / `Confirm Deny` POST.
Before PIN validation the page shows a generic request notice and
preselected action, not internal asset names or requester details.
The confirmation context authorizes no normal request:read,
administrator or grant:consume capabilities and cannot select
a different decision/target. A customer-required OTP or MFA gate
is evaluated before final decision commit.

**Decision preflight API contract:** opening the scoped link always remains
anonymous and read-only (`landing_requires_login=false`). The
`requires_login` flag describes the requirements to **complete the final
decision**, not to open the link: it is true if the current trusted
verification minimum is `EMAIL_PIN_PLUS_MFA`; same-mailbox extra OTP is
represented separately by `requires_additional_email_otp` and is not login
or MFA. Both the anonymous intent GET and the successful PIN verification
response report these flags using the current effective policy/minimum. A
later administrative tightening can change the reported requirement;
the server still rechecks it atomically at final confirmation. GET/HEAD
must neither expose private request details nor issue/consume challenges.

**Atomicity:** one protected decision transaction rechecks the
current assignment epoch, exact action, selected outcome, live
request status, deadline, appropriate verification and policy
threshold. It commits an append-only decision event, current seat
vote, consumed intent and sibling revocation, plus any notification
outbox effects atomically. Concurrent conflicting responses cannot
both win; repeat POST/replayed link is harmless. Ordinary GET/HEAD
must be side-effect-free even if the *existing request-detail GET*
currently runs expiry maintenance; use separate maintenance/POST
for lifecycle mutation.

**Auditable identity limits:** always preserve (a) assigned
recipient/approval seat and which independently issued original/
delegate mailbox link was used, (b) actual verified account identity
**only when** account/SSO/MFA step-up occurred, (c) otherwise
`actor_assurance=EMAIL_LINK_PIN` with `verified_person_id=null`,
(d) represented/delegated assignment when present, (e) specific
action hash, link/issuance ID, decision outcome and time.
For the default EMAIL_PIN option the audit statement must say
"confirmed using access to the assigned recipient's email" rather
than asserting that a named human identity was cryptographically
verified. Users forwarding the email expose BOTH the link and PIN;
they can act as the recipient unless the policy requires an
independent identity step-up. Customer UI must explain the risk
truthfully. Shared mailboxes cannot prove individual authorship.

**Sensitive outbound mail:** four-digit codes intentionally appear
in the delivered message, but must be sealed/encrypted in any
pending SMTP outbox/persistence/backup or materialized securely
at delivery time, never persisted as plaintext approval-message
secrets. Send mobile-friendly HTML action buttons with equivalent
plain-text links. Never put codes in URLs, tracking pixels, third-
party referers, analytics or audit. Protect origin and
referrer headers, link preview, email forwarding, SMTP retries
and backup restore. Admin template previews/test emails must use
non-authorizing masked data.

**Expiry:** each customer/installation sets the default
`decision_link_ttl` and may configure a tighter or longer
per-policy TTL within bounded server-configured safety limits.
The **out-of-box default maximum link lifespan is seven days**.
Actual expiry is the *earlier* of request approval deadline and
issued-at plus the configured TTL. TTL does NOT extend the
approval request's business deadline. A standard reminder
reuses still-valid issued links. If the encrypted original
mail material is missing, it must fail closed and must not
create a second active link/PIN issuance. If an existing issuance
has expired or previously been revoked, a routine reminder must
not create a replacement issuance; only an explicitly authorized
administrator may reissue. A currently active recipient issuance
whose registered email address changes is an existing exception:
the old mailbox link is revoked and fresh protected mail is issued
only to that recipient's new eligible registered address. A new
eligible seat or recipient with no prior generation may still
receive their first issuance. An explicit authorized
reissue revokes a previous issuance generation and creates
new links/code; a long-running request may safely reissue
without silently extending the deadline. Reissue actions and
why/when/for whom are audited.

**Reminder accounting:** `reminder_count` records a scheduled reminder
round **only if at least one email was actually queued**; multiple
approvers in the same round do not consume additional counts. A
scheduled attempt that queues no message (for example when an active
issuance has lost its sealed mail source or all issuances are expired)
must not be logged as `request.reminded` or consume the reminder
budget. Record a bounded `request.reminder_skipped` audit event and
advance the next check by the existing reminder interval to prevent
a hot retry loop. Queued mail is not proof of SMTP transport acceptance
or actual recipient inbox receipt.

**Recovery and qualification:** encrypted queued mail, one-use
decision sessions, issued links, revoked links, prior Holds,
actual actor/evidence and request execution state must survive
supported upgrade/restore without reauthorizing a superseded
request, account or token. Real mailbox and browser E2E must
test at least two distinct recipient accounts in **loginless
EMAIL_PIN** mode plus protected MFA/OTP test modes, all group
and sequential Hold rules, security-scanner GET, copied/
forwarded email limitations, incorrect/expired PIN,
rate-limit/reissue/expiry, concurrent POST, current
quorum and separate DataRelay consume/result readback.
Scripted fixtures remain supplemental to direct Full User E2E.

### 10.9 Accepted policies and open choices (owner 2026-10-08)

| Policy decision | Status / intended behavior |
| --- | --- |
| **Default verification** | **ACCEPTED:** `EMAIL_PIN`; distinct answer links, same-email four-digit code, no login, final explicit confirmation. Customer can optionally require a separate OTP or genuine MFA by verified trusted policy risk. |
| **Parallel Hold** | **ACCEPTED:** Hold is local to the seat; other approvers continue, and ANY_ONE/N_OF_M threshold may complete. ALL waits for all approvals. |
| **Sequential Hold** | **ACCEPTED:** Hold prevents activation/notification of subsequent steps; only current-step approval advances. |
| **Link lifetime** | **ACCEPTED:** customer-configurable TTL (customer default and per-policy override), out-of-box maximum seven days, never beyond approval deadline; customer can select a different bounded TTL. |
| **Identity evidence** | **ACCEPTED SECURITY REALITY:** email-link + same-message PIN proves neither a specific person nor independent MFA; audit preserves assigned recipient and verified actor separately and records EMAIL_LINK_PIN assurance for no-login decisions. |
| **Deny and reason** | **ACCEPTED:** `denial_reason_required` is a policy-versioned Boolean, default false (optional). A policy may require a bounded nonblank Deny reason, enforced by server and UI on the final confirmation POST. Any Deny still terminates under current 1.0 semantics. |
| **Delegation** | **ACCEPTED:** original assignee **OR** active authorized delegate may act on the same represented approval seat using separate choice links/codes; first valid terminal decision wins. An existing Hold may be resolved by either. Each seat contributes at most one vote, original stays eligible while delegation is valid, expiry/revocation removes delegate access. Audit the source mailbox link separately from independently verified identity, if any. |
| **Verification risk defaults** | **CUSTOMER CONTROL:** customer admin may require OTP or fresh identity MFA based on trusted integration/action/asset policies. Requester-provided risk fields cannot downgrade the effective requirement. |
| **Migration** | Existing in-flight requests retain the neutral authenticated Request Details experience unless a separately authorized compatible upgrade/migration establishes secure link issuance. No retroactive unsafe links. |
| **1.1 scope** | Email-to-request, arbitrary reply-to-email approval, Outlook actionable cards and open external guest workflow are not silently added to 1.0. The bounded `EMAIL_PIN` no-login **decision-only** flow is a deliberate 1.0 exception, not generic guest account access. |

**Decision closure (2026-10-09):** owner approved per-policy optional
Deny reason and non-exclusive original-or-delegate approval, both
with exactly-one-terminal-decision-per-seat semantics. No pending
business default decision remains in §§10.5–10.9; implementation
must still verify migration, rate limits, permissions, identity
assurance and the complete user gates.

**Implementation planning:** G10A-0, backend-only G10A-1/2, and the
policy-version/extra-email-OTP portion of G10A-3 are implemented in an
unreleased branch with isolated deterministic tests. Backend-only
EMAIL_PIN_PLUS_MFA can verify an enrolled Grant account through its current
authenticated session and a NEW one-use, rate-limited TOTP proof bound to
that particular email intent and confirmation context. Missing TOTP,
stale/revoked sessions, unsupported external IdPs and proof replays fail
closed. This local-account verification is not legal proof of a person's
identity and is not a verified customer SSO integration. No decision Web UI,
live external mailbox receipt or direct Full User E2E has passed. Complete
G10A-3..5 external and user gates remain pending.
Cross-project Foundation still owns shared Auth UI; the
no-login Grant decision screen is a Grant-domain scoped surface,
not a fork of the shared user sign-in UI. The bounded design rationale
and residual impersonation risk are captured in
`docs/ADR_EMAIL_PIN_DECISION.md`.

## 11. User experience standard

Grant follows the DataRelay Product Foundation for shared application identity, semantic
tokens, authentication presentation, product shell, navigation behavior, account/session
UX and common System Administration. Grant owns approval-domain pages and adapters; it
must not fork or independently redesign shared Foundation surfaces.

### 11.1 Home / action center

Home answers **what needs a human to act now?** It is not a SOC/NOC dashboard and does
not lead with charts.

Priority content:

- needs my decision;
- overdue or held approval work;
- notification/delivery failures needing operator attention;
- approved-but-not-consumed or execution-unknown/failure exceptions;
- recent requests and direct actions such as New request.

### 11.2 Approval Inbox

The primary approver view prioritizes work that needs action:

- Needs my decision
- Overdue
- Held
- Delegated to me
- Recently decided

### 11.3 Requester view

Requesters can see:

- requested action;
- current approval stage;
- who/which group is waiting;
- deadlines;
- comments/questions;
- notification state;
- execution state/result;
- revision history.

### 11.4 Search and filters

Product 1.0 supports filtering/search by:

- request state;
- policy;
- requester;
- approver/group;
- integration;
- action type;
- date range;
- delivery state;
- execution state.

### 11.5 DataRelay-family sign-in and application frame

Grant uses Product Foundation Auth UI and Product Shell rather than a product-local
parallel implementation.

Sign-in follows the DataRelay-family composition:

- the overall sign-in composition is centered in the viewport;
- product identity/context is on the left and the bounded credential card is on the
  right on desktop, collapsing to one column on narrow screens;
- the credential card uses the common `Welcome to DataRelay` /
  `Please sign in to continue.` framing;
- username/password, password visibility, MFA/recovery, validation and account guidance
  use the shared Foundation interaction contract;
- DataRelay documentation, quick-start, release, website and support resources may be
  exposed through the shared auth frame;
- Grant-specific product identity and copy explain approval control without changing
  authentication authority.

The mature DataRelay Control sign-in/shell is a DataRelay-family reference for
composition and density, not source authority to copy. Foundation remains the shared UI
authority and Grant remains the authentication/session/state authority behind its typed
adapter.

The desktop Product Shell uses the Foundation responsive sidebar baseline (260px
expanded / 57px collapsed), grouped task navigation, product identity at the top and the
signed-in user/account actions at the bottom. Mobile navigation is off-canvas and must
preserve focus/keyboard behavior.

## 12. Application and administrator information architecture

Canonical primary navigation:

~~~text
Home

Work
├── My approvals
└── Requests

Configuration
├── Approval policies
├── Notifications
├── Integrations
└── Approvers          # appears when G3/G4 capabilities exist

Administration
└── Administration

Signed-in user
└── Account & Security
~~~

Primary navigation represents user goals, not every configuration object. Account
security, theme and sign-out live with the signed-in user in the Foundation shell.
New request is a primary action from Home/Requests rather than a permanent sidebar
destination.

Canonical Administration content remains task-oriented:

~~~text
Administration
├── System health / information
├── Accounts
├── Audit history
├── Mail delivery test
└── Lifecycle / recovery guidance
~~~

The Administration landing surface uses Product Foundation capability declarations and
common administration components. Unsupported backup/restore/TLS/upgrade mutations are
not made interactive merely to fill a settings page.

Configuration detail:

~~~text
Approval policies
├── Policies
├── Draft / Test / Activate
├── Preview & Test
└── Version / Change History

Notifications
├── Template Sets
├── Delivery Health
└── Branding

Integrations
├── DataRelay
├── Stellar Cyber
└── Credentials / Health
~~~

Do not grow top-level navigation for every small setting and do not turn configuration
pages into an NOC-style wall of permanently expanded panels.

## 13. Policy administration standard

The policy editor is organized as:

1. **General** — name, description, lifecycle/version.
2. **Applies To** — integration/action/tenant/environment/severity/risk.
3. **Approval** — mode, steps, users/groups, reason requirement and decision
   verification mode (G10A, when implemented).
4. **Timing** — deadline, reminder, escalation, delegation behavior.
5. **Execution Grant** — validity and action binding.
6. **Notifications** — template set and event enablement.
7. **Preview & Test** — policy resolution, approvers, rendered notifications and
   isolated test request.
8. **History** — versions, changes and activation events.

## 14. Operational dashboard

Grant includes a small operational dashboard, not a BI product.

Required operational indicators:

- pending approvals;
- overdue approvals;
- held requests;
- average/median approval time;
- denied/expired/cancelled counts;
- delivery failures;
- approved but not consumed;
- execution UNKNOWN;
- execution failures;
- integration health / last successful callback.

Every metric links to the underlying requests.

## 15. Integration standard

Integrations are scoped identities, not generic arbitrary connectors.

Required properties:

- explicit integration identity;
- allowed source/tenant;
- registered callback destinations;
- least-privilege credentials;
- separate producer and executor/reporting scopes where practical;
- connection test;
- last success/failure and health;
- credential metadata and revocation;
- idempotent external request identity;
- correlated outcome events.

DataRelay integration must enforce Grant immediately before the actual product-owned
operation. Stellar integration must use an actual supported outgoing responder and
actual receiving path; echo fixtures are never completion evidence.

## 16. Audit and evidence standard

The audit trail links:

`request -> matched policy/version -> approval plan -> human decisions/comments ->
notification delivery -> execution grant -> consumer commitment -> reported result`

For G10A email decisions, audit evidence additionally distinguishes the original
assigned email recipient from the **authenticated person who submitted the
final decision**, any authorized delegation, the selected answer/link binding,
request/step/revision, verification result and decision timestamp. Audit views
must answer **who actually approved or denied which exact action, and when**
without revealing raw action-link references or challenge secrets.

Audit records are append-oriented product evidence. Administrative policy/template/
group/delegation changes are also audited.

Exports must distinguish current authoritative state from historical events.

## 17. Security standard

Product 1.0 requires:

- explicit human-intent decisions with policy-appropriate assurance:
  authenticated account decisions or tightly scoped no-login email-link
  plus four-digit-PIN confirmation; audit must never mislabel the latter
  as verified individual identity;
- GET/HEAD/email-prefetch paths never mutate approval state or send challenges;
- email-only verification codes are not independent MFA;
- MFA capability;
- scoped integration credentials;
- CSRF/session protection;
- no secret values in notifications/audit;
- configured destinations only;
- TLS outside explicit loopback development;
- bounded payloads/rate limits;
- current-authority checks on privileged mutations;
- policy/action snapshot integrity;
- conservative backup/restore reconciliation;
- explicit credential revocation;
- fail-closed behavior when Grant authority is unavailable.

## 18. Configuration portability

Administrators can export/import approval-policy and notification-template
configuration using a versioned, validated format.

Import never imports raw credentials, passwords, tokens, TOTP material or installation
encryption keys.

Conflict/preview is shown before applying imported configuration.

## 19. Product 1.0 scope boundary

Product 1.0 intentionally does **not** become:

- a generic workflow canvas;
- an arbitrary script runner;
- a SOAR playbook engine;
- an IAM provisioning platform;
- a ticketing/case-management replacement;
- a data-transformation engine;
- a full enterprise notification platform;
- a billing or multi-tenant SaaS control plane;
- an AI system that infers or auto-grants human approval.

Future AI assistance may explain, summarize or preview policy effects but must never
silently replace required human authorization.

## 20. Conformance rules

A capability is product-conformant only when:

- its authoritative state and transitions are explicit;
- permission boundaries are enforced server-side;
- UI does not simulate unavailable backend behavior;
- existing-request semantics survive later policy/template changes;
- failure and ambiguous external outcomes remain visible;
- deterministic tests cover authorization and state transitions;
- user-surface behavior is verified where user-facing;
- external integration claims have actual external evidence.

## 21. Competitive design references

The product direction intentionally borrows proven interaction patterns, not
vendor-specific implementation or branding.

### 21.1 Work and information-architecture references

- Microsoft Entra My Access — landing overview emphasizes pending requests/reviews and
  separates request history, approvals and reviews by user task;
- ServiceNow — approvals are handled as an explicit user work queue with request detail
  as the decision context;
- Jira Service Management — incoming work is organized as searchable/sortable queues
  optimized for triage rather than dashboard watching;
- Okta Identity Governance — end-user request/catalog work is separated from
  administrator governance configuration;
- Apono — access-flow administration emphasizes discoverable policy lists, filters,
  duplicate/reuse and explicit active/inactive state;
- Teleport — access requests are request-first, bounded and temporary, with web flows
  organized around the resource/role being requested;
- Opal — request/security configuration is attached to focused resource detail rather
  than a permanently expanded global settings canvas;
- ConductorOne — end-user Home/tasks/request work is separated from administrator
  applications, policies, connectors, users and settings;
- SailPoint — approval context and reminder/escalation behavior are treated as managed
  approval configuration rather than monitoring widgets.

### 21.2 Approval and notification behavior references

- ApproveThis — workflow testing, publish lifecycle and routing preview;
- ApprovalMax — approval matrix and operational approval notifications;
- StrongDM — separation of access conditions from approval workflow;
- Microsoft Power Automate — sequential/parallel/custom approval patterns.

These references do not expand Grant into IAM provisioning, a generic workflow engine,
ticketing, SOAR or a monitoring product. Grant remains governed by this Product
Standard, its own server-enforced contracts and tested implementation. The detailed
reference links and accepted layout implications are maintained in
`docs/UX_INFORMATION_ARCHITECTURE.md`.
