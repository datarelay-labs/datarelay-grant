# R1 operator runbook

Status: development candidate, one local installation. No production rollout or
published release is implied by this document. Source, runtime state and secrets
must remain separate. Grant executes no business action itself.

## Build a development checkout

Requirements: Linux, Python 3.12, Git, npm and access to the pinned Foundation
repository and package registries. From the repository root:

```sh
bash scripts/checks.sh setup
bash scripts/checks.sh static
bash scripts/checks.sh api
bash scripts/checks.sh web
```

Setup isolates uv 0.12.18 and, when needed, Node 24.21.0 under ignored `.dev/`.
Foundation is built from the commit and package hashes in `web/foundation.lock.json`.
There is no registry publication or modification to the Foundation source repository.
A disconnected installation requires separately prepared dependency caches; this
candidate does not claim a complete offline installer.

## Initialize local state

Use an absolute config path outside the checkout for an installation that will be
upgraded. The example deliberately binds development to loopback only:

```sh
uv run --frozen grant --config /absolute/private-state/grant.json init --dev
uv run --frozen grant --config /absolute/private-state/grant.json user-add \
  --username owner --email owner@example.invalid --role admin
uv run --frozen grant --config /absolute/private-state/grant.json check
uv run --frozen grant --config /absolute/private-state/grant.json serve
```

`user-add` prompts twice without echoing a password; no default account/password
exists. Provision separate requester and approver accounts through System
administration. Do not reuse the example address for real mail. Initialization
refuses to overwrite existing configuration. The config must have mode 0600.
Its installation encryption key is necessary to decrypt integration/TOTP material.
`serve` listens on 127.0.0.1 only. Stop it with Ctrl-C; restart using the same config.
Only one active installation should process a given database.

For a real HTTPS origin, omit `--dev` at initialization and configure the approved
TLS reverse proxy separately. Grant's process still listens on loopback. Match the
configured public origin and forwarded Host exactly; forwarded client headers do
not automatically confer trust. TLS/proxy/firewall and production changes require
explicit deployment authorization. This runbook does not apply them.

## SMTP and callback configuration

Stop the local service before editing installation settings. Add the existing SMTP
host, port, sender, optional username/password and `smtp_starttls: true`; register
exact approved HTTPS callback URLs in `callback_urls`. Do not put secret values in
Git, issue bodies, screenshots, request parameters, shell history or mail subjects.
A disabled STARTTLS option is allowed only for explicit loopback test SMTP.
Restart and use **Send test email to me**. SMTP acceptance is not actual inbox receipt.
Notification test sends are restricted to the authenticated administrator's
own mailbox until a designated-safe-recipient registry and explicit allowlist
are implemented and audited. The currently available UI cannot send an
arbitrary test message to another enabled user.
In Integrations create the matching destination, protected headers and optional
HMAC secret. **Test connection** sends a diagnostic event, never an approval.
Tokens are shown once. Use separate creation and execution/reporting credentials;
list identifiers/scopes and revoke unused credentials from **Issued credentials**.

## Delivery and execution recovery

An HTTP 2xx response marks notification acceptance, not business execution success.
The durable queue retries with bounded backoff and stable event IDs. Failed delivery
is visible in Request detail. **Resend** repeats only that notification. It does not
create a new execution. Recipients must deduplicate and revalidate current state;
an event already in flight can arrive after cancellation.

A repeated consume returns `replay: true`; reconcile the consumer's durable operation
ledger, never execute a second time. Transport ambiguity or an UNKNOWN execution
requires external result inspection. Grant cannot undo a committed external action.

## Operations dashboard and exception queues

The administrator **Operations** page reads the current authoritative request,
decision, delivery and execution records. Each card drills into server-filtered
Requests; the aggregate counts are distinct affected requests, not transport
attempts. Approval latency is creation-to-final-human-decision elapsed time.
Overdue counts expired approval deadlines on undecided requests or due escalations;
an already-approved execution grant that later expires is not a late human decision.
Unused approvals are still-approved requests not yet consumed.

Integration observations include the last *outgoing callback transport
acceptance* (HTTP delivery 2xx), never proof that the consumer executed an
action. Current failed callback counts match the exception queue: only the
latest callback state per request is unresolved, not historical failed attempts
that later succeeded. A failed callback, SMTP failure or UNKNOWN execution
requires human reconciliation. The dashboard exposes no token, secret or destination URL and
has no action replay controls. A restored installation remains subject to the
existing recovery-paused/explicit reconciliation procedure.

## Integration diagnostics and safe configuration manifest

