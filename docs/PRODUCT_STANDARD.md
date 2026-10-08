# DataRelay Grant Product Standard

Version: 1.0 draft
Accepted product direction: 2026-10-07
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
8. **Notifications are not authority.** Email, Slack, Teams, and webhooks can notify
   or deep-link; they do not independently grant execution permission.
9. **Sensitive context is minimized outside Grant.** Email and chat notifications
   use bounded safe variables; full details live behind authenticated Grant pages.
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
- decision-reason requirements;
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

A decision is attributable to an authenticated human and is one of the explicit
supported outcomes. Decisions never come from notification transport success.

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

### 10.5 Email decision links (planned G10A contract)

For each approval request and each assigned approver, the requested/reminder email
may present three separate labeled response hyperlinks: **Approve**, **Hold
(Pending)** and **Deny**. This preserves the response-menu interaction described
in US 12,056,667 B1 (Figures 13–16), alongside a neutral Request Details link.
Existing Grant 1.0 development currently supports only the neutral request
link and an authenticated web decision UI. Outcome-specific email links and
email verification are **planned, not yet implemented**.

Each email response link is a **decision-intent deep link**, not an approval
callback with mutation authority. Link query values and recipient display names
are never trusted as authentication. Grant's external-system signed callbacks
remain an independent *outbound event* mechanism.

**Mandatory reference uniqueness and binding.** Every email decision link has its
own non-guessable, cryptographically random opaque reference, bound on the
server to the complete tuple:

`(approval_request_id, assigned_approver_id, approval_step_id,
  selected_outcome, request_revision, issuance_generation)`

- **Per request:** two requests never reuse a response reference, even for the
  same recipient and same outcome.
- **Per approver:** within the same request, two distinct assigned users receive
  different references, even for the same selected outcome; an authorized
  delegate must have an independent assignment/identity binding.
- **Per answer button:** Approve, Hold and Deny always have three distinct
  references for each assigned approver; the bound outcome cannot be changed
  by editing a query parameter or substituting POST content.
- **Per step / version / issuance:** sequential or repeated approval steps,
  replacement/revised requests, changed authorization and newly issued links
  cannot silently reuse stale permissions. Reminder delivery may reuse a
  still-valid generation or explicitly rotate all affected references; any
  rotation revokes the superseded generation. Uniqueness must be guaranteed
  by persisted constraints and collision-safe generation, not by a reversible
  encoding of request, outcome or approver.
- Only safe opaque routing material goes into URLs. Raw link references are
  never exposed in logs, admin preview, exports or audit evidence; persist
  a protected token digest and authoritative binding instead. Links may
  help locate the intended assignment, but are **not proof of identity**.

**Decision attribution.** The authoritative decision event must record the
request ID, immutable action fingerprint, request and policy version,
approval-step/assignment ID, link reference identifier/digest, originally
assigned recipient, **actually authenticated decision actor**, any authorized
delegation relationship, selected outcome, verification method/result and UTC
decision time. An email recipient, clicked URL, unverified address or browser
GET is not an attributable human approval. The event can expose safe IDs in
the audit UI without disclosing raw token or OTP contents.

- GET, HEAD, preview and scanner prefetch must be side-effect-free: show the
  immutable action and a clearly preselected outcome, or a safe sign-in prompt.
  No decision, grant, OTP challenge or business execution occurs on link opening.
- A real, currently authorized human must deliberately confirm through an
  authenticated, CSRF-protected POST; the server rechecks assigned identity,
  policy/approval-step, delegation, revision, request state, expiration, MFA
  requirement, stored link-to-outcome binding and action fingerprint in its
  existing atomic decision transaction. A successful decision consumes its
  reference and revokes the same actor/assignment's remaining outcome links
  atomically. Other legitimate approvers retain their links only while their
  approval stage remains active under the configured quorum/sequence rules.
- The response page must clearly distinguish the already selected email outcome
  from the **not-yet-recorded** final decision. A completed/replayed/expired/
  reassigned/forwarded link may inform the viewer safely but cannot reauthorize.
- The notification service owns the safe rendering of three action-specific
  decision links. Templates may place approved link placeholders, but cannot
  construct arbitrary URLs or embed raw bearer credentials, OTP/PIN material,
  arbitrary payloads or user-controlled destinations. Preview/test messages use
  non-authorizing placeholders. Real link contents and verification details
  must be redacted in request logs, analytics and audit exports.
- No open, click, delivery receipt or external signed callback is itself a
  human approval or permission to perform the protected business operation.

### 10.6 Per-policy decision verification (planned G10A contract)

The versioned approval policy configures decision verification without altering
existing in-flight requests. Proposed tiers:

1. **Standard** — current authenticated approver, preselected email-link
   response, explicit on-page final confirmation.
2. **Verified** — Standard plus an on-demand six-digit confirmation challenge
   delivered to the assigned approver in a *separate* email when requested.
   Proposed initial limits: 5-minute expiry, maximum 3 failed submissions,
   throttled resend, bounded attempts across renewals, one-use challenge,
   no successful challenge reusable for another outcome/request/revision.
3. **High Assurance** — configured fresh MFA/identity step-up in addition to an
   explicit decision; absent/unavailable step-up **must fail closed**.

A four-digit number printed in the *original* approval email remains an optional
UX/intent confirmation candidate for further evaluation. A code delivered to
the same email account as the decision link is **not independent MFA**, nor
does it independently establish the approver's identity. Neither the 4-digit
candidate nor the 6-digit email challenge may be marketed as MFA. Challenge
materials must not appear in admin previews, diagnostics, template export,
audit data or arbitrary client response payloads.

Administrators configure verification mode, challenge expiry/retry limits and
event-safe notification appearance in Approval Policies/Notifications; defaults,
version snapshots, delivery failures and audit attribution must be tested before
any feature is claimed as supported.

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

- authenticated human decisions;
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
