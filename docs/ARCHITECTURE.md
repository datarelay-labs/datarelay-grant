# R1 minimal design contract

Goal: the accepted ROADMAP.md; no Runner, new identity platform, SaaS or workflow engine.
Public contracts: /api/v1, authenticated browser sessions, scoped integration tokens,
explicit request/decision/consume/result operations, stable outcome events.
Persistence: one local SQLite database with WAL and short BEGIN IMMEDIATE transactions
for one installation. Network sends occur outside transactions, through a leased durable
outbox. This is a bounded local-server choice, not a distributed database contract.
Atomic state + audit + outbox; stable IDs; cancel/consume/expiry serialize on the same
row transaction. Action JSON is immutable, hashed using documented canonical encoding.
Approval policies use immutable versions with an explicit DRAFT -> TESTING -> ACTIVE ->
DISABLED lifecycle. Saving edits creates or updates a non-live draft; only an explicit
activation changes live matching. Product-1.0 matching is deterministic AND across the
bounded integration/action/tenant/environment/severity/risk selectors. A request snapshots
the exact active policy version, assigned approver, timing/execution-grant values and the
complete event-oriented notification template set plus system branding so later
administrative edits cannot alter an approval already in flight.
Database schema v3 adds policy versions/lifecycle/selectors, event-oriented notification
template sets, request policy-version references and outbox event types on top of the v2
mail-template snapshot baseline. Schema v1 and v2 databases upgrade forward automatically
without changing prior request semantics.
The consumer uses the returned fingerprint and must preserve its own authorization.
Execution commitment is not exactly-once execution or rollback. Results are reported,
not independently verified. Unknown results require reconciliation, never blind retry.
Security: real Argon2 password verification; opaque hashed sessions, HttpOnly cookies,
Origin/CSRF protection, optional TOTP and hashed one-use recovery codes, role checks,
assigned-approver-only decision, source-scoped API tokens, rate and payload limits.
Encrypted integration credentials/TOTP secrets use an installation key outside Git.
Transport: configured destinations only; installation-registered exact URL allowlist, verified TLS, no environment proxies
or redirects. Endpoint ownership and DNS remain an installation trust boundary. Development HTTP only
explicitly enabled on loopback. No public service, TLS/firewall/production changes.
UI: exact Foundation public SDK through product adapters; unavailable capabilities
are declared unavailable. The Grant 1.0 target UI architecture has Foundation own the
shared Auth UI, Product Shell, semantic
tokens, account/session surfaces and capability-driven System Administration primitives.
Grant supplies product identity, grouped navigation and typed adapters, then owns only
approval-domain pages. Target primary IA is Home; Work (My approvals, Requests); Configuration
(Approval Policies, Notifications, Integrations); Administration. Account & Security is
a signed-in-user action rather than primary navigation. Approval Policies exposes
Draft/Test/Activate, preview/isolated test and version history; Notifications exposes
template sets, safe variables, preview/test send, delivery health and branding. Never a
copied Foundation fork, direct product-DB access from shared UI or mock authority.
Recovery: SQLite online backup + separately protected installation key; restore into
a new path only, outgoing work and execution commitment paused for reconciliation.
Tests: isolated API/security/DB-race/outbox HTTP tests, frontend types/build/Foundation
contract and two-user browser journeys, backup/restart. Real consumer/Stellar evidence
remain separate prerequisites. No release readiness from synthetic endpoints.

Recovery resume contract: after restoring into a new database, an explicit local
operator acknowledgement is required. Cancel every restored open request without
an execution commitment (even previously awaiting requests may have executed
after the backup). Preserve its prior human decision for audit, and emit a new
cancellation event. Mark nonfinal committed executions UNKNOWN; never rerun them.
Then unpause delivery. New work requires a new external request ID and approval.
The operator still reconciles external effects and credential changes since backup.

Credential lifecycle: administrators can list token identifiers/scopes without
raw credentials, and idempotently revoke a token. Domain mutation transactions
revalidate enabled principals/sessions/tokens and current integration scope before
recording decisions, cancellations, execution commitments or results. Revocation
cannot undo a commitment that already won the transaction race.
Signed event verification rejects duplicate JSON keys, ambiguous header casing,
missing event identifiers and malformed/non-ASCII signature material. Consumers
still deduplicate event IDs and revalidate current request state before execution.

CI environment: native mapped Grant checks retain the pinned shared governance,
adoption and enforcement jobs. API/static checks run without private SDK access;
web checks independently require read-only access to the private Foundation source.
No private SDK source is vendored/published into this public repository. Missing
`FOUNDATION_READ_TOKEN` fails the web job explicitly; it is not skipped or reported
as success. Creating/expanding that credential remains an operator security boundary.
Measured bounded API cases (~60s) and frontend unit/type/build (~10s) use medium
scenario cost; actual browser/full qualification remains a separate expensive gate.