The administrator Integrations page provides read-only health details,
request activity, last accepted/failed callback transport, nonsecret
credential scope-role metadata and recorded connection-test outcomes. The
Producer preset requests only request creation/reading permissions. The
Executor preset requests read-only request access plus execution-grant
consumption and result-reporting permissions, without request creation.
Read-only request access by itself is an observer role, not producer authority.
Mixing request creation and execution capabilities should be explicitly reviewed. Only
an actual operator may create or revoke credentials; diagnostic inspection
never does so.

GET /api/v1/integrations/{id}/diagnostics requires administrator authority.
GET /api/v1/integrations/configuration-export returns a bounded planning
manifest of integration identity, policy version selectors/timing and template
metadata. It intentionally omits registered callback destinations, encrypted
headers, authenticators, raw message bodies and connection-specific keys.
The manifest is NOT importable as a runnable configuration or a backup.
Production Import requires separate design of validation, mapping, rollback
and privilege boundaries before being made available.

A connection test is an explicitly requested diagnostic event; accepted or
failed transport is auditable without logging a raw destination or exception
text. Never infer action execution, an approved policy or inbound Stellar
support from a successful test event. External receiver/consumer qualification
remains separate from these operator observations.

## Audit evidence explorer and controlled exports

The administrator-only Audit explorer offers searchable and paginated historical
actions by recorded actor, action, request ID and UTC time range. GET
/api/v1/admin/audit/search limits an individual response to 100 events.
GET /api/v1/admin/audit/export supports CSV or JSON bounded at 1,000 events
per export/page and does not export arbitrary free-form audit details.
CSV fields originating from users are prefixed when needed to neutralize
spreadsheet formula evaluation. Save exports only in approved protected
locations; they still contain event times, request IDs and actor identities.
No password, token, callback destination, mail text or arbitrary notes are
included. GET /api/v1/admin/audit/chain/{request-id} connects persisted policy
and action fingerprint, human decisions, comments metadata, notification
delivery attempts, execution commitment and reported result; a reported
execution result is not Grant's independent verification of external work.

Configuration import preview POST /api/v1/admin/configuration/preview accepts
only the strict secret-free schema-v1 planning manifest produced by the
read-only integration export. It computes name/identity/mapping conflicts
WITHOUT writing any policy, template, integration or credential record.
There is deliberately no Apply/Activate control. Production import requires
verified account, group, callback, policy-version and template-content
mapping, operator-approved policy activation, migration/rollback rehearsal
and release authorization. Do not use the preview as an installation restore.

Backup/restore and schema-v8 migration checks must retain historical audit,
versioned policies, request action fingerprints, approver groups, delegations,
comments and credential status. Isolated database copies are not evidence
that external execution effects were reconciled.

## Security controls and repeatable browser qualification

A cached human authorization does not survive account role demotion, disabled
account status or an ended browser session. Admin read/search/export requests
revalidate current session and role in the database transaction. Request
list searches revalidate integration credential status/current request-read
scope both before maintenance and while reading the filtered source records.
Grant consumption remains separately bound to its actual execution privilege,
durable execution ID and immutable action fingerprint. A report or request
read never commits a business operation.

The audit exporter allows only typed reference fields, drops nonfinite or
out-of-bounds legacy audit numbers, redacts arbitrary note/reason values and
neutralizes formula operators even after leading whitespace in CSV cells.
Import conflict preview does not apply policy, template, identity, credential
or callback changes; invalid schema/secret fields, CSRF-less and foreign-Origin
requests fail closed.

**Browser E2E build sequencing:** run static and Web typecheck/production
build to completion before running the real Playwright browser suite. Do not
run a second Web build concurrently with Playwright: Vite replaces the dist
directory and the application may briefly return FRONTEND_NOT_BUILT.
This was reproduced during G9 concurrent runs and resolved by serializing
build then browser qualification. On Linux with util-linux flock available,
scripts/checks.sh web and browser share a per-worktree advisory lock under
.dev; a bounded same-file lock smoke validated that an existing holder delays
the Web build (LOCK_SERIALIZATION PASS). Other hosts must explicitly sequence
the two commands. Isolated fixture E2E never represents actual
DataRelay consumer or Stellar receiver acceptance.

## Backup, restore and restart

```sh
uv run --frozen grant --config /absolute/private-state/grant.json backup \
  --output /absolute/private-backups/new-backup.sqlite
uv run --frozen grant --config /absolute/private-state/grant.json restore \
  --input /absolute/private-backups/new-backup.sqlite \
  --output /absolute/private-state/new-restored.sqlite
```

