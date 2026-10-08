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
action. A failed callback, SMTP failure or UNKNOWN execution requires human
reconciliation. The dashboard exposes no token, secret or destination URL and
has no action replay controls. A restored installation remains subject to the
existing recovery-paused/explicit reconciliation procedure.

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

Current development schema v8 contains versioned policy lifecycle/selectors,
notification/event snapshots, per-approver decision ledgers, time-bounded delegation,
group/user escalation, append-only request collaboration comments, and the separate
OPEN / INFO_REQUESTED / CHANGES_REQUESTED collaboration state. Supported older
schema versions (v1-v7) migrate forward on opening a database; the v7-to-v8 step is
safe to re-enter when the collaboration column already exists. Back up before any
non-disposable upgrade and test upgrade against an isolated copy. Older binaries
must reject schema v8 rather than quietly reinterpret policy, collaboration or
authorization data; a code-only downgrade or manual PRAGMA user_version change is
not a supported rollback. Recover from the protected pre-upgrade backup with the
separate-installation reconciliation procedure above. The migration does not publish
a release or authorize a production upgrade; that requires separate owner approval.

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
