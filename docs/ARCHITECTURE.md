# R1 minimal design contract

Goal: the accepted ROADMAP.md; no Runner, new identity platform, SaaS or workflow engine.
Public contracts: /api/v1, authenticated browser sessions, scoped integration tokens,
explicit request/decision/consume/result operations, stable outcome events.
Persistence: one local SQLite database with WAL and short BEGIN IMMEDIATE transactions
for one installation. Network sends occur outside transactions, through a leased durable
outbox. This is a bounded local-server choice, not a distributed database contract.
Atomic state + audit + outbox; stable IDs; cancel/consume/expiry serialize on the same
row transaction. Action JSON is immutable, hashed using documented canonical encoding.
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
are declared unavailable. Shared shell/auth/account/session/status/audit precede
four Grant-specific views. Never a copied Foundation fork or mock authority.
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