Back up the installation key separately using an approved secret store. The database
contains personal data, authorization state and token digests and must be protected.
Restore accepts a NEW destination only. Do not overwrite or delete the original.
Point a separate protected config at the new database, retain its matching key,
and inspect it while outgoing delivery/execution commitments remain PAUSED. Sessions
are removed. Reconcile effects and revoked credentials since the backup; revoke any
restored credentials that must no longer work before resuming. Do not run the old and
restored installation at the same time.

```sh
uv run --frozen grant --config /absolute/private-state/restored.json recovery-resume \
  --acknowledge-external-reconciliation
```

Resume cancels every restored open/uncommitted request and marks unfinished committed
executions UNKNOWN. Old human decisions stay in the audit history. A fresh approval
requires a new request ID. The acknowledgment is not proof that external work was
reconciled; that remains the operator's responsibility. Notify affected requesters.

## User acceptance evidence validator (not a release gate override)

Use the locked development toolchain to run the repository's existing
acceptance evidence contract. Its JSON Schema 2020-12 validator is the
pinned jsonschema development dependency:

~~~sh
uv run --frozen python tools/user_acceptance_contract.py validate-gate \
  --root . --expected-gate SURFACE_RECONCILIATION \
  --evidence /absolute/private/evidence/surface.json
uv run --frozen python tools/user_acceptance_contract.py validate-gate \
  --root . --expected-gate FULL_USER_E2E \
  --evidence /absolute/private/evidence/full-user-e2e.json
uv run --frozen python tools/user_acceptance_contract.py quality-close \
  --root . --surface-evidence /absolute/private/evidence/surface.json \
  --e2e-evidence /absolute/private/evidence/full-user-e2e.json
~~~

The validate-gate command checks schema, exact Git HEAD, immutable contract
digest, contract clean state, claimed coverage and mandatory counts. A
structural check can return success while explicitly printing
USER_GATE_EXECUTION_PASS=NOT_ESTABLISHED. **It is not independent evidence
that ChatGPT personally drove the browser or that a real DataRelay/Stellar
operation occurred.** The quality-close command therefore returns nonzero
and prints PRODUCT_QUALITY_CLOSURE=BLOCK even if every submitted self-claim
is structurally perfect, until separately trusted persona/real-effect
evidence and owner acceptance are verifiable through an authorized process.
Never interpret a self-authored JSON report or successful schema validation
as candidate freeze/release permission. A missing verifier dependency is a
toolchain defect, not permission to waive this gate.

## Candidate, upgrade and rollback

After committing a clean reviewed candidate, run `python3 tools/build_candidate.py`.
It produces a local source+compiled-web archive with source HEAD, Foundation pin,
per-file SHA256 manifest and archive SHA256. It neither publishes nor declares GA.
The archive intentionally excludes `.dev`, databases, caches and test credentials.

