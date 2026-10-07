# DataRelay Grant — R1 Roadmap

Accepted: 2026-10-07. Target: `datarelay-labs/datarelay-grant`.
Development host: **dev-atlas**, isolated Grant checkout and loopback services.
Canonical source: the owner's accepted `datarelay-grant-R1-ROADMAP.md` attachment.
Status: implementation in progress; no production or release readiness claimed.

## Outcome and scope ceiling

Grant sits between an existing workflow and execution: obtain an explicit human
decision, bind it to the requested action, reliably communicate it, and record the
executing system's reported result. Patents are a foundation, not an R1 checklist.

R1 requires exactly two real integration outcomes:

1. One representative existing DataRelay action is gated by Grant, executed by
   that product, and reported back. A sample consumer alone is not this evidence.
2. Stellar Cyber sends an approval request over a webhook and receives the
   correlated outcome through an actual, verified Stellar webhook receiver.
   Decision delivery is not execution success or proof of automation resumption.

One installation, one administratively controlled organization, pre-provisioned
approvers, and explicitly configured integrations. Source ownership and scoped
authorization remain mandatory. No multi-customer SaaS or external self-signup.

## Reuse before domain development

Engineering System governs development/test/release; it is not a runtime service.
Consume an exact Product Foundation public SDK, not copied or forked shared UI.
Use product-owned adapters for shared shell, auth, account/session and supported
System Administration surfaces. Foundation does not implement Grant's backend,
credential storage, database or approval authority. Unsupported capabilities must
remain unavailable; do not fabricate working controls or wait for the entire
Foundation roadmap. No cross-product standardization project or circular release
prerequisite is introduced.

Authority: `Foundation UI -> Grant adapter -> Grant API/authorization/state`.

## Milestones

| Milestone | Priority | Scope | Required exit evidence |
| --- | --- | --- | --- |
| R1-M0 | P0 | Real Foundation shell/auth/admin adapters; persistence/configuration/build/deployment baseline; discover first DataRelay action and Stellar prerequisites | Exact SDK build/conformance, real supported auth, tests/release metadata; no mock administration |
| R1-M1 | P0 | Request creation, admin-managed approval policies and plain-text email/reminder templates, one fixed approver per policy, mobile decision page, approve/hold/deny, deadlines/reminders/cancel, timeline | Two-user browser flow; policy/template snapshot behavior; wrong-user/self-approval prevention, duplicate/deadline races, restart persistence |
| R1-M2 | P0 | Common request intake, outcome webhook, status lookup, execution validation/consumption and result intake | Actual HTTP contract tests, scope/auth/correlation/dedup/retry/restart/changed-action/cancel-consume races |
| R1-M3 | P0 | One actual DataRelay product action using its existing execution boundary | Real consumer approve/execute/result; deny/hold/expire block; no changed-action or duplicate effect under documented consumer contract |
| R1-M4 | P0 | Stellar request mapping, source/tenant correlation, registered return webhook and test guide | Actual Stellar request and approved/denied outcomes located at the actual receiver; version/endpoint evidence |
| R1-M5 | P0 | Internal-use qualification, operational recovery and operator guidance | Same-candidate browser/two-user E2E, real integrations, restart and backup/restore, install/upgrade/rollback evidence |

Each milestone includes targeted tests. M5 is final confirmation, not the first
test phase. M0-M2 and independent recovery work continue when external credentials
or endpoints are absent, but missing actual evidence must not be marked PASS.

## Minimal contracts

### Approval policies, mail templates, requests and decisions

An approval policy fixes integration, allowed action type, assigned approver,
optional administrator-managed email template, response deadline, reminder interval/count
and execution validity. Email templates define bounded plain-text approval and reminder
subjects/bodies using only documented variables. Policy/template changes affect future
requests only because each request stores an immutable snapshot. Inbound payloads cannot
override the approver, template or destination. Action, target and parameters are immutable. Changed action content requires cancel plus a new linked
request; a revision/diff editor is deferred.

Authenticate the assigned human for every decision. Email GET/previews never
change state. Integration credentials cannot decide. Known authenticated human
requesters cannot approve their own requests; an external display name is not a
verified human identity. Hold does not authorize execution or extend the absolute
deadline. No response, expiry and cancellation are not human denial. Never approve
because of silence or ambiguous text. Cancellation preserves original decisions.

### Reliable transport

