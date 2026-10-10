# Grant 1.0 implementation status

Updated: 2026-10-10. G12 quality preflight: Issue #54; G11 external readiness: Issue #52 / Draft PR #53; G10: Issue #50 / PR #51; G9: Issue #48 / PR #49; G8: Issue #46 / PR #47; G7: Issue #44 / PR #45; G5/G6: Issue #42 / PR #43; G3/G4: Issue #40 / PR #41; G0/G1/G2: Issue #38 / PR #39; external baseline: Issue #33 / PR #34.
Status: Grant 1.0 development candidate, not production/GA or full 1.0 acceptance.
Exact HEAD, CI and execution receipts belong in the live Work Packet rather than
in a self-referential source commit.

## G9/M4 typed fresh Grant MFA assurance audit projection (2026-10-10)

Existing G10A fresh per-decision Grant TOTP source correctly persists
EMAIL_LINK_PIN_PLUS_MFA on request.decision_recorded after a valid PIN +
current authorized account's new one-use TOTP. G9 admin audit projection
had omitted that exact enum from its secret-safe allowlist, so Admin Audit
Chain/Search/CSV/JSON export incorrectly dropped the actual proof tier.
A minimal typed projection correction now preserves that source-defined
assurance while rejecting unknown strings and raw PIN/TOTP/decision URLs,
OTP seed and current MFA session data as before. The existing audit
identity_evidence_limit remains a separate contextual indicator.
No MFA policy, account/session/role, decision, execution or consumer
authorization behavior was changed. This is authenticated disposable
API regression evidence; not proof of real human identity, live email
receipt, customer MFA enrollment or Full User E2E. Existing G9 Work
Packet #48 revision 3 records the exact tested source.

## M5 exact backup input-path recovery binding (2026-10-10)

The SQLite restore API previously constructed its read-only URI from an
unescaped operator-supplied filename. A valid backup named with a literal
`?` or `#` could silently restore a *different*, still valid SQLite file
from the same directory instead of the explicitly chosen backup. A distinct
red-first two-database fixture reproduced both wrong-source outcomes. Restore
now uses a percent-escaped absolute file URI while retaining the SQLite
read-only mode, integrity check, 0600 staging, recovery pause, session
revocation, and no-overwrite publication. The regression checks recovered
content identity, not just SQLite quick_check. This is disposable/local
source evidence only, not an actual operator restore or external E2E PASS.

## M5 malformed-backup recovery pause fail-closed validation (2026-10-10)

The source recovery restore rejects a corrupt-but-SQLite-quick-check-valid
backup if its runtime.paused marker is missing: exactly one preexisting row
must be updated to PAUSED=1 before any restored database is published.
Without this guard a subsequent Database initialization previously created
a default PAUSED=0, silently re-enabling recovered service state without
operator external-effect reconciliation. Isolated red-first test reproduces
the failure; fixed source refuses publication and removes private staging.
Valid backups retain their PAUSED=1 recovery and separate owner-authorized
resume. This is local source safety evidence, not a customer restore or
acceptance of a real external operation.

## M5 private initial database creation/reopen hardening (2026-10-10)

The Grant SQLite initializer now requires a regular non-symlink database path,
reserves first-run state at mode 0600 before sqlite3.connect writes schema and
tightens an existing database via its open no-follow file descriptor before
the first database read. Isolated regression reproduces pre-fix 0644 initial
modes under umask 022 and dangling symlink creation; the native migration
schema, user/session authorization and live external effects are unchanged.
This assumes a trusted operator-controlled parent directory, and is local
source hardening only, not proof of a deployed private installation.

## M5 private backup/restore publication hardening (2026-10-10)

The existing SQLite backup/restore path had verified source defects: with a
common 0022 umask, initial destination SQLite connections exposed a temporary
0644 output before the late 0600 chmod, a dangling output symlink could be
followed, and copy-time failures could leave an incomplete target. The M5
source correction instead stages into an initially 0600 temporary file and
publishes via a same-directory no-overwrite hard link after successful
copy/fsync; failure removes only its own private staging file. A competing
creator cannot replace its existing output path. The existing recovered
PAUSED runtime and revoked sessions remain unchanged. These are disposable
local regression results, not authorized customer restore, independent
human E2E, signed upgrade evidence, actual external execution or GA.
Work Packet #82 owns the exact tests and source qualification.

## Unified eight-bundle roadmap and G-CI first approval-workbench corrections (2026-10-10)

The former duplicate G0–G12/PF-B2–B6/G-CI scheduling has been replaced by
one eight-bundle ROADMAP.md and Grant coordination Issue #37. All 24
registered dev-atlas Grant worktrees had zero tracked, staged or untracked
changes during the owner-directed preflight. Prior actual B2 pf8.4 packs,
G10A decision security and G11 source guards are retained rather than
rebuilt. Jira Service Management company-managed and Teleport Enterprise
18.x comparisons in docs/COMPETITIVE_GCI_GRANT_20261010.md are DOCUMENTED
first-party requirements, not personally observed competitor UI.

The first scoped current Grant workbench update makes the server's inclusive
created-before filter cover the entire selected UTC calendar end date,
regardless of the reviewer browser timezone; invalid or reversed calendar
dates now fail closed before applying a misleading request query.
The existing role-scoped request detail also shows current approval
seat votes and recorded reasons separately from the chronological audit.
An email-PIN seat vote does not verify the named human, and neither a
decision nor a notification constitutes independent product execution.
Source test receipts and exact GitHub HEAD are recorded by existing Work
Packet #67; direct-user Browser E2E, the two Foundation Administration member
contradictions, real mail/Control/Stellar effects and release are OPEN.