## G10A owner-accepted email decision trust extension (NOT IMPLEMENTED)

The R1 implementation above currently uses authenticated Grant user sessions
to decide; it does **not** implement the scoped email decision flow below.
The new G10A product requirement and risk boundary are in
`docs/PRODUCT_STANDARD.md` §§10.5–10.9 and
`docs/ADR_EMAIL_PIN_DECISION.md`. The existing legacy auth/session and
external consume/result authority must not be bypassed or redefined
by claiming that email PIN verifies a human's real-world identity.

**New restricted capability model:** a 256-bit cryptographically random
response URL is stored as a digest and is unique for each current
request/approval-seat/step/outcome/action/assignment epoch/issuance.
A separate cryptographically generated **four-digit PIN appears in
the same recipient-specific email**. The link can be GET-fetched
without causing ANY mutation or sensitive detail disclosure.
An explicit POST with matching code and link issues an expiring
single-purpose, anti-CSRF/Origin-protected decision confirmation context.
That context permits exactly one *current* seat/outcome and never grants
normal login identity, profile access, request-list, administration,
integration token or execution-consume scopes. A second explicit
confirmation POST rechecks current seat, step, action, deadline
and policy tier in a single serial transaction before recording
the decision, invalidation and outbox effects.

**Customer policy tier:** new policies default to `EMAIL_PIN`
(no username/password login). Optional `EMAIL_PIN_PLUS_OTP`
requires a separate on-demand challenge; if sent to the same
mailbox, this is not MFA. Optional `EMAIL_PIN_PLUS_MFA`
requires a fresh independently authenticated identity step-up
before committing. Customer administrators configure tier
and link TTL per approval policy. New link default lifespan
is at most seven days and never exceeds the original request
deadline; customer-configured changes must be bounded,
snapshotted and unable to weaken existing in-flight grants.
Requester-controlled risk fields never reduce a trusted
administrator policy.

**Separate attribution:** new append-only decision events store
assigned recipient/seat, original vs delegated seat, whether
a person was genuinely verified, method/assurance and outcome.
For default loginless mode, `verified_person_id` is null and
`actor_assurance=EMAIL_LINK_PIN`; a forwarded mail contains both
link and code and does not establish independent person identity.
Do not expose raw PIN/link in audit, logger, outbox JSON, export,
plaintext backup or telemetry. Queued sensitive mail must be
sealed or generated securely on delivery, with safe retries
and recovery. SMTP accepted differs from real inbox receipt.

**Group, policy reason and delegation model:** immutable action
fingerprint, stable seat/step `assignment_epoch`, and mutable
`state_revision` are distinct. The snapshotted policy includes
`denial_reason_required` default false; when true, the final
Deny POST rejects absent/blank bounded reason before consuming
the selected intent, changing state or sending any outcome.

Non-exclusive delegation means original assignee and currently
valid, non-revoked delegate may each receive independently bound
email links/PINs for **one represented approval seat**. They
must never be counted as separate approval votes; a seat-keyed
atomic finality guard makes the **first terminal Approve/Deny**
win and revokes both parties' other links. A Hold remains
provisional so the other currently eligible party can later
resolve it. Delegation expiry/revocation removes only the
delegate's authorization. Each final commit revalidates
delegate window/assignment and the original seat's finality;
the audit event records seat/original assignee, capability
recipient original-or-delegate, actual verified identity if
independently established, reason and final result separately.
With EMAIL_PIN alone no named person is proven.

Parallel seat Hold never blocks the other active seats;
sequential Hold blocks next-stage activation/notification
until the current step approves.
Request GET (currently expiry-maintaining in R1) must not
be reused to cause state changes in a new email-intent
GET route. Revoke stale generations on terminal decisions,
reassignment and scoped security changes; ordinary votes
of other reviewers must not invalidate this seat.

**Migration and rollback:** additive data structures (v8→v9
or later) preserve prior in-flight neutral authenticated
request links. Legacy requests remain usable through R1
flow. Rollback/restored snapshots may not regenerate or
reactivate revoked/expired links without explicit
reconciliation. Always separate human approval
outcome from external product-owned execution grant,
business operation and eventual result.

**Conformance:** implement G10A-0..5 by the roadmap,
validate local deterministic DB/API/security tests first,
then direct two-recipient real-email browser E2E and
the distinct G11/G12 frozen-candidate qualification gates.
No direct-user or real-system PASS is claimed from this
architecture note.