Accept and persist a request before returning its receipt; never hold HTTP open
waiting for a human. Use one engine for DataRelay and Stellar, with bounded field
mapping presets rather than an arbitrary transformation platform.

Request fields: external request ID, configured profile, source/case/alert/tenant
reference, structured action/target/parameters, bounded reason/context. Derive
integration identity from authentication, not payload claims.

Outcome fields: schema version, stable event ID, state revision, Grant/external
request IDs, source reference, decision/state, actor/time when applicable, action
fingerprint, execution validity, reason and request reference.

Execution result fields: request/execution IDs, action fingerprint, reported
status/time and bounded evidence reference. Only the configured executor/reporting
authority may submit results. Reported success is not independently verified.

Persist decisions and pending outbound events atomically. Deduplicate on
integration + external request ID; same ID with different content is a conflict.
Preserve event IDs across retries, apply bounded retry/backoff, and show failures.
Manual notification resend never reruns an action. Consumers reject stale events
or revalidate current authoritative state before execution.

Use HTTPS verification and scoped credentials. Support configured authentication
headers for connectors that do not support HMAC. Administratively register and
validate callback destinations; reject payload-selected URLs and redirects. Bound
input size/rate and sanitize display/logs. No secret values in emails, audit or
payload previews. Default to loopback development; real deployment is explicit.

Execution validation/consumption must be race-safe against cancellation/expiry,
bound to action fingerprint and stable execution ID, and preserve the consumer's
own permissions. Unavailability fails closed. Cancellation after commitment does
not promise to undo an external action. Exactly-once external execution is not
claimed; unknown outcomes require reconciliation, not blind retry.

### Stellar boundary

Universal Webhook Responder is the candidate outgoing request path. The actual
version, permissions and receiving path must be verified in M0/M4. XDR Connect
is data ingestion, can be limited availability, and is not a guarantee of paused
automation resumption. A development echo receiver is not Stellar integration.
No unapproved upgrade, new relay platform or replacement with email/syslog/polling.
Exclude returned Grant outcome events from request-generating rules to avoid loops.
Preserve source and tenant scope under the authenticated integration.

## UI budget

Keep Grant-specific administration bounded: Requests/My approvals, Request detail/Decision,
Integrations/delivery history, Approval policies, and Email templates. Reuse Foundation System
Administration. No analytics dashboard, form builder or workflow canvas.

Always distinguish:

- decision: awaiting response / held / approved / denied, with expiry/cancel state;
- delivery: pending / delivered / failed;
- execution: not started / running / reported success / reported failure / unknown.

For Stellar R1, delivered with execution not reported is honest. For the chosen
DataRelay happy path, actual execution-result return is required.

## Recovery and release

Back up approval state and delivery queue, not only configuration. Restore into
an isolated target and suspend outbound delivery until operator reconciliation;
do not replay completed business effects. Verify wrong-user/source, duplicate,
stale, changed-action, timeout, restart and restore cases. Freeze a candidate and
run final browser/two-user and qualification gates under Engineering System.
Production, credential/permission changes and release publication retain their
separate approval boundaries. No release/tag is authorized by this roadmap alone.

## Deferred priorities

P1 after actual use: second DataRelay action/product, fixed two-person approval,
manual reassignment, supported Stellar execution-result/resumption adapter, bounded
revision comparison/audit export. P2: matrices, sequential/quorum approval,
delegation, Slack/Teams, external self-service, SaaS/billing, AI/MCP platform and
standing approvals. These cannot silently become R1 prerequisites.

Not R1: Grant Runner, arbitrary scripts, module marketplace, generic workflow
engine, new IAM/SSO, AI-inferred approval, free-text email parsing, dual SaaS/on-prem
platform or full patent UI/workflow port.

## Evidence and current blockers

Implementation evidence is tracked in Work Packet #33 and `docs/STATUS.md`.
External SMTP, actual Stellar deployment/version/receiver and the actual DataRelay
consumer integration require separate real evidence. Tests and documents cannot
substitute for those endpoints. No milestone is complete solely from self-report.

## Source references

- Product Foundation README, FOUNDATION_CONTRACT.md, FRONTEND_PLATFORM_ARCHITECTURE.md and ROADMAP.md.
- Stellar Universal Webhook Responder and XDR Connector documentation; deployed-version verification required.
- Grant AGENTS.md and .engineering/project.yaml; current Engineering System baseline retained.