## Foundation B2 pinned PF8.4 source adoption in current integration (2026-10-10)

The current integrated G10A/G0 development candidate now consumes the ten
exact unpublished Foundation B1 pf8.4 package archives pinned to source
8726549f, as previously recorded by independent Grant B1 commit 5934b8a.
Only existing package archives, the nested Foundation lock, Web package
metadata and the real consumer conformance test have been transferred;
Grant approval state, permissions, backend/API, existing preview and shared
Foundation implementation have not been forked or modified. Offline npm
installation, official Web **156/156** unit tests, TypeScript/Vite build
and Static qualification pass on this combined source (Work Packet #67).

**B2 remains incomplete:** the new consumer check truthfully detects two
member-role ADMIN_CAPABILITY_CONTRADICTION findings: core.users and
grant.smtp.test are unavailable to a member but still marked with
access=manage. The previously platform-denied Grant Administration source
change and app/styles/mobile/PR writes were not retried. A passing negative
regression is NOT a passing member Administration user journey. Independent
Control-family login/sidebar parity, mobile 320/375, real user/password
browser, genuine SMTP inbox/PIN/OTP/MFA, actual Control/Stellar result
and full G12 owner acceptance remain separately unverified.

## Product Foundation B4/B5: recovery-paused manual delivery safety

The native Grant recovery-paused state now rejects direct operator-triggered
Administration mail tests, Notification Template Set test sends, Integration
connection tests and manual delivery resend scheduling with
RECOVERY_RECONCILIATION_REQUIRED, without SMTP/Webhook transmission or a new
resend audit entry. The existing durable worker and approval/consume recovery
gates remain authoritative. Normal unpaused operator tests remain available;
read-only administrator health remains visible and role-checked during pause.
Work Packet #83 intent revision 2 tracks isolated API proof and exact source;
this is not real mailbox, customer restoration, or external product E2E.

## G12 historical populated v8-to-v12 database upgrade regression (2026-10-10)

The current integrated candidate includes a static, SHA256-pinned verbatim
SQLite v8 schema captured from historical Git source e21a080. A new offline
regression migrates its **populated** synthetic requester, administrator,
two-approver ALL policy, pending/denied requests, unchanged action hashes,
approval group, audit, outbox and session from v8 to v12. It checks that the
old request's email-PIN path stays disabled, no PIN issuance or OTP is minted,
all four approval assignments are restored exactly once across restarts,
and a fresh-path backup/restore clears old sessions and remains PAUSED.
The original v8 source database is preserved for rollback. This tests a
real older schema rather than only lowering PRAGMA user_version on a modern
database. Work Packet #99 owns source qualification. It does **not** imply a
customer migration, actual email execution, direct human E2E, or release.

## G11 trusted product and Stellar evidence guard convergence (2026-10-10)

The newer integrated source now carries reviewed non-executing G11 contract
checks: product-trusted Grant integration identity, mandatory exact Control
route/destination and immutable Stellar tenant/case/alert/state-revision
correlation, with fail-closed malformed identifiers. A matching candidate
readback is **not** independently verified external evidence. The Control
legacy replay send endpoint is not mounted with a Grant guard, and an actual
supported authenticated Stellar receiver is still absent. Work Packet #98
records source tests; G11 external M3/M4 remain WAITING_INTEGRATION.

## G12 unpublished candidate metadata verification (2026-10-10)

The exact-source candidate verifier now rejects false publication/release
acceptance assertions, malformed Git tree or Foundation source identifiers,
and missing/mismatched pinned Foundation lock data inside the archive. This
validates internal bundle consistency against a separately supplied expected
archive SHA256 and Git HEAD; it does not authenticate the upstream Foundation
checkout, attest a user E2E result, authorize deployment or prove release
readiness. Regressions and isolated artifact qualification are tracked by
Work Packet #97, not by an owner-accepted release.

## G3/G4 optimistic concurrency convergence on current G10A branch (2026-10-10)

The newest integrated Grant candidate now carries the previously tested G3/G4
fail-closed cross-admin safety contracts: approver group updates require the
exact reviewed `expected_updated_at` and stale writes cannot overwrite newer
membership; request escalation scheduling requires the reviewed
`expected_revision`, advances request revision atomically and rejects stale
routing changes without an additional audit event. The typed browser clients
pass loaded revisions and require explicit reload/review after conflicts.
Source/test verification and exact committed HEAD are tracked by Work Packet
#95. This is a pre-release API contract change, not proof of real-email,
independent human/browser or G11/G12 customer acceptance.

## G1 save-first policy lifecycle draft-integrity guard (2026-10-09)

Work Packet #85 extends the integrated policy editor so the exact form used
for saving is compared against the latest displayed and re-fetched saved
policy version. Editing identity, action, approver group/quorum, matching
selectors, notification template, timing/validity or the G10A versioned
Deny-reason/PIN/OTP/MFA/link TTL controls flags unsaved changes. Test,
Activate, Disable active and detail Clone then stay disabled, with a visible
Save Draft warning and nonmutating Discard edits action. Confirmed live
actions first refresh the latest server policy; local edits also invalidate
an existing staged confirmation. Missing/invalid verification contract
or changed server version fails closed. Saved/reverted equivalent numeric
values do not spuriously block. This is a UI operator-integrity safeguard,
not stronger server policy authorization, independent human acceptance
or production release.

## G1 explicit confirmation for live approval-policy lifecycle (2026-10-09)

On the integrated Grant approval policy detail, Activate and Disable active
now stage a read-only confirmation review containing the exact policy and
version, existing-request snapshot protection and distinct Cancel/Confirm
actions. The first button never submits a lifecycle POST. On explicit
confirmation, the browser refetches the current policy and rejects stale
identity, version, lifecycle or active-version lineage before using the
unchanged server-authorized transition route. This is an extra operator
confirmation boundary, not a substitute for server-side authorization and
not an atomic version transaction between refresh and POST. Test/Save/Clone,
Deny-reason/MFA settings, policy history and isolated preview stay unchanged.
Work Packet #84 records source-only regression evidence; no live preview,
independent user-browser acceptance or production activation is claimed.

## G2 paginated administrator notification delivery health (2026-10-09)

Grant's administrator Delivery Health now offers safe, separately applied
state/event/exact request-ID filters and backend source pagination so earlier
failed notifications are no longer hidden by the old default 200-row API /
100-row UI display cap. The GET endpoint preserves its original default
200 most-recent email rows and `deliveries` shape for existing clients while
adding validated bounded limit/offset filters, authoritative `total` and
`has_more`. The matching counts and pages are computed within one read
transaction with fresh administrator authority checks. The Web uses 50-row
pages, refresh, clear and explicit previous/next controls. No payload,
recipient destination or challenge is returned, and search never schedules
an email or executes an approval. Existing `Schedule resend` remains a
separate explicit button guarded by existing API policy. Regression evidence
and exact commit belong to Work Packet #83; this is source-level functionality,
not real-recipient E2E, a new deployed owner preview or external integration.

## G9 v2 reviewed Draft import recovery rehearsal (2026-10-09)

Work Packet #82 adds an isolated executable regression for real Grant
admin API v2 export → explicit existing-local mapping/preview →
`IMPORT_DRAFTS_ONLY` → SQLite backup to a new private test path →
restore to another new path → fresh administrator login and API reads.
It verifies imported local integration/approver mapping, disabled version-1
DRAFT policy, all **nine exact message subjects and bodies**, durable
administrative audit, preserved original installation records, restore
PAUSED state, revoked old sessions and no automatic request/outbox or
policy activation even after explicit synthetic no-effect reconciliation.
This is local recovery and correctness evidence for new v2 state, not
customer backup acceptance, real delivery, release qualification or proof
of independently reconciled external business effects.

The operations runbook now differentiates original non-importable
schema-v1 metadata preview, the actual development-only v2 reviewed
Draft import, and full private SQLite disaster-recovery restore. A v2
bundle intentionally lacks credentials, destinations and historical
authorization state and can never serve as an installation backup.

## G0 search and lifecycle filter in approval policy list (2026-10-09)

The task-first administrator Approval Policies table now provides a
case-insensitive bounded live search over policy name, allowed action,
displayed integration and approver, plus an explicit
All/Draft/Testing/Active/Disabled lifecycle filter, current-visible-row
counts, and safe Clear filters/empty-result controls. Search and filtering
use **only the already returned role-scoped /profiles rows**; they do not
add API access, mutate approval policy state or provide an alternate
activation path. Opening, cloning, version editing, verification, isolated
preview and existing lifecycle operations are preserved. Source-only
implementation/evidence is tracked in Work Packet #81, not an owner
preview deployment or independent two-human browser E2E.

## G0 task-oriented approval policy detail sections (2026-10-09)

The existing Approval Policies list/detail workspace retains all policy fields,
version and security contract validation, draft save, explicit Test/Activate,
Disable, Clone, isolated preview and change history. The long details form is
now organized into the seven canonical focused sections: General, Applies To,
Approval, Decision Verification, Timing, Execution Grant and Notifications.
A keyboard-operable, explicitly non-submit section navigator focuses the
matching in-page heading instead of duplicating routes or Foundation controls.
No schema/API, permission, policy activation, MFA or execution behavior changes.
This is source-only G0 UX convergence tracked by Work Packet #80, **not**
deployed owner preview or independent two-human E2E.

## G7 final-decision latency median and sample count (2026-10-09)

The administrator-only Operations approval-latency metric now reports both
mean and median elapsed time (creation to final decision) with the exact
count of decisions in that read snapshot. A SQLite window query computes
odd/even medians without pulling every row into Python memory and clamps
negative durations like the prior mean. Pending/held requests do not
contribute; the existing `ops_decided` permission-checked source queue
remains the metric link. Old APIs without median/sample fields show
unavailable instead of inventing data; no operations or approval mutations
are introduced. Scope/evidence: Work Packet #79, a development candidate
only, not production, deployed owner preview or independent Full User E2E.

## G7 operator visibility for G10A email-decision lifecycle (2026-10-09)

The Grant administrator Operations page now renders the *existing*
`decision_email_security` API aggregates without exposing recipient emails,
bearer decision links, four-digit codes, OTP challenges or raw audit identities.
Read-only tables separate link issuance states, separate-email OTP challenge
states, and open requests governed by independent fresh MFA requirements.
Unavailable/malformed counters remain explicitly unavailable rather than
fabricated healthy zeros; no reissue, replay, unlock or verification action
is introduced. The page distinguishes mailbox access from independently
verified human identity and explicitly states that same-mailbox OTP is not MFA.
Backend authority and persisted schema are unchanged. This is development
source with targeted Web unit/build/static proof in Work Packet #78, not a
deployed owner preview, human acceptance or external integration result.

## G9 version-2 reviewed policy/template Draft import (2026-10-09)

The accepted G9 portability scope now has **separate v2 endpoints**:
`GET /api/v1/admin/configuration/export-v2` produces reviewed policy
configuration and full nine-event notification subject/body sets. Source
integration IDs/kind/tenant, source approver IDs and source group IDs
allow explicit local identity mapping; destination/callback URLs, SMTP,
API tokens, passwords, MFA/recovery secrets, users and groups are
**not exported or imported**. Notification message content is included
and must be treated as sensitive administrative export material.

`POST /api/v1/admin/configuration/preview-v2` validates strict bounded
schema, mappings to **enabled existing local** integration/users/groups,
local kind/tenant, quorum and name collisions. It returns a digest of
the proposed source+mappings and currently observed local authorities,
with no persisted effect. The separate authenticated administrator
`POST /api/v1/admin/configuration/import-v2` requires the exact
unchanged digest and deliberate `IMPORT_DRAFTS_ONLY` confirmation;
it rechecks current authority, identities and all name conflicts
**inside a single write transaction**. It inserts only **new**
notification sets and version-1 `DRAFT` policies with
`profiles.enabled=0`. Any error rolls back the entire batch. Source
`ACTIVE` never activates at the destination: existing administrator
Testing → Activate flow remains the sole promotion path.

The real Integrations page supports complete JSON export/download,
file selection, local integration/approver/group mapping, source-policy
review, validated preview and explicit Draft import, with the new
policies remaining disabled. Legacy schema-v1 metadata export/preview
remains unmodified and nonimportable. No customer records, production
services, external callbacks, actual credentials or running owner
preview are changed by the isolated implementation/testing.

Security/source and browser evidence belong to current G9 Work Packet #77
at exact committed HEAD when qualified. This is a development candidate,
**not production release or independent two-person Full User E2E**.

## G9 safe configuration import readiness (2026-10-09)

The existing schema-v1 **secret-free metadata** export and administrator-only
`POST /api/v1/admin/configuration/preview` remain strictly **nonmutating**.
They cannot import, apply, activate or overwrite an approval policy or
notification template. Source event types alone are not a portable message
body; source policies lack local approver mapping; integrations lack the
callback destination and scoped credential material required for operation.
Therefore no automatic executable restore can be responsibly inferred from
the metadata manifest.

The preview now returns a deterministic `readiness` summary and
`requirements` by integration/policy/template with the administrator's
explicit manual preparation needed for each entry. It highlights existing
identity/name conflicts, rejected duplicate source names, missing local
integration or approver/group/notification mappings, absent event content,
and mandatory explicit reapproval of source ACTIVE policies. The Integrations
screen renders the preparation plan grouped by domain, while preserving
`can_apply=false` and no Import/Apply controls. All source names are
rendered as escaped text, not HTML.

This is a **usable planning and migration review feature**, not completion
of Product Standard §18 full configuration import/apply. A separately
accepted versioned format with approved local identity mapping, secret
redaction, authorization and controlled policy activation remains required
before actual import can be implemented. Targeted tests and exact-HEAD
qualification are recorded in the current Work Packet.

## G0 integrated Foundation Administration task navigation (2026-10-09)

The current integrated Grant candidate preserves the **shared** DataRelay
Product Foundation `AdministrationHub` with its Control-family core groups,
capability projections, and a Grant-specific Mail & Notifications extension.
It does not copy an older manual `AdminTaskCatalog` layout or claim support
for unimplemented TLS, system password-policy, timezone, network, retention or
SMTP server configuration.

The Grant administration intro now offers real personal Account & MFA
navigation and an administrator-only shortcut to the existing **non-applying**
configuration conflict preview in Integrations. Selecting an in-page
Manage/View task focuses and scrolls its actual detail region, improving
task discovery and keyboard navigation. All actions retain existing Grant
backend authorization; no credentials, mail delivery, execution or
configuration are changed by these navigation shortcuts.

Affected source qualification: official Web unit **104/104 PASS**,
TypeScript and production build PASS, static PASS; focused scripted
desktop Administration browser scenario **1/1 PASS**. This is a product
UI implementation receipt, not two-independent-person Full User E2E.
The separately running owner preview at :18994 is an older candidate
and has **not** been updated by this source change.

## G10A-5 standalone email decision presentation component (2026-10-09)

The integrated development branch includes an **unmounted** loginless decision
presentation component and a pure client-side verification-stage guard. The
component has no mount-time network effect; it accepts only a capability-bound
adapter from a future authorized route, requires four-digit PIN verification,
shows bounded server-returned details only afterward, distinguishes separately
requested same-mailbox OTP from fresh account MFA and requires a second deliberate
Confirm POST. Deny reasons remain policy-conditional and any invalid or
unexpected verification-stage downgrade fails closed. This Web component never
authorizes protected business execution.

This component is **not** a working public decision-link route and does not claim
real mail recipient/browser E2E. The existing blocked app routing/styles and
browser/credential/platform actions are untouched; public URL route mounting,
runtime security verification and direct two-user independent mailbox proof,
G11 integrations and G12 release gates remain outstanding. Automated component
and logic tests are supplementary evidence, not product acceptance.

The standalone G10A-5 client verification state machine additionally enforces
**phase-specific** assurance transitions: a PIN verification response cannot
claim OTP or MFA has already been completed to skip a deliberate separate
step-up, and a later step-up result must preserve the same selected outcome,
policy mode, protected request summary/action and Deny-reason requirement.
The server must still independently authorize and atomically validate each
request; this Web defense-in-depth does **not** establish real recipient or
browser E2E acceptance.

A separate **unmounted, live-contract-compatible Web API adapter** translates
existing schema-v12 Grant `decision-intents/{token}` results into the presentation
contract. It performs only a read-only GET before user action; PIN verify,
same-mailbox OTP request/verify, fresh signed-in recipient TOTP verify and
explicit confirm use the backend's existing same-origin JSON POST endpoints.
The adapter validates URL-safe token shape, server outcome/assurance/verification
flags, bounded post-PIN action information and strict non-execution evidence.
It does not silently downgrade a stronger current verification mode, and never
automatically retries an ambiguous email queue or final decision POST.
The verified signed-in Grant user ID returned by fresh TOTP step-up must exactly
match the final decision receipt's `verified_person_id`; email-PIN-only and
same-inbox OTP final receipts must have a null person ID. An inconsistent or
missing person ID fails closed rather than being presented as a successful
named-human verification. This is additional client receipt integrity checking;
the backend still owns authorization and identity proof.
Client tests use mocked fetch responses; no SMTP, real authenticator, recipient
account or external business effect was exercised.

**The adapter is not mounted in the running Web app**, so this does not create
a working public decision URL. Earlier platform blocks on app routing/styles,
direct two-user browser credential entry and new Grant PR creation remain
binding. Independent two-mailbox Full User E2E, runtime integration/CI and
G11/G12 acceptance are unverified.

## G10A / G0 integrated development candidate (2026-10-09)

This integration branch combines the existing G10A v12 approval backend and
its protected email PIN / optional OTP / first-party TOTP verification code
with the committed PF8 shared application shell, G0 approval workspaces,
policy/integration verification settings and Notifications saved-preview UX.
The merged backend/source uses the exact previously reviewed backend
candidate; the Web components do not bypass authentication, approve on mail
receipt, or execute external actions on a human decision.

The Foundation shared dependencies remain pinned as committed. Integration
source and deterministic test evidence must be distinguished from the
undeployed :18994 owner preview, direct-user browser/email evidence,
actual DataRelay/Stellar business effects and owner release acceptance.

## G10A truthful decision-link verification preflight (2026-10-09)

The read-only, anonymous decision-intent GET and post-PIN response now report
the **current effective** final-decision verification requirements using
separate boolean metadata. `landing_requires_login=false` preserves the
anonymous first step; `requires_login=true` only for a required fresh
Grant session plus TOTP; `requires_additional_email_otp=true` only when
the customer requires the separately requested same-mailbox code (not MFA).
This corrects the earlier unconditional `requires_login=false` that could
mislead a future decision portal even when server confirmation correctly
enforced mandatory MFA. A security minimum tightened after request issuance
is reflected without modifying the original request snapshot.

Disposable API regressions check all three modes, GET/HEAD side-effect-free
behavior and no private target disclosure before PIN, after-PIN consistency,
a newly tightened integration minimum and denial of confirmation when an
OTP/current MFA requirement is not satisfied. The backend's final
transaction remains the sole approval authority. This does not implement
the separate loginless decision Web page, real mailbox receipt, direct
two-user browser E2E, or release qualification.

## Legacy approval email fail-closed delivery (2026-10-09)

A retained pre-G10A approval request may still have a plaintext queued
`requested` or `legacy` notification without a PIN-issuance reference.
Unlike sealed G10A mail, these old entries are not covered by the scoped
issuance-deliverability guard. The outbound worker now supersedes these
approval invitations when collaboration is `INFO_REQUESTED` or
`CHANGES_REQUESTED`, rather than emailing an action invitation while
approval decisions are blocked. The same legacy invitation path now
revalidates the currently eligible seat/delegate and registered recipient
mailbox immediately before transport leasing. A queued old invitation
addressed to a disabled user, a removed approver, or a former email address
is superseded rather than disclosed to its previous mailbox. Historic v8
rows without recipient IDs are checked against the live eligible mailbox;
present recipient/seat/delegation identifiers must also match. Modern
G10A sealed mail with a missing issuance reference cannot fall back to
this legacy check. Legitimate old invitations remain deliverable, while
decision/result notices and the separate execution authorization boundary
are unchanged.

Disposable transport regressions reproduced all four blocked invitation
cases before correction and verify both normal open-state delivery and
suppression after correction; no actual customer mailbox or external
transport was used. This is a development candidate, not direct-user E2E
or release acceptance.

## G10A reminder issuance integrity after material loss (2026-10-09)

The scheduled G10A reminder path now reuses only the original active,
recoverable encrypted recipient PIN/link issuance. An absent saved
message body cannot silently create a second concurrently active
generation. A previously expired or revoked issuance cannot
be rotated by a routine reminder. The existing trusted recipient
email-change path is preserved: it revokes the old active link and
queues a fresh protected message to the new registered mailbox.
The scheduler records `decision.reminder_unavailable` in the protected
audit without bearer URLs, PINs or raw mail body. Administrator audit
search retains bounded issuance identifiers; arbitrary raw reason text is
not surfaced in the sanitized audit projection. An authorized
administrator must review the request and explicitly reissue where
appropriate. Newly eligible recipients without prior generations
retain their initial mail issuance path, and valid existing reminders
reuse the same PIN and three decision links.

The maintenance scheduler also distinguishes a reminder **queued**
from a reminder **skipped**. Only a round that actually adds at least
one outbound email increments `reminder_count` and emits
`request.reminded`; a zero-mail round retains the budget and records
`request.reminder_skipped`, with the next check deferred by the
normal reminder interval. A partially available parallel group still
records one queued round while the blocked recipient retains
its own protected `decision.reminder_unavailable` audit evidence.
No queued-mail count proves SMTP acceptance or actual inbox receipt.

Disposable tests reproduce the previous dual-active/mint-on-expiry
behavior before correction, then verify normal reuse, mailbox-change
fail-closed and authorized admin reissue. No live mailbox receipt,
direct browser Full User E2E, external consumer effect or release
acceptance is established by these tests.

## G10A backend-only implementation lane (2026-10-09)

In the isolated feat/grant-1.0-g10a-backend branch, G10A-0 now has
durable v9 approval seats/steps/assignment epochs independent of ordinary
request revision, non-exclusive original/delegate voting for one seat,
seat-local parallel Hold, sequential step blocking, and versioned
optional/required Deny reason with request-time policy snapshot.

G10A-1 and **backend-only G10A-2** additionally have additive v10
protected email issuance: recipient-specific plain+HTML messages, independently
generated Approve/Hold/Deny links and random four-digit PIN, sealed SMTP
outbox, read-only GET/HEAD, bounded PIN-verification POST, short-lived
single-use decision confirmation POST, atomic sibling revocation, five-attempt
PIN lockout, authenticated administrative reissue, delegation/email-change
revocation checks, and recovery-paused backup/restore. A same-email PIN is
**not MFA** or independent proof of an identified person; request decision
attribution keeps verified_person_id unset for that assurance tier.

This is not a completed email decision product experience: no matching
passwordless decision Web screen is implemented in this backend lane; no
real external mailbox delivery or direct two-person Full User E2E has passed.
G10A-3 now also includes additive v11 installation default, registered
integration minimum and per-policy versioned EMAIL_PIN / EMAIL_PIN_PLUS_OTP /
EMAIL_PIN_PLUS_MFA configuration, a bounded per-policy decision link TTL,
request-time effective verification snapshot, and a conservative trusted
action/integration security floor so requester-controlled risk/severity labels
cannot downgrade verification. Active integration minimum tightening is
enforced at final confirmation; relaxing it cannot weaken in-flight snapshots.
Admin-only integration minimum changes are audited.

For EMAIL_PIN_PLUS_OTP, a deliberate scoped POST requests a separately
queued encrypted six-digit email code; a distinct POST verifies it for
one intent/confirmation context (short expiry, limited retries, reissue
cooldown) before the final explicit decision. That extra code goes to the
same mailbox and is **not MFA**. Additive v12 backend EMAIL_PIN_PLUS_MFA
can now require a current registered Grant user session plus a fresh
rate-limited one-use TOTP code, binding that proof to the same recipient,
intent, and single-use confirmation. The final decision rechecks the
same live session, current recipient and independently recorded TOTP
proof. A revoked session, unknown/unconfigured IdP or absent enrolled
TOTP still fails closed; the older authenticated approval API cannot
bypass required step-up. Attribution identifies a verified local Grant
account, not a legal identity or independently tested external SSO.
Customer OTP/MFA Web experience, real external mailbox receipts and
complete operator/user/release gates remain outstanding. This branch
is not released or accepted.

The loginless decision confirmation backend additionally guards against
ambient expired/revoked/unrelated Grant sessions: default EMAIL_PIN and
EMAIL_PIN_PLUS_OTP approval posts inspect only their scoped confirmed
mailbox capability and do not authenticate incidental browser cookies.
Only EMAIL_PIN_PLUS_MFA resolves the current authenticated recipient
session with a matching CSRF token and checks its fresh TOTP proof.
Disposable API regressions cover both stale-cookie variants, active but
unrelated user identity non-attribution, and MFA fail-closed behavior.
This is not a real-mailbox or direct-browser user E2E PASS.

G10A-4 backend evidence now projects immutable seat IDs and epochs,
original versus delegated mailbox issuance generations, bounded OTP
challenge states, and typed assurance/failure history through the
existing administrator-only request audit chain. Audit search/export
allowlist security-relevant enum/ID/count fields while excluding raw
message text, PIN/OTP digests, or bearer tokens. Operations reports
aggregate issuance lockout/revocation and OTP status without addresses
or delivery content. SMTP transport acceptance remains distinct from
actual mailbox receipt. The operator runbook defines safe reissue and
recovery handling; none of this establishes direct two-human E2E,
independently verified MFA or product release.

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

## G0 approval-workspace Home refinement (2026-10-09)

The isolated PF8-based Home candidate prioritizes current approver tasks
by earliest deadline, distinguishes assigned-but-ineligible, expired,
information-blocked and held seats, and surfaces the authenticated requester's
own submissions and information/change responses. The former large
operational exception summary moved below the personal work queue into
administrator-only, source-filtered drilldowns. Approve/deny/execute controls
remain entirely on their separately authorized request/consume surfaces.

Home still reads only the existing server role-visible GET /requests
pagination, bounded at 1,000 results with lower-bound count labels when
incomplete. A stale terminal collaboration state must not advertise
an impossible action; an expired change request may still direct the
requester to its bounded linked replacement flow. The accepted G12 overdue
filter deep link and all existing route paths remain unchanged.

This is a candidate Home component change with deterministic data and
role-aware server-rendered markup unit regressions. It has **not**
independently passed ChatGPT-driven real-user browser E2E, the platform-blocked
320px/375px mobile screenshot gate, or Grant 1.0 release acceptance.

## G0 queue-density refinement (2026-10-09)

My approvals, All requests and My submitted requests now expose the four
common search/view/decision/information filters at the top and keep every
existing specialized policy, action, date, notification/execution and
administrator-only identity/group/integration filter inside native keyboard-
operable Advanced filters disclosure. Nonempty advanced presets open it
automatically; a count remains visible when values are set, and clearing
filters restores the concise default. The exact G12 overdue deep link and
allowlisted operations presets continue to use the same server-side
role-filtered query contract. This UX does not add new access or policy
authority; independent actual-user browser/mobile E2E remains pending.

## G0 request-detail progressive evidence UI (2026-10-09)

Grant RequestDetail now puts the immutable operation, target, and all
requested business parameters ahead of low-level technical evidence. A
Foundation Card still explains that approving an action never executes
it. Technical action fingerprint/raw parameter JSON and original source
reference remain fully available but collapsed by default behind native
accessible details. A linked prior request uses a meaningful action label
rather than exposing a UUID as the primary control.

All existing explicit approve/hold/deny/cancel confirmation and backend
role checks are unchanged. Reassignment, linked replacement, collaboration,
escalation, delivery resend and separate execution-result semantics remain
available. Transport delivery attempt logs and audit-event JSON are now
progressively disclosed; protected resends still invoke the original
administrator-gated API only when the user explicitly chooses that action.
This is only developer-source and deterministic component evidence:
real direct-persona browser E2E and 320/375 user-safety gates are pending.

## G0 Notification editor preview integrity (2026-10-09)

In the isolated Grant Notifications worktree, saved template-set content is now
explicitly distinguished from unsaved editor fields. An operator cannot run
server-side Preview or Send test to me while subject, body, name or enablement
changes remain unsaved; the page requires Save first so the result matches
the persisted notification template. Editing a template or sample input clears
the former rendered preview, including invalidating an in-flight preview
response. Creating and editing sets retains the original server contract,
safe-variable validation, administrator permissions and request-time snapshots.

Delivery Health provides a direct link to the existing role-authorized
request detail page instead of presenting a raw UUID as the primary action.
No message, policy, credential, demo data, SMTP transport or external system
was changed during this developer-source task. Evidence is limited to
deterministic unit/SSR checks plus local TypeScript/production build and
static verification; independent browser personas, real mailbox receipt,
platform-blocked mobile gates and G12 release acceptance remain outstanding.

## G10A versioned policy administration candidate (2026-10-09)

A separate Grant Web UI worktree now exposes the existing backend-v12
versioned approval-policy fields: a per-policy mandatory Deny reason
(default optional), an installation-inherited / email PIN / same-mailbox
OTP / fresh Grant TOTP verification setting, and an optional per-policy
bounded email decision link TTL. New and cloned drafts initialize
from server defaults, while current policy versions round-trip their
exact chosen values instead of silently clearing stronger security.
The policy list labels chosen (not necessarily effective) verification.
If a connected backend omits any required versioned field, the policy
editor fails closed with an explicit diagnostic rather than downgrading
an existing policy.

The backend remains authoritative about action/integration security floors,
request-time verification snapshots, deadline caps, membership and decision
identity. A second code sent to the SAME mailbox is never independent MFA
or named-person proof. Loginless email decision Web UI, real mailbox receipt,
individual browser Full User E2E, external G11 effects, CI/review and release
acceptance remain NOT verified. This addition does not modify authorization
logic, Grant's shared Foundation shell, production or customer policy data.

## G10A per-integration verification minimum administration (2026-10-09)

The isolated G10A Grant integration-administration UI now consumes the
backend-v12 administrator-only integration minimum security policy: the
registered integration's currently reported EMAIL_PIN,
EMAIL_PIN_PLUS_OTP or EMAIL_PIN_PLUS_MFA requirement, changed through an
existing reason-audited PUT /integrations/{id}/decision-verification API.
An explicit reason (5–1,000 chars, no credentials or secret tokens) is
required, and lowering the current minimum cannot be submitted without
an additional acknowledgement that NEW requests may use weaker security.
Current integration minimum is never invented if an older backend omits
the field or if the integration is disabled. No minimum change is sent
when the requested setting is unchanged. Existing request snapshots remain
backend-controlled; a code sent to the same email mailbox is NOT MFA.

This is a Web UI development candidate with deterministic pure contract
tests and server-rendered control checks only. The isolated synthetic dev
preview is not mutated by the testing. Actual authenticated user browser
flows, real email recipients, Foundation upstream integration, G11/G12
product-owned external effect, 320/375 mobile and owner acceptance remain
separate, incomplete gates.

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
  These are development-worktree observations; exact-HEAD CI and
  owner/release acceptance remain separate. PR #45 review hardening now counts
  only unresolved latest failed callbacks per request, not historical failures
  subsequently followed by successful delivery. G7 focused regressions passed
  on the corrected source.
- G8 development candidate: administrator-only read-only integration diagnostics
  (requests, callback transport acceptance/failure, scoped credential metadata and
  issuance/revocation events, connection test history), explicit producer/executor
  purpose presets and a metadata-only planning manifest for safe configuration
  export. It never serializes callback destinations, credentials or mail text
  and is not an executable backup or configuration import. Current failed
  callback counts reconcile per-request latest webhook outcomes with G7;
  request:read is neutral and does not trigger the mixed-credential warning.
  Last accepted HTTP callback is not proof of product execution. Real DataRelay/Stellar approval
  integration and reversible validated import are NOT implemented.
- G9 development candidate: admin-only filtered/paginated audit explorer,
  bounded CSV/JSON export with spreadsheet formula neutralization and typed
  evidence field allowlisting, read-only request-to-policy/decision/delivery/
  execution chain, and versioned safe-metadata configuration conflict preview.
  Disposable backup/restore covers audit, comments, policy versions, tokens,
  approver groups, delegations and request action hashes. Policy/template
  configuration import/apply is NOT available: dry-run preview never changes
  an authorization or credential. Actual policy portability/release remains
  subject to the accepted G9/G10 design and owner release authority.
- G10 security hardening candidate: current human role and session authority
  is revalidated within domain transactions even for request/approval-list
  reads and privilege changes; integration-token current scope and revocation
  are checked before request-list maintenance/read. Concurrent competing
  human decisions and executor consumption remain single-commit, replay-bound
  operations. Audit export omits nonfinite/oversized numeric evidence and
  neutralizes leading-whitespace spreadsheet formulas. CSRF, Origin,
  malformed-JSON, nonadmin, disabled-session and role-downgrade checks run
  only against disposable test identities. A per-worktree Linux Web/Browser
  qualification lock prevents Vite dist replacement while Playwright reads it
  (smoke PASS). This G10 source reached 219 Python/API test cases PASS
  (including 12 new targeted security cases), 12 frontend unit PASS, static/
  typecheck/build PASS and 21 real Chromium browser journeys PASS. A source
  script modification during the original API wrapper run caused a post-test
  shell exit 127; exact committed-head wrapper and GitHub CI confirmation
  must be recorded independently in Work Packet #50. No release readiness is
  asserted from this fixture-only evidence.
- G11 integration readiness: read-only dev-drcontrol HTTPS health returned
  200 at clean build fc89dadc. The existing Control failed-delivery-log replay
  operation exists but is not currently protected by a Grant consume guard.
  Grant-side pure consumer binding/replay and normalized Stellar receiver
  correlation utilities have 55 focused current-source regression cases PASS.
  They neither execute remote actions nor independently verify external
  effects. G11 M3/M4 remain WAITING_INTEGRATION pending a real product-owned
  guard/ledger and an actual supported Stellar receiving path; see
  docs/G11_EXTERNAL_ACCEPTANCE.md.
- G11 phase 1 (2026-10-09) checked the actual Control development API
  `GET /health` (HTTP 200) and read-only replay route/schema plus GitHub
  source. Running Control `fc89dad` differs from current `main-v2@b45ad9d`,
  so same-source live acceptance remains unavailable. Its replay POST defaults
  to a real send; even dry-run writes replay stage/audit rows, so no live POST
  was attempted. Existing Control source and regression tests establish that
  legacy failed-delivery replay can send twice when repeated and has no Grant
  consume/effect ledger. Grant's current pure replay readback checker requires
  trusted positive exact Control route and destination IDs before returning
  a **non-independent** candidate record; no business effect or M3 PASS is
  claimed. Details: docs/G11_EXTERNAL_ACCEPTANCE.md.
- G12 acceptance-validator hardening (active Work Packet #54): the evidence
  CLI now runs in the locked development dependency set. Structural-only
  quality-close returns a nonzero process status while it reports unverified
  ChatGPT persona execution provenance and no release authority. Candidate
  identity, dirty-contract, partial coverage and synthetic self-claim cases
  have isolated negative regression tests. This does not close the mobile
  first-screen P2, direct second-persona Full User E2E, real DataRelay/Stellar
  acceptance, Foundation CI private read access or owner release gates.
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

G8 + inherited G7 review hardening previously passed **198 Python/API**,
**12 web unit**, static/typecheck/production build and **17 real Chromium**
journeys. Focused browser evidence also verified downloaded JSON manifest
format and executor scope presets without creating a credential.

G9 + updated G8 review corrections now passed **207 Python/API**,
**12 frontend unit**, static/typecheck/production build and **20 real
Chromium journeys** on the resolved merge worktree. The previous
FRONTEND_NOT_BUILT browser failure was caused by overlapping frontend rebuild
and Playwright execution; the full serial-build browser run passed 20/20.
These are source-worktree observations; GitHub exact-head CI, external
product acceptance and release/owner gates remain separate.
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