Before extraction, verify against the independently recorded source HEAD and archive
SHA256 (not merely the archive's own manifest):

```sh
python3 tools/verify_candidate.py /absolute/path/candidate.tar.gz --head <recorded-head> --sha256 <recorded-sha256>
```

This checks all file hashes and regular-file paths without extraction or execution.
It verifies integrity, not authenticity, release approval or external acceptance.

Extract into a NEW version directory; use `uv sync --frozen` there. Compiled web
assets are included. Keep private config/database outside both code directories.
Stop the old loopback process, take a new backup, run `check` and the candidate
against an isolated copy before pointing a service at it. The default web path is
resolved from the active source tree; remove a legacy hard-coded `web_root` only
after verifying the new compiled assets. Run the same user scenarios on that build.
Request information and change requests suspend decision-reminder scheduling.
Queued reminder mail is superseded and the worker revalidates collaboration
state before claiming a reminder. In-flight SMTP transport cannot be recalled.
If a change-request deadline expires, the requester may create a new linked
replacement without cancelling the now-expired original. Every replacement
requires fresh action-bound approval; the original timeline remains immutable.

The G10A **backend-only development branch** now uses additive schema v12:
v8 is the prior collaboration baseline, v9 introduces durable approval
assignments and policy-versioned Deny reasons, v10 adds protected email PIN
issuance and confirmation, v11 introduces customer verification snapshots
and short-lived extra-email OTP challenges, and v12 adds scoped fresh
Grant account TOTP evidence bound to a live signed-in session. Legacy v1-v11
schemas migrate forward through supported steps, including re-entry
safety for previously added columns. Existing persisted requests do NOT
automatically acquire fresh loginless decision links on migration.
Back up before a non-disposable upgrade and validate on an isolated
copy. Older binaries must reject newer schema versions instead of
silently misinterpreting authorization. Manually changing
PRAGMA user_version is never a rollback. Use the protected pre-upgrade
backup and operator reconciliation procedure above. No upgrade, production
deployment or release is approved by these developer-only migrations.

## G10A mailbox-decision operator investigation (backend candidate only)

For authorized administrators, inspect the existing read-only
GET /api/v1/admin/audit/chain/{request_id} evidence projection. It shows
the immutable action hash, approval assignments/steps and epochs,
per-recipient issuance IDs, original/delegate status, requested
verification floor, bounded typed PIN/OTP/fresh TOTP failure history,
verified local Grant user ID only when an actual fresh proof exists, issuance
state, and sanitized outbox metadata. It **never** returns raw
Approve/Hold/Deny bearer URLs, PIN/OTP codes, keyed digests, SMTP
credentials or queued email body. Receipt beyond SMTP acceptance is
unverified. The GET does not create new approval authority.

GET /api/v1/admin/operations includes additive decision_email_security
counts: current, locked, revoked, consumed or expired link issuances;
active/locked/verified extra-mail OTP challenges; and requests requiring
fresh independently verified MFA which the backend currently cannot
satisfy. These counts have no recipient addresses or secret values.
Normal request/consume/execution metrics remain separate.

If a PIN is locked, **do not** reset attempts, edit databases or copy an
email code into support tickets. After independently validating the
appropriate request and target mailbox, the authorized administrator can
POST /api/v1/admin/requests/{request_id}/decision-links/reissue with
a JSON body containing recipient_user_id and a bounded reason.
This rotates that recipient's old issuance and codes inside the same
request deadline. It fails closed for a disabled recipient, ambiguous
multiple represented seats or recovery pause. Reissuing does not approve
a request. Suspicious activity should be investigated from the typed
decision.pin_failed and decision.otp_failed audit events and the current
integration/account authority before a reissue.

A stale or revoked Grant login cookie in an otherwise valid mailbox
recipient's browser must not prevent a default EMAIL_PIN/EMAIL_PIN_PLUS_OTP
decision. Those mailbox-only policies ignore ambient account sessions and
continue to attribute only the email issuance, not a verified person. If
the effective policy is EMAIL_PIN_PLUS_MFA, the exact enabled recipient's
currently authenticated session, CSRF and fresh TOTP proof are still
required. Keep the two assurances visibly distinct during incidents.

An extra six-digit OTP is requested only through the protected decision
POST after the mailbox PIN and can prove continued access to that
**same email mailbox only**. It is not independent MFA or proof of
named-person identity. For EMAIL_PIN_PLUS_MFA, the backend can instead
use a currently signed-in, enabled Grant recipient who has already
enrolled TOTP. A separate protected POST must verify a NEW TOTP step
and bind that verified local account and live session to the decision
context; the final POST requires the same session and rechecks current
authority. The current local-account TOTP method is not external SSO
or evidence that a legally named individual acted. Unsupported SSO
providers, absent TOTP, revoked sessions and replay fail closed.
Never force a lower policy, bypass recovery pause or claim completed
real-user browser/mailbox E2E. Full external and user acceptance
remains a separate release gate.

## Browser checks

Install the exact Playwright Chromium through `web/node_modules/.bin/playwright
install chromium`. Use approved OS runtime libraries; on dev-atlas an existing
user-local library directory can be selected without system changes:

```sh
export GRANT_BROWSER_LIBRARY_PATH=/home/aella/.cache/playwright-runtime-libs/root/usr/lib/x86_64-linux-gnu
bash scripts/checks.sh browser
```

Read `docs/USER_SCENARIOS.md` first. These tests use disposable users, a temporary DB,
actual loopback SMTP/HTTP and browser sessions. They do not prove real customer mail,
DataRelay operation execution or Stellar Cyber ingestion. Keep fixture credentials
and browser traces private; do not upload `.e2e/fixture.json` or raw trace archives.

## GitHub CI private dependency access

The mapped `Grant checks` workflow separates public API/static checks from Foundation
web checks. The latter requires a repository Actions secret `FOUNDATION_READ_TOKEN`
with Contents: read on `datarelay-labs/datarelay-product-foundation` only. It needs no
write, administration or organization-secret permissions. A missing secret fails
explicitly as `FOUNDATION_CI_READ_ACCESS_REQUIRED`; do not bypass that result or copy
private SDK packages into the public repository. Existing host credentials are never
exported into Actions automatically. Provisioning this narrowly scoped secret requires
the owner's credential/permission approval. No such secret has been created here.

The checkout action uses the credential only to retrieve the exact pinned Foundation
commit with `persist-credentials: false`. Source staging then revalidates all package
hashes. PR runs perform bounded API/static/frontend checks; workflow_dispatch also
performs actual browser qualification. Existing shared governance checks remain.
