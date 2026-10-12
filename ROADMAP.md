# DataRelay Grant 1.0 — unified execution roadmap

## 2026-10-12 M6 pre-live technical integration simulation — mock systems only

The next eligible step ahead of installing an external Control or Stellar
adapter is independently testable without touching those products. The source
now supplies a disposable Control-like SQLite product ledger, a separate
Stellar-like HMAC HTTP receiver with its own SQLite observations and an
actual isolated Grant ASGI service on ephemeral `127.0.0.1` ports. A reviewed,
nonsecret JSON dataset specifies precise Control replay and Stellar alert
identities. The mock technical scenarios cover independent producer/executor
scopes, no unapproved execution, atomic simulated effect-once even under
concurrency/restart, uncertain-operation reconciliation, stable signed outcome
receipt, deduplication, HTTP retry, tenant/case/alert/revision binding,
forged/stale/out-of-order outcome rejection, and feedback exclusion.

Native pre-live mock-and-product integration qualification **175/175 PASS**
across 9 focused test modules, including 21 new mock tests. Independent
Stellar persistence despite lost HTTP ACK, receiver restart/identity,
12 simultaneous callbacks, signed event expiry, and a Control crash after
the simulated effect but before Grant result reporting all fail closed or
reconcile without duplicate operations. Mock source passes changed-path Ruff. This is not a two-human E2E pass.

The separate optional private Foundation RC41 Python Wheel check verifies
original source-locked bundle/Wheel SHA256, then imports the package only in
an isolated test subprocess and confirms that missing real recovery and
send authority block mock backup and notification previews. None of these
tests installs the Wheel in the actual Grant backend, configures a scheduler,
performs record deletion, writes a customer's audit sink, invokes native
Control replay or publishes to a deployed Stellar receiver. They are not
Full User E2E, SMTP receipt, real Control/Stellar acceptance, CI private
Foundation access or GA. Detailed scope, commands, limitations and
per-scenario evidence: `docs/INTEGRATION_SIMULATION.md`.


## 2026-10-12 — M6 native-feedback-loop ingress guard hardening

Grant's actual request-creation boundary now rejects uppercase/whitespace-
modified first-party `Grant.*` event types, explicit original Grant result
IDs, declared DataRelay Grant origin and nested/wrapped copies of the same
first-party response. Bounded nested traversal fails closed on unusually
large/deep source envelopes without loosening an external integration's
current scope, tenant, request idempotency, approval or MFA checks. Native
source regression was initially RED (seven accepted feedback variants),
then **8/8 GREEN**, with the existing identity and product consumer-guard
unit tests green. This closes a Grant-owned ingress guard gap only: it is
**not** Stellar deployed receiver proof or DataRelay Control durable effects.


## 2026-10-12 — PF-11 Grant-native notification destination visibility

The accepted private Foundation RC41 `NotificationDeliveryPanel` is now backed by
Grant's **actual** administrator-authorized outbox rather than a synthetic
fixture. `GET /api/v1/admin/notification-destinations` returns only safe,
code-bounded SMTP and registered webhook references, current enabled flags,
queued/retry/dead-letter aggregate counts and the last **transport-level**
terminal outcome. It is read-only and fails closed for non-admin users and
integration credentials. URLs, recipient emails, raw errors, secrets and
payloads never enter the shared projection. No new sender, test-send, retry,
callback or business execution route is authorized; this is not proof that a
mailbox or downstream connected operation received or executed anything.

Focused backend RED→GREEN 3/3, Web RED→GREEN 2/2 and TypeScript passed.
Actual two-person E2E, Control/Stellar native effects, remaining unauthenticated
Foundation Actions `foundation-web` CI and owner merge/release remain separate.


## 2026-10-12 Grant consumer adoption of private Foundation RC41

Grant now pins original Foundation source `46ddb60cad8eae7b1718588cd19421e61b5300e7`
and ten independently verified `0.1.0-rc.41` npm archives instead of PF8.4.
The current Grant-owned Web imports are installed; navigation discovery,
administration task search, loaded-account facets/sorting and local session
filters are mounted on their existing authorized product data. Official
Web **670/670** unit PASS with TypeScript and Vite build PASS; latest
Foundation strict private bundle/byte verification and exact staging PASS.
This is **not** a release of unpublished Foundation, actual mailbox receipt,
Control/Stellar effect or installed two-person user acceptance. See
`docs/FOUNDATION_RC41_GRANT_ADOPTION_2026-10-12.md` for exact locks and gates.


## 2026-10-12 B1-B assigned-only approval overdue parity — source checkpoint

A verified gap caused Home's assigned-overdue action to open the general
requester-visible `view=overdue` queue, so a requester-only expired approval
could appear in the **Your approval queue** even though Home did not count it.
The new additive, server-filtered `approval_overdue` view requires the
existing current approval seat (`viewer_assigned`), including active
substitutes, while reusing the already-implemented escalation-due or
expired-undecided predicate **after** existing `_visible` authorization.
`view=overdue` historical requester follow-up and admin `ops_overdue`
retain their prior semantics. The legacy `/approvals?view=overdue` deep link
now resolves to `approval_overdue`; the Inbox has a dedicated Overdue action.
The Home overdue counter now excludes an already-APPROVED grant whose
execution grant later expired. No client-clock deadline or added decision
endpoint, privileged read or external effect. RED-first targeted API
regression reproduced 422 then GREEN 3/3, active-delegate API 1/1,
Web focused 20/20, TS noEmit and changed-path Ruff/diff hygiene PASS.
**B1-B source fix implemented; full API/Web/Chromium, real two-human/mailbox
E2E, native effects, CI and release remain intentionally unqualified.**


## 2026-10-12 B1 mobile Request Inbox — source implementation checkpoint

The last wide six-column current Request Inbox list now presents exact
saved role-scoped request rows as <=600px task-first cards: requested
action/target, current human decision, authoritative approval-seat count,
deadline/escalation, delivery and separately reported execution status.
Original advanced/quick filters, pagination, selected request Preview,
desktop table and separate human Review -> Confirm route are unchanged.
Only the original product UI file and Grant-owned responsive styles
were modified; previous platform-denied exact source path was retried
with the same authorized tool and accepted, not bypassed. Missing backend
overdue truth, if independently evidenced on the current source, is not
claimed fixed by this purely read-only projection.

Owner explicitly deferred formal browser/API/Web user tests, genuine
two-person independent-mailbox acceptance and CI/release. Source compiled
via TypeScript noEmit only; no release or external execution evidence.


## 2026-10-12 B5 Exceptions / Integration connections mobile source

At <=600px, the remaining wide Exceptions-to-resolve and Registered
connections tables are rendered as task-first mobile cards using the
same current role-scoped records, exact exception-count unknowns, and
unchanged diagnostic Review -> Confirm eligibility. Desktop tables,
existing integration query/tenant authorization and external execution
separation are preserved. No new backend or SMTP effect was implemented.
TypeScript noEmit source compilation completed, but all formal tests and
owner release acceptance remain DEFERRED as explicitly instructed.


## 2026-10-12 B1 Delegations / G8 Credentials mobile source

Two additional wide desktop tables were adapted into product-owned mobile
task cards: active/scheduled and historical Delegations, plus active and
revoked integration Credential metadata. They retain the same existing
role-scoped row lists, statuses, window/scope evidence, original revoke
eligibility and mandatory Review -> Confirm callback; desktop tables remain
unchanged. No extra credential or role authority, backend read/write,
external executor, secret exposure, or imported Foundation code. Source
TypeScript compile passed; the owner explicitly deferred full native
tests, independent two-user mailbox E2E, CI and release qualification.


## B3 mobile Approver groups directory — implementation-first (2026-10-12)

A remaining desktop-only five-column Approver groups list now has a mobile
read-only card presentation at <=600px with server-filtered group identity,
enabled state, saved member IDs, current account coverage truth, and original
Review group editor entry. Selected editor and list transitions restore
keyboard focus. No additional accounts/approver GET, frontend grant of
membership, local role elevation, group mutation, or Foundation source fork.
The existing desktop table and original CAS Review -> Confirm are preserved.
Source-only TypeScript compilation is a sanity check; tests, independently
operated two-human/mailbox acceptance and release remain DEFERRED by owner.


## B5 operations mobile source checkpoint (2026-10-12)

The remaining desktop-only Operations email-decision verification table
and integration callback-health table now have narrow read-only cards
using the same administrator-scoped loaded server summary and exact
integration diagnostics route. The Foundation UI and backend authority,
OTP/MFA, outbox status, execution grants and stored callback data are
unchanged. At <=600px the original wide tables are hidden from keyboard
and assistive technology and cards retain the state/unknown meaning.
This is source-only with type compilation; testing/real-user, native
Control/Stellar effects and CI/owner release are explicitly deferred.


## B5 audit evidence narrow worklist UI — source implementation checkpoint (2026-10-12)

Original vendor analysis selected task-first, progressive historical evidence
disclosure. After shipping B3 Administration and B4 Notifications mobile cards,
the authorized Grant Audit Explorer event results also use <=600px event
cards without horizontal audit-table scanning. They reuse the precise current
saved, role-scoped 50-row page and same request-chain inspector, timestamp,
recorded actor and sanitized JSON detail. Desktop table remains intact.
No changed search/export bounds, new API, extra history authorization or
claim of independently confirmed execution. This is source implementation,
not current-HEAD user/QA acceptance (testing deferred by owner).


## 2026-10-12 B4 additional Notifications 320/375 implementation-first UI

After the separate B3 Administration mobile source checkpoint, the remaining
desktop-only saved Delivery Health and Template Sets tables were adapted to
mobile task-first cards at <=600px. Cards reuse the exact existing
administrator-scoped saved rows, server page/filter results, blocked resend
identities and explicit notification-only Review -> Confirm flow. Desktop
table actions remain. No change to identity/OTP/MFA, email transport,
policy/template CAS, business execution, backend endpoints or common Foundation
packages. Full tests, actual two-person independent mailbox E2E, product
preview and release were explicitly deferred by the owner; source compilation
alone is not installed user acceptance.


## B3 Administration mobile/account lifecycle source implementation checkpoint (2026-10-12)

The next unimplemented Keycloak/ServiceNow-style Administration task-detail
slice was selected after the already-shipped six-vendor UX Gap Matrix and
completed P0-2G mobile policy list. Source includes Grant-owned 320/375px
selected-task/detail navigation and keyboard focus return, narrow account
cards and role-scoped audit event cards, and explicit Review -> Confirm
for the existing Grant account creation and account disablement APIs.
Initial credentials are never displayed in the review intent; the system
does not enable a second POST after an uncertain first attempt. Shared
Foundation packages and backend role rules are unchanged; no new auth or
external execution path is installed. This checkpoint is **source-only**,
with TypeScript static compilation but no formal full test or real
user/browser/mailbox acceptance (owner deferred testing). Do not conflate
new source with qualified, customer-accepted features.

Remaining B1-B6 work: test-qualified genuine human/SMTP acceptance, native
Control/Stellar effects, Foundation consumer package distribution/ownership,
appropriate product API reconciliation and CI/provenance/owner release.
Existing formerly completed source P0-2A/B/C/D/E/F, B4 CAS and B5
protected restore must not be reimplemented.


## 2026-10-12 current UI source status / remaining acceptance (supersedes stale row notes below)

P0-1 competitor actual first-party screens, pinned/license-permitted
Keycloak 26.5.7 REA and ranked adoption matrix are DONE. P0-2 selected
source: Entra/ServiceNow Inbox preview P0-2A, progressive detail Activity
P0-2C, Teleport deadline P0-2D, requested-versus-server-approved Grant
scope P0-2E, Keycloak-like group facets P0-2F, Windmill-like issued-link
PIN/OTP/fresh MFA UI and HTML backend P0-2B are COMMITTED/MOUNTED.
B4 server-side two-admin policy/template CAS is COMMITTED. The known
Foundation B3 member task projection contradictions for unavailable
`core.users` and `grant.smtp.test` are fixed in the Grant consumer
without modifying shared Foundation packages or backend roles. Previously
recorded blocked/partial checkpoints below refer to their historical HEAD,
not the current source; they must never trigger reimplementation of DONE UI.

**Additional source-only P0-2G mobile B4 UI:** Beyond the completed
P0-2A/B/C/D/E/F selected original screen set, the already observed
Keycloak/ServiceNow task-oriented list pattern is adopted for the mounted
Approval policies page at 320/375px: cards keep server-filtered policy
state, version, scope, group, notification and Open/Review clone;
the desktop table stays intact. RED-first Chromium mobile/keyboard test
became GREEN; native Web/typecheck/build PASS. This is a source UX
improvement only, not a new policy action, Foundation package upgrade,
two-human acceptance, or release. Detail/REA/license rationale in
`docs/UX_COMPETITOR_SCREEN_DECISIONS_20261011.md`.

**Remain OPEN:** actual two independent human/real mailbox P0-2B plus
same-HEAD role/mobile B1/B3/B4 Full User E2E, approved nonprod HTTPS/SMTP,
native Control/Stellar business effect and recovery provenance (B5),
Governance reconciliation and qualified PR/CI, then owner release (B6).
External tests are not replaced by synthetic browser results. Beyond the
explicitly selected screen patterns, possible extra enterprise workflows
remain out of scope or require new evidence and product approval; never
silently promise their UI was implemented.


## NEXT_CHAT_START — resume EXACTLY P0-1 competitor UI analysis first (2026-10-11 owner instruction)

**Entry lane:** `datarelay-labs/datarelay-grant` on
`dev-atlas`, branch `feat/grant-g10a-g0-integrated-candidate`,
reuse **ACTIVE Work Packet #67**, roadmap **Issue #37** and Draft **PR #100**.
Read the latest `NEXT_CHAT_START` handoff on Issue #37, this top
section and the current screen-evidence file. Do **not** redo full repo/
worktree research or begin by resuming the uncommitted email PIN UI
experiment. At handoff, **P0-1 research is the first runnable task,
not a new planning discussion or P0-2 source implementation.**

**ROADMAP 1 / P0-1 — actually analyze competitor UIs and their workflows:**
1. Choose the most valuable remaining *screen families* for Grant:
   approval Inbox / selected request detail, requester new request,
   email decision PIN/OTP, approver/group/policy Administration and
   notification/evidence views. For each, start from the already
   captured exact official screenshot and workflow links in
   `docs/UX_COMPETITOR_SCREEN_DECISIONS_20261011.md`; gather any missing
   first-party visual evidence rather than re-summarizing feature docs.
   Record visual hierarchy, navigation, role, primary/secondary actions,
   selection and review-confirm transitions, mobile/keyboard behavior,
   and what Grant lacks at the exact current HEAD.
2. **Actively use REA where it adds evidence**: prioritize an actual
   licensed/open-source UI target such as Windmill, Keycloak or a
   precisely licensed Teleport OSS subset. Confirm an immutable tag/
   commit, original license and analysis rights *before* retrieving
   source. Reuse the pinned Keycloak 26.5.7 / REA 6.3.0 17-file
   historical run but **do not count it as a new run**. When a new
   target is lawful and materially useful, run the **cached
   `rea-agents@6.3.0` read-only, isolated JavaScript-source** analysis,
   capturing exact CLI, target SHA, selected TSX paths, evidence,
   success/error, and no proprietary source copy. The previous
   general native REA doctor exited 1 because Hopper/Ghidra are not
   available; that is *not* proof JS AST analysis is unavailable.
   If the exact run is blocked by installation/authorization/tool
   policy, report the exact reason and continue official screenshot
   analysis rather than bypassing it. REA is an active task, not a
   ceremonial recommendation.
3. **P0-1 deliverable:** evidence-backed `candidate → vendor screen
   steps → current Grant gap → expected operator benefit → allowed
   implementation file(s) → license/REA evidence → risk/acceptance
   test` table. Distinguish vendor-published screenshots, authenticated
   live observation, actual REA static evidence and unknown claims.
   Prioritize the best 3–5 adoptable differences and identify
   already implemented/deferred features explicitly.

**ROADMAP 2 / P0-2 — immediately implement the selected differences:**
Only after P0-1 evidence/selection is recorded, implement the
highest-ranked *unimplemented* accepted feature directly in **mounted
Grant UI** with RED→GREEN deterministic tests, official Web/API/Static
as relevant, installed disposable-browser scenario, and GitHub
commit/push + Issue #37/Work Packet #67 evidence. Then continue the
next selected UI target in the same workstream while safely runnable;
do not stop at research/status. Never clone proprietary vendor source
or silently downgrade server authority, OTP/MFA, approval, execution,
governance or release controls.

**Preserve currently unfinished prior work:** The earlier rev72
email landing is **IN PROGRESS / NOT COMMITTED** and must remain
untouched until P0-1 selects it in ROADMAP 2:
- `grant/domain_routes.py`: staged? **NO**, unstaged browser
  `Accept: text/html` response negotiation for the existing issued
  token, while `Accept: application/json` stays the old API; focused
  local `tests/test_g10a_email_human_landing.py` + existing
  `tests/test_g10a_email_decisions.py` exercised 14/14 PASS
  in the prior chat, **not yet full qualification**.
- Untracked `tests/test_g10a_email_human_landing.py`, and untracked
  deliberately **RED** `web/tests/unit/email-decision-public-landing.test.ts`
  because `web/src/email_decision_landing.tsx` has **not** been
  implemented/mounted. Do not report a usable emailed PIN page.
- Original independent G12 intentionally RED test
  `tests/test_candidate_builder_integrity.py` **unstaged**,
  SHA256 of its git diff
  `cd7252633d96b424aa4e8f24ae08a8660f9663828b5fdffc0285ce9a73e68d4f`.
  Original Inbox RED stash object:
  `03cf0142b688baa17892e48785ff01803fa81c0e`.
- Previous last qualified/committed rev71 product source:
  `6b92069a4e2a65ba4156e1efa4203915c903dc16`,
  official native Web 632/632, Static PASS and synthetic isolated
  Chromium 37/37 (NOT independent real users/inboxes/CI/release).
  Exact HEAD may advance **only by documented safe handoff changes**.

**Release is still gated:** PR #100 remains Draft and governance-floor
fails (`main` epoch26 vs feature epoch14). Do not merge, bypass
governance or weaken Grant `persistent_state=true` /
`runbook_required=true`. Live two-person/two-mailbox E2E and
Control/Stellar native-effect verification remain unqualified.

**CURRENT OWNER P0 EXECUTION ORDER (2026-10-11, latest approved):**
**1. COMPETITOR ACTUAL UI/UX ANALYSIS FIRST → 2. SELECT GRANT ADOPTION TARGETS AND IMPLEMENT SECOND.**
This *replaces* the previous implementation-first priority without deleting
completed code, historic competitive research or the six B1–B6 bundles.
No new Work Packet or parallel project.

**P0-1 · COMPETITOR SCREEN AND USER JOURNEY RESEARCH (highest priority).**
Use dated *official* vendor-published **screenshots/illustrations, docs,
demo journeys** and licensed source when available. Inspect Teleport,
Jira Service Management, Microsoft Entra My Access, ServiceNow, StrongDM,
Keycloak and Windmill for queue → request detail → final approval,
time/context visibility, policy editor, user/group admin, notification
workflow, and history/evidence. Record **actual visual anatomy and
interaction steps** for a meaningful product gap—not feature-label
inventories. Mark each result `VENDOR_PUBLISHED_SCREEN` vs
`INDEPENDENTLY_OBSERVED_UI`; documented illustrations are **not**
authenticated, hands-on vendor execution. Use the already completed
six-vendor source-gap corpus but deepen screen-level observations.

**REA IS INCLUDED AS AN EXECUTION OPTION, NOT EXCLUDED BY THE ROADMAP.**
For each prioritized UI target, assess whether **REA (Reverse Engineer
Anything), using web/CDP inspection or static JavaScript analysis**, would
provide verifiable details beyond official screenshots/documents.
If **yes**, verify: a specific pinned artifact/release and vendor license,
the right to inspect it, installed REA/provider availability, supported
host/runtime, exact target boundary, and source/artifact provenance.
Then actually run a **read-only isolated REA pilot** and record commands,
target, versions, evidence/confidence, limitations and findings. If
unavailable, not useful, unlicensed, or authorization denied, explicitly
record `REA_NOT_RUN` and the exact reason; **do not pretend REA ran**,
use arbitrary npx latest/proprietary binary decompilation, copy vendor
proprietary UI/source/assets, bypass tool safety, or re-enable Cursor.
For open source (e.g. Keycloak), check the exact source license
(usually Apache-2.0) first; for closed enterprise vendor screens, use
permitted public UI observation, not REA decompilation without rights.
This is a real conditional execution gate, not an indefinite research
loop.

**P0-2 · COMPETITOR-INSPIRED REAL GRANT UI PRODUCT ADOPTION.**
Compare identified UI patterns **against the currently mounted
Grant HEAD**, select high-impact gaps in one evidence-backed priority
table with owner, affected source, accepted/declined/deferred status,
and concrete test. Then implement selected improvements on the
existing product routes: reviewer/task list→detail preview, user
email PIN human landing, role-safe Foundation administration, policy
configuration, notifications, and request/audit evidence. Separate
authorization and actual execution, maintain privacy and explicit
Review→Confirm. Per coherent change: new RED→GREEN tests → official
Web/API/Static as relevant → real isolated browser → verify protected
G12 RED + original Inbox stash → GitHub Issue #37 / Work Packet #67.
**Competitor UI analysis is not finished until the selected patterns
have been ranked, implemented and verified**, but a source-only PASS
is not two genuine human/mailbox E2E, native Control/Stellar effect,
CI, provenance, owner release or product GA.

**Owner approvals:** Proceed with this research/REA-when-justified/UI
delivery ordering. Previous approvals do not override tool safety,
governance epoch, actual authorization, production, or release gates.
Draft PR #100 governance conflicts must preserve Grant
`persistent_state=true`, `runbook_required=true`. Continue other
independent UI work if a protected effect is not executable.
Preserve all previous rev70 code/history, original G12 intentionally
RED patch, Inbox stash and existing branch/Work Packet.

**P0-1 SCREEN ANALYSIS COMPLETED FOR FIRST P0-2 UI SLICE; P0-2A MOUNTED (2026-10-11):**
Per the owner's new priority, *first* inspected official published
Teleport review/request screenshots, Entra My Access request/approval
**selected-right-detail pane** screenshot, and Jira/ServiceNow/StrongDM/
Windmill documented screen/task anatomy. Recorded evidence/provenance,
actual UI gaps, selective REA disposition and priority selection in
`docs/UX_COMPETITOR_SCREEN_DECISIONS_20261011.md`. Reused the
**already genuinely executed Keycloak 26.5.7 / REA 6.3.0 Apache-2.0
17-file static pilot** in `docs/UX_REA_KEYCLOAK_20261010.md`; this
pass did not run a new REA analysis on unauthenticated proprietary
vendors or falsely claim live vendor UI sessions.

**P0-2A SELECTED / IMPLEMENTED ON MOUNTED Grant Inbox:** following
Entra's selected request summary and ServiceNow's task-detail area,
`web/src/request_inbox.tsx` has a list-row **Preview request** action
with a two-column desktop / stacked mobile read-only request-context
region. It presents current **role-scoped** title, requester reference,
immutable action kind+target, submitted time and human deadline,
approval seat counts, and *separate* callback transport vs executor
**reported, not independently verified** state. It never shows raw
action parameters, sends a new administrative GET, casts email
delivery as verified inbox receipt or adds inline approval. The
current exact applied query and selected request ID must match one
**freshly loaded** server worklist row; changing filters or page, a
pending refresh or a missing selected request hides the preview
synchronously. Operators choose **Open full request** to access the
separate existing protected human Review→Confirm. New helper
`web/src/request_inbox_selected_preview.tsx`, local responsive
`web/src/styles.css`, RED-first unit tests and actual isolated
browser selection→filter invalidation→full-detail journey.
This source UI change does not satisfy two real users/mailboxes,
current-head native CI, Keycloak live vendor access, server two-admin
CAS, real Control/Stellar effects or release. The **next** selected
UX-02 minimal emailed PIN link landing remains open and needs full
auth-boundary and real email acceptance; never label it shipped based
on the existing unmounted component.

**P0-UI rev70 — mounted Approver Groups directory saved-vs-enabled truth (2026-10-11):**
The original `Administration → Approver groups` list showed only
`group.member_ids.length`, although an administrator needs to
recognize whether those saved IDs still correspond to currently
enabled accounts before editing a group for future approval
policies. Initial `useTask` loading could also show **No approver
groups** before the first role-scoped GET, misleading operators
about whether groups exist. Added read-only
`web/src/approver_group_directory_truth.tsx` and wired it to
the existing mounted `web/src/approvers.tsx`.
The list now shows both saved IDs and latest administrator-scoped
active-account lookup coverage, distinct disabled groups,
absent/disabled member warnings, repeated or empty saved member
identities, and explicit **Account status not checked** for missing
account evidence. It labels this as **account coverage rather than
approval eligibility or quorum**. The unverified loading/error state
no longer fabricates an empty group directory. No actual membership
or approval authority, server group editor, versioned CAS, external
execution or historical request plan is changed.

**A real installed synthetic Chromium run exposed a backend parity
defect**: SQLite's `GET /approver-groups` returns `enabled=0/1`
number while create/update receipts and frontend `ApproverGroup`
type use `false/true`. The initial overly strict list validator
rejected a successfully saved group as unavailable after Confirm.
Confirmed this exact response schema from the isolated browser
network fixture, added intentional RED test for numeric `enabled=1`
and `enabled=0`, and normalized **only exact boolean or 0/1
values** in the read-only UI adapter, rejecting unrelated strings or
numbers. The real group test creates a disposable group using
current `Review group creation → Confirm save group` UI, explicitly
`Refresh saved groups` after the privileged POST, then verifies
the accurate `1 / 1 currently enabled accounts` row and exact
group editor. No unauthorized direct API POST or CSRF bypass is used.
New source tests and full Web/Static/browser evidence must be
qualified before marking this mounted candidate ready for
independent human and release gates; fixture groups are not
real customer group deployment.

**P0-UI rev69 — mounted Foundation Administration mail-test Review→Confirm (2026-10-11):**
The Grant consumer's real `Administration → Mail & Notifications →
Mail delivery test` previously immediately issued the existing
administrator-only `POST /admin/mail-test` from one button click.
A synthetic recipient in an isolated test would receive mail without
a final human review of the operation. Mounted
`web/src/administration.tsx` now offers an explicit **Review mail test
to me → Confirm mail test to me** flow through a new product-owned,
`web/src/administration_mail_test_review.tsx` helper. It freezes
the currently authenticated administrator's **own** account ID,
username and exact email address and shows the existing fixed
test-mail subject, not an arbitrary recipient or new credential.
A synchronous one-shot guard prevents same-render duplicate submits,
rejects stale task/role/recipient drift and verifies the server's
`{smtp_accepted:true,event_id}` response without inferring a
received mailbox message or permission to approve/execute. Any
ambiguous or accepted mail-test POST remains latched for the current
mounted page until the operator separately reopens/reviews the
administration task; no automatic resend.

The server's existing administrator RBAC, authorized recipient-only
restriction, SMTP settings, bounded five-per-60s test-mail limiter
and current-authority validation remain **UNCHANGED**. Eight new
RED-first→GREEN deterministic tests and existing Foundation consumer
tests validate the guard and shared task grouping. A targeted
real-mounted synthetic Chromium administrator journey confirms **no
local fixture mail after Review** and exactly one message to the
disposable administrator mailbox after explicit Confirm. This is
NOT live customer SMTP delivery, independent mailbox receipt,
general account-role rollout, server multi-admin CAS or release.

**P0-UI rev68 — Operations exceptions task-first current-source worklist (2026-10-11):**
The mounted administrator `Operations → Exceptions to resolve` formerly
displayed five NOC-like metric cards without visible per-case next steps.
It now uses one read-only task worklist/table with **Delivery failed**,
**Approved, not consumed**, **Execution unknown**, **Execution failed** and
**Approval expired**, each with its exact current server-projected count,
an evidence-first operator instruction and an **Open [exception] queue**
button to the existing server-role-checked request worklist.
Invalid, missing, negative or non-integer counts render **Unavailable**,
never fabricated zero/healthy/success. Zero remains an explicit
**No matching requests** result, not an execution assurance statement.
The result never infers rank or grants retry, resend, approval, or
external execution; transport acceptance and executor-reported failures
are distinguished from independently verified business effects.

Actual mounted `web/src/operations.tsx` consumes new presentation-only
`web/src/operations_exception_worklist.tsx`. New eight RED-first
deterministic tests validate the five exact queue identities, counts,
lack of side effects, safe unknowns and escaping. The native browser
scenario opens `Execution unknown` using keyboard Enter and verifies
the real exact `/operations/queue/execution_unknown` route and server
filter `ops_execution_unknown`, without performing any business action.
This task is a Grant consumer UI enhancement, NOT Engineering System
governance, real two-person/email acceptance, independent external
execution, backend CAS or release. The existing draft PR #100
governance policy conflict remains separate and must not be bypassed.

**P0-UI rev67 — mounted Notifications Delivery Health current filters (2026-10-11):**
The administrator `Notifications → Delivery Health` page previously
wrapped role-scoped list GETs in one `useTask.busy`: a newly selected
filter/page could be skipped while a prior GET was pending, and
the old result could be confused with the current selected view.
Its resend review was still visible on a previously applied delivery
row even after the operator edited a new but unapplied state, event
or request filter. Mounted `web/src/notifications.tsx` now uses
`web/src/notification_delivery_current_worklist.tsx` to bind the
exact current selected filters/page to each role-scoped GET. The
server-projected `limit=50`, `offset`, count and delivery identity
are checked before rendering, and stale cross-/same-selection results
and network errors are discarded. The first render after applying
another filter hides the previous page; **Applied delivery filters**
are shown separately from unsubmitted edits. A privileged email resend
can be **reviewed only for the current fully loaded saved selection
with no unapplied filter edits**, and editing filters cancels any
unconfirmed resend preview. Existing server-side administrator RBAC,
same-render one-shot resend claim, server resend endpoint, explicit
post-effect reconciliation, and transport-vs-inbox-vs-execution
distinctions are **UNCHANGED**.

New nine RED→GREEN isolated worklist tests cover stale A/B,
out-of-order reads, invalid pages, unsubmitted source identity
and resend-review eligibility. Focused real mounted disposable
Chromium browser delays an actual PENDING GET while FAILED becomes
the selected saved state: later arrival of PENDING cannot replace
FAILED. No actual email resend POST or protected external operation
is performed by this test. This is UI correctness/source evidence
only, not independently operated human/mailbox E2E, backend atomic
CAS, changed-HEAD CI or owner release.

**P0-UI rev66 — mounted Audit evidence task-first applied-query truth (2026-10-11):**
The actual administrator `Audit evidence explorer` previously reused
`useTask.busy` for list and evidence-chain reads; a newer role-scoped
search was silently skipped while an older request was pending,
leaving a blank or stale page after changing filter/page. It also
offered CSV/JSON export of **the prior applied query** while an
administrator was editing new, unsubmitted filters. The mounted
`web/src/audit_explorer.tsx` now uses
`web/src/audit_worklist_current_query.tsx` latest-only
exact-query/per-page selection and validated server `total`,
`limit=50`, `offset`, `has_more` and event identity.
Newer query B starts even while A is pending; old A results/errors
cannot replace B. The first render after a filter change hides the
previous query's results, including before a new effect starts;
out-of-range empty pages after concurrent history changes are
accepted rather than inventing rows. It labels **Applied search**
versus edited-but-unapplied fields, disables both exports until
saved current-query readback and explicit Search, and lets the
administrator inspect, switch or close one exact request's
role-scoped evidence chain without a skipped read.

Backend RBAC and audit append-only records, metadata sanitization,
bounded exports, current execution/evidence authority and external
actions are unchanged. Synthetic RED-first tests validate stale
cross-/same-query results/errors, source page contract, export
eligibility, escaping and selected filter identity. Browser
regressions exercise actual administrator audit search, two
export formats, request evidence open/close, disabled stale export,
and delayed A GET superseded by B without a fabricated backend
response. These are synthetic read-only fixture checks, **not**
proof of real two-human email E2E, customer external execution,
changed-HEAD CI or owner release. The G12 intentionally RED
candidate patch and protected Inbox stash must remain separate.

**P0 mounted Integrations exact-current diagnostics + issuance-scope parity (rev55, 2026-10-11):**
Read-only `Integration Diagnostics` previously used one shared
`useTask.busy`-serialized asynchronous selector. An older GET for A could
display A details after selecting B; repeated same-integration GETs and
errors were not scoped to latest intent. Added
`web/src/integration_diagnostics_read_scope.ts` and wired its
latest-only selection/read generation and exact server integration-ID check
into the mounted `web/src/integration_diagnostics.tsx`. Switching
immediately hides the old projection, the newer B GET can run even while A
is pending, stale results and errors are discarded, and a currently
unavailable integration cannot show old detail. No diagnostic POST,
authorization, external action or business execution changed.
**Backend parity correction** in existing issuance handoff: `issue_token`
returns user-reviewed order, but `list_tokens` returns persisted
`sorted(set(scopes))`. Auto-selection now compares exact duplicate-free
scope **sets**, not array order. An executor credential with the same
set matches; extra/missing scopes never match. New 6 diagnostics RED→GREEN
and 1 issuance parity RED→GREEN tests; official Web **519/519 PASS
(64 suites)** with TypeScript/Vite build PASS, native Static PASS
with G12 path-only preserved/restored SHA-exact. No real token
issued/revoked, installed browser/two-human/mailbox E2E, native
Control/Stellar effect or changed-HEAD CI/release acceptance. The next
independent accepted P0 UI source must not touch previously platform-denied
Inbox/core/app/Admin/browser or ordinary Git commit/push effects.

**P0 competitor-derived issued credential worklist handoff (rev54, 2026-10-11):**
The already-mounted Integrations > Credential tools source now transfers an
explicit same-integration role-scoped GET of saved issuance metadata directly
to the real Issued credentials worklist, avoiding a separate manual selector
and second GET. A confirmed server receipt ID is preselected only when the
matching saved enabled credential and exact scopes are present. Missing,
revoked or mismatched metadata leaves issuance locked for another explicit
same-integration refresh rather than implying POST failure/success. A possible
ambiguous POST without a receipt permits read-only history inspection but
never fabricates a credential ID or retries issuance. Latest-only selected
integration read guards discard older cross-/same-integration GETs. Worklist
inspect action shows selected immutable ID/scopes/status/issued timestamp;
revocation remains a separate reviewed one-shot effect. The handoff copies
only allowlisted saved metadata (no raw token, extra API fields, invented
RBAC, background POST or external execution). New
`web/src/integration_credential_handoff.tsx` and 10 RED-first-to-GREEN tests;
mounted `web/src/integrations.tsx` and
`web/src/integration_credential_workspace.tsx` updated. Official native Web
**512/512 PASS (63 suites)** including TypeScript and Vite production build,
native Static PASS with preexisting deliberately RED G12 path-only preserved
and restored SHA-exact. Existing API482/482 is historical; no real tokens,
SMTP, installed two-person browser E2E, changed-HEAD CI, approved Git push,
or release. This is B1-adjacent accepted P0 mounted Integrations
SOURCE_PARTIAL, not B1–B6 acceptance. Prior platform-denied Git, Inbox,
core, app, Administration and browser effects remain untouched.

**P0-UI rev57 — PREVIOUS SAFETY DENIAL RETRIED AND CLEARED (2026-10-11):**
On dev-atlas the exact earlier platform-blocked source edits were retried
through the *same* authorized development tool and worktree and both
succeeded this time. In actual mounted `Integrations → Diagnostics`, the
schema-v1 conflict-preview UI now invalidates prior read-only results on
every JSON edit or new manifest export, discards older GET/preview errors
and responses, and verifies server `preview_only=true`, `can_apply=false`,
manual-only readiness and counts before rendering migration planning.
The existing server schema-v1 preview POST is read-only, not an import
or permission grant. New
`web/src/integration_configuration_preview_guard.ts`,
`web/tests/unit/integration-configuration-preview-guard.test.ts`
**5 intentional RED (missing module) → GREEN** cases and mounted
`web/src/integration_diagnostics.tsx` change.

The actual `Approval policies` list's read-only grouped-quorum cell
in `web/src/policy_approval_summary.tsx` now refuses to infer valid seats
from repeated/empty member IDs or ambiguous duplicated group identities;
new 2 RED→GREEN cases added to the original
`web/tests/unit/policy-approval-workspace.test.ts`. Backend group
eligibility and human authority are unchanged. Official native
`bash scripts/checks.sh web` **526/526 PASS (65 suites)** with
TypeScript/Vite production build PASS, native Static PASS after G12
path-only backup/restoration with exact SHA. No live config import,
real SMTP/credential issuance, Control/Stellar external effect,
installed two-person/browser E2E, CI, provenance or owner release.
The accumulated local candidate must separately pass release gates.
These safe source tasks are not replacements for blocked B1 Inbox, B2
PIN landing, B3 Foundation shared Admin/role/mobile or B4 server CAS.

**P0-UI rev58 — mounted integration verification minimum change Review→Confirm (2026-10-11):**
Actual `Integrations → Approval verification minimum` previously immediately
sent `PUT /integrations/{id}/decision-verification` from its editor Save,
with no separate frozen human Review, synchronous duplicate-submit guard
or explicit ambiguity reconciliation. Mounted
`web/src/integration_verification.tsx` now requires the administrator
to select a valid current enabled integration, proposed EMAIL_PIN /
same-mailbox EMAIL_PIN_PLUS_OTP / fresh Grant TOTP MFA minimum,
explicit downgrade acknowledgment where applicable and bounded audited
reason; then a **read-only exact current→new Review** and separate
**Confirm change**. New `web/src/integration_verification_review.tsx`
freezes integration ID/name/kind/tenant/receiver origin/current minimum,
selected new minimum and reason, performs one current role-scoped
`GET /integrations` before at most one server-authorized PUT, uses a
synchronous in-process one-shot guard, verifies the server
`{integration_id, decision_verification_minimum,
existing_snapshots_unchanged:true}` receipt and holds ambiguous or
accepted writes pending explicit same-integration saved-state Refresh.
A possibly committed PUT is never retried automatically if the optional
readback fails; switching integration cannot unlock the original
attempt. **This is client-side safety, NOT atomic two-administrator
backend CAS.** The server is still authoritative for administrator
permission and existing request-time snapshots; no human approval
or external execution implied. New 10 RED missing module → GREEN,
existing 10 adapted/passed; official native `bash scripts/checks.sh web`
**536/536 PASS (66 suites)** with TypeScript/Vite production build
PASS, native `bash scripts/checks.sh static` PASS with protected
intentionally RED G12 test path-only stashed/restored SHA-exact.
No real PUT, actual mail, Control/Stellar effect, browser/mobile two-person
E2E, full CI/provenance or release gate claimed.

**P0-UI rev59 — mounted B1 Inbox task-first worklist + source-truth (2026-10-11):**
The actual `My approvals / Inbox` `web/src/request_inbox.tsx` no
longer serializes role-scoped GETs behind `useTask.busy` (which could
silently skip a new filter B while old A was in flight), or lets a
late earlier filter/page/Refresh result or error render under the
newly selected queue. New
`web/src/request_inbox_task_worklist.tsx` supplies query-identity
monotonic latest-only read, first-render scoped projection hiding,
and read-only task-first immutable `action.kind` + `action.target`
summary. Missing/invalid server-projected approval progress now shows
**Approval progress unavailable** rather than fabricating 0/1 seats;
genuine server count, waiting group and reviewer identities are
rendered only when valid. No new approval/decision POST, role expansion,
overdue reinterpretation, or backend status/permission change.
This is a real mounted Inbox source edit on the **same previously
platform-denied path**, freshly retried successfully; separate
`grant/core.py` overdue truth and genuine human inbox E2E remain OPEN.

New 9 RED missing-module → GREEN focused cases, existing role/quick-view
8 PASS; official native `bash scripts/checks.sh web`
**545/545 PASS (67 suites)** with TypeScript/Vite build PASS and native
`bash scripts/checks.sh static` PASS with original deliberately RED G12
path-only preserved/restored SHA-exact. Official synthetic browser attempt
was initially runnable but **28/28 Chromium launch FAILED before scenarios**
because the developer host lacks system `libatk-1.0.so.0` and other runtime
libraries; this was **environment**, not application scenario evidence.
Existing private user-local cached Playwright runtime was verified with
`ldd` for all missing libraries and used through the supported
`GRANT_BROWSER_LIBRARY_PATH` native mechanism (not a denied safety
workaround). Targeted loopback-only Chromium B1/G12 group initially had
**3 PASS / 1 FAILED** because its G6 collaboration step still expected
an obsolete direct `Confirm message`. Updated the exact synthetic
`web/tests/browser/approval.spec.ts` scenario to exercise the already
mounted `Review message → Confirm message`, then reran only that failed
G6 browser scenario: **1/1 PASS**. Thus all four affected scenarios have
individual passing evidence, **not** one 4/4 single-run qualification.
These are disposable fixture sessions, NOT two independently operated
real human/mailbox same-installed-HEAD full E2E and NOT browser
full 28/28 acceptance or GA. CI/hash/provenance/smoke and owner release
still require separately authorized terminal gates.

**P0-UI rev60 — B1 authoritative human-overdue truth and mounted Inbox deadline explanation (2026-10-11):**
Actual B1 `GET /requests?view=overdue` in `grant/core.py` incorrectly
included **every** `state=EXPIRED` request even after human APPROVED,
misleading reviewers when a **post-approval execution grant** expired.
The existing administrator `ops_overdue` correctly required an
undecided human approval and a passed decision deadline. Scoped minimal
backend fix makes the human overdue filter follow that same predicate:
server-derived escalation overdue for `AWAITING/HELD`, OR terminal
`EXPIRED` **with `decision is None` and `deadline<=now`**.
It does **not** alter historical decisions, authorize new actions,
create delayed jobs, or reclassify an external executor report.

Reproduced with real API RED regression by extending the existing
`tests/test_operations.py::test_approved_grant_expiry_is_not_misclassified_as_overdue_approval`
to assert all admin/requester/approver human queues exclude expired
approved grants, while a new test proves genuinely undecided expired
approvals remain visible. Focused **RED 1 failing, 1 passing →
GREEN 2/2**. New read-only
`web/src/request_inbox_deadline_truth.tsx` in actual
`web/src/request_inbox.tsx` makes source truth explicit: decision
deadline vs server-marked due escalation, undecided expired approval
vs approved grant expiry, separate external effect; never infer
overdue from browser clock or claim past deadline means current
eligibility. New 6 RED missing module → GREEN unit tests; affected
Inbox regressions **23/23 PASS**.

Official native `bash scripts/checks.sh api` **483/483 PASS**
(1 upstream Starlette TestClient deprecation warning),
native `bash scripts/checks.sh web` **551/551 PASS (68 suites)**
with TypeScript/Vite production build, and native
`bash scripts/checks.sh static` PASS. Focused existing
loopback-only Playwright/Chromium **2/2 PASS** for approver
held/recent/needs transitions and Home overdue drill-down with
user-private already installed runtime libraries. Both are synthetic
fixture evidence, **not** two independently operated real humans,
email mailboxes, complete browser qualification or CI/production.
During official API the deliberate G12 intentionally RED
`tests/test_candidate_builder_integrity.py` was preserved
by **path-only** stash then restored SHA-exact
`cd7252633d96b424aa4e8f24ae08a8660f9663828b5fdffc0285ce9a73e68d4f`;
protected historical Inbox RED stash
`03cf0142b688baa17892e48785ff01803fa81c0e` unchanged.
B1 user/installed E2E, B2 issued email PIN no-login landing,
B3 Foundation member/Admin/mobile, B4 two-admin policy/template
server CAS, B5 native Control/Stellar external effect and restore,
B6 independent human acceptance/CI/provenance/smoke/owner release
all remain open; source-only PASS is not GA.

**P0-UI rev61 — B1 synthetic mobile/keyboard Inbox viewport validation (2026-10-11):**
Added a real Playwright browser scenario in existing
`web/tests/browser/approval.spec.ts` using only the isolated loopback
fixture to create an actual requester-owned approval and independently
sign in with the fixture approver. The same role-scoped
`My approvals` worklist was exercised at **320 px** and **375 px**
viewport widths with immutable action kind + exact target, real
server-projected 0/1 seat count, no *document-level* horizontal
overflow (internal table scroll remains permitted), and keyboard
`Enter` on the focused **On hold** task shortcut showing the
`aria-pressed` state and matching `Work view=held`.
Focused synthetic Chromium test **1/1 PASS** (both widths inside
one scenario) using previously installed private Playwright runtime,
no login/password UI source changes. This is a product-mounted
responsive/keyboard fixture check, **NOT two independently operated
real people**, genuine two-mailbox decision URL E2E, owner-approved
Browser 28/28, installed frozen HEAD/CI or release. Prior rev60
official API483/483, Web551/551 and Static PASS source evidence
remains valid; no product/runtime source changed in this bounded
test-only rev61 slice.

**P0 mounted Notifications Branding exact Review→Confirm (rev62, 2026-10-11):**
The actual `Notifications → Branding` page previously submitted admin
`PUT /notification-branding` immediately from Save without showing
the current versus proposed future sender identity, one-shot protection
or post-write reconciliation. New
`web/src/notification_branding_review.tsx` and actual mounted
`web/src/notifications.tsx` now require a read-only snapshot of exact
saved brand/sender/logo, valid different single-line draft and an
explicit final **Confirm branding change** before at most one admin
PUT. A synchronous in-process guard blocks duplicate Confirm, one
fresh role-scoped saved branding GET verifies the reviewed source
before PUT, and the exact returned brand, sender and unchanged system
logo are verified before success display. Ambiguous or acknowledged
PUT stays latched until an explicit successful saved-state Refresh;
leaving the Branding task cannot silently unlock it. This affects
future notification snapshots only; it does not send mail, change
existing human decisions or grant external execution. The existing
backend still owns administrator permission and input validation.
**Not server-side two-administrator atomic CAS**; lost-update
protection is still a separate B4 backend gate.

New 10 RED missing-module → GREEN unit cases, neighboring preview
and test-send 16 cases PASS. Official native Web **561/561 PASS
(69 test suites)** with TypeScript/Vite production build PASS,
native Static PASS after protected G12 RED path-only stash/restore
SHA-exact. A focused **real mounted synthetic loopback Chromium
Branding scenario 1/1 PASS** verified no change on Review and the
exact change only after Confirm and explicit saved Refresh. This
uses an isolated disposable administrator fixture, not production
credentials, real SMTP or independently operated two-person E2E.
B2 emailed PIN landing, B3 shared Foundation role/mobile,
B4 server template/policy CAS, B5 external Control/Stellar effects
and B6 release/CI/user acceptance remain open.

**P0 mounted Notifications Template Sets full nine-event Review→Confirm (rev63, 2026-10-11):**
The actual `Notifications → Template Sets` create/update editor previously
immediately POSTed/PUT the entire saved event family upon Form submit.
It now uses the product's task-first list→details→**review exact
source/set version, status, changed events and all nine future
subject/body texts→explicit final Confirm** workflow. A new
`web/src/notification_template_save_review.tsx` snapshots complete
nine-event content and exact selected saved ID/`updated_at`/version
fingerprint; a new set checks a duplicate case-insensitive name on
the current role-scoped list before creating it. After fresh saved
GET, at most one server-authorized POST or PUT can start; a
synchronous attempt guard rejects same-render double-clicks and
retains ambiguous/acknowledged effects until operator-triggered
Refresh of the originally reviewed saved set. Server response must
match exact returned ID, enabled/name and complete event content
before UI success. The mounted `web/src/notifications.tsx`
direct receipt projection does not turn an optional GET failure
into a second save. The original `web/tests/browser/approval.spec.ts`
older create/test-send fixture path was aligned to already-shipped
reviewed UI; a new isolated B4 browser case verifies **no server
create/update on Review**, exact write only on Confirm followed
by fresh saved metadata reconciliation.

New **12 RED missing-module → GREEN** unit cases, focused Notifications
**28/28 PASS**; official native Web **573/573 PASS (70 test files)**,
TypeScript/Vite build PASS and Static PASS with G12 intentionally RED
path-only preserved/restored SHA exact. Both Branding and Template
Set synthetic real-mounted Chromium UI paths **2/2 PASS in a
single focused run**; no real customer mail, SMTP outside
disposable fixture, native Control/Stellar execution or full
independent two-human/two-mailbox E2E. The backend remains final
authority over allowed variables, role and enabled-policy
constraints; client-side current-GET review is **not atomic
two-administrator CAS**, still a separate B4 server/release gate.
Existing request snapshots are never silently rewritten.

**P0-UI rev64 — official full synthetic browser 31/31 qualified on mounted Grant source (2026-10-11):**
The single-file Playwright scenario suite previously exercised obsolete
immediate `Submit request`, integration registration/credential issuance,
connection test, delegation/revoke, collaboration and policy Testing
buttons, and missed current Integrations `Credential tools` /
`Diagnostics` tabs. Updated only the official
`web/tests/browser/approval.spec.ts` to actual already-mounted
**Review → explicit Confirm → saved-state Refresh** journeys; no
backend auth/approval or external business execution changes.
The repaired synthetic browser suite reached **30/31 PASS on one
disposable backend**, but the final login was correctly denied
`RATE LIMITED` after repeated admin logins in a shared DB.
The official browser command now discovers every test automatically,
partitions the complete list into **8/8/8/7** independent
disposable webServer/DB batches and verifies each Playwright JSON
result against its exact expected test count, with **zero failures,
skips or flaky tests**. The current backend per-user
**15 login attempts / 300 seconds** limit remains **UNCHANGED**;
no rate-limit overrides, extra privileges or real accounts.
Each batch's result file is retained separately under ignored
`.dev/grant-browser-evidence-*`, avoiding a misleading final-only
JSON report. Source files:
`scripts/checks.sh` and `web/tests/browser/approval.spec.ts`.
Official native `bash scripts/checks.sh browser` **31/31 PASS in
4 isolated fixture batches**, evidence verified **31 distinct
test identities**, same dev worktree/compiled candidate HEAD.
Official native Web **573/573 PASS (70 suites)** with TypeScript/
Vite build PASS; native Static PASS after intentionally RED G12
path-only backup and exact restoration. These are true UI-driven
**synthetic loopback fixture** journeys with separate authenticated
browser contexts, **NOT** independently operated two real users,
two real inboxes, Control/Stellar native effects, customer acceptance,
same-HEAD release freeze, changed-HEAD CI or production release.
B1 full independent-person E2E, B2 emailed PIN public route owner
approval, B3 shared Foundation consumer E2E, B4 server atomic
two-admin CAS, B5 native effects/recovery and B6 owner gates remain OPEN.

**P0-UI rev65 — explicit one-time scoped credential copy (2026-10-11):**
In the actual `Integrations → Credential tools → Create scoped integration
credential` issuance receipt, the ephemeral raw secret was visible
but not easily copyable. New **Copy credential** control performs
clipboard writing **only on the user's click**, guarded by current
raw token presence and browser permission. Copy feedback is shown
only after the clipboard API actually succeeds, with generic
permission/unavailable text (no sensitive error logs). The saved
credential list, revocation workflow and review state never receive
or persist the raw secret. The one-time **Hide credential** continues
to remove it from React's rendered view, and the UI explicitly warns
that the operating-system clipboard may persist after hiding:
the user must store in an approved secret manager and clear it
using their device controls. Clipboard is never auto-cleared,
silently written to browser storage, or copied automatically.
Exact changed mounted component:
`web/src/integration_credential_create_review.tsx`,
with four deliberate RED→GREEN copy helper/UI unit scenarios in
`web/tests/unit/integration-credential-create-review.test.ts`
and a focused disposable-browser secret-copy/Hide assertion in
`web/tests/browser/approval.spec.ts`.
Official native Web **577/577 PASS (70 suites)** with TypeScript/Vite
production build PASS; native Static PASS after original G12
intentionally RED test path-only backup and exact restoration.
Focused real mounted synthetic Chromium issue/revoke/COPY scenario
**1/1 PASS** after rebuilding frontend; same rendered secret was
read from granted disposable context clipboard and removed from
view on Hide. A previous Chromium trial used the old web/dist
asset and was correctly not counted as successful. The rev64
**31/31 full native synthetic browser** evidence remains the prior
exact rev64 baseline; this rev65 clipboard-specific test is not
misrepresented as new same-HEAD 31/31 or full real-user E2E.
No real machine secrets, OS install, authorization or token
issuance/revocation backend code changed. B1 two-human/two-mailbox,
B2 public issued-link PIN auth route (owner approval), B3 shared
Foundation, B4 two-admin CAS, B5 native effects and B6 CI/release
remain open.

**Owner replacement decision:** 2026-10-10. **One current roadmap, six major
delivery bundles (B1–B6), retaining M1–M8 technical scope.** This file supersedes all former sequencing prose in
ROADMAP.md and the former body of [coordination Issue #37](https://github.com/datarelay-labs/datarelay-grant/issues/37).
Old requirements/decisions are preserved through prior Git commits and existing
issue/PR discussions, NOT maintained as a second competing active roadmap.
Existing Work Packets/PRs are retained and reused, not deleted or multiplied.

**Product authority:** docs/PRODUCT_STANDARD.md.
**Current factual implementation:** docs/STATUS.md, exact source/tests and
the latest authorized Work Packet. **External evidence contracts:**
docs/USER_SCENARIOS.md, docs/SURFACE_RECONCILIATION.md,
docs/FULL_USER_E2E.md, docs/INTEGRATION.md, docs/OPERATIONS.md.
**Competitive evidence:** docs/COMPETITIVE_GCI_GRANT_20261010.md and
docs/UX_COMPETITOR_RESEARCH_20261009.md (14 vendor reference products;
official documentation separate from observed UI). **FIRST DELIVERY PRIORITY:
P0-UI-1 actual product UI implementation.** P0-UX-0 competitive source/REA
research is already completed and becomes reusable evidence, not a new research
queue.


## Six delivery bundles — executable order and acceptance gates (owner 2026-10-11)

**Authority / precedence:** real product UI is still first; completed
competitor Gap Matrix, licensed Keycloak REA and five-screen designs are reused.
The six **B1–B6 are the only large delivery units**, not a replacement for
the technical requirements and existing Work Packets in M1–M8 below. Reuse
existing WPs and PRs. A source-only PASS is not installed user acceptance.

| Bundle (execution order) | Outcome / retained detailed M1–M8 scope | Existing WP and bounded exit evidence | Observed state / next action |
| --- | --- | --- | --- |
| **B1 — Approval Workspace (FIRST)** | Requester New request → read-only review → one server create; approver Inbox task/action/deadline → explicit Hold/Approve/Deny/Cancel; current assigned seats, delivery vs reported effect, comment/linked replacement, truthful deadline. **M1 + M5 approval UI** | **#67** and existing M1 packets; exact mounted-source RED→GREEN + official Web/Static, then two independent authorized people and desktop/keyboard/mobile scenario same installed HEAD in B6 | **IN PROGRESS, SOURCE PARTIAL:** Requester New request Review→Confirm and RequestDetail/reviewer confirmation/evidence shipped, Web 230/230 at source checkpoint. **IMPLEMENTED THIS BATCH:** read-only fresh policy/predecessor verification before one request-create POST, and RequestDetail admin email/webhook resend Review→Confirm with exact current delivery and suppressed accidental repeats (source Web **237/237 → 247/247 PASS**, Static PASS). **Additional source:** RequestDetail reviewed admin escalation/reassignment routing no longer misreports successful POST when optional GET fails; reassign directly uses server-projected RequestRow, escalation refresh has a separate failure indicator and stale actions are hidden. Rev32 Web **256/256 PASS**. **New independent B1 source (rev34):** RequestDetail Approve/Hold/Deny/Cancel now synchronously claims exactly one reviewed POST; ambiguous submit or successful POST with failed readback requires explicit role-scoped Refresh before another decision. Rev34 RED→GREEN 6 cases, native Web **262/262 PASS**. **Rev35 requester-side source:** New request Confirm synchronously claims one attempt before policy GET, blocks a double-create POST, releases only if failure is provably before POST, and requires request-list reconciliation after an ambiguous write; existing freshness guard unchanged. Rev35 RED→GREEN 6 cases, native Web **268/268 PASS**. **Rev36 seat evidence source:** RequestDetail reviewer history no longer fabricates a single approver seat when the server plan is absent; read-only evidence labels become unavailable, not authorization. Rev36 RED→GREEN 2 scenarios, native Web **270/270 PASS**. **Rev37 collaboration source:** Review→Confirm for comments, questions, information and change requests now issues at most one server POST per attempt; an uncertain POST requires explicit role-scoped refresh before any new review. Rev37 RED→GREEN 6 cases, native Web **276/276 PASS**. **Rev38 B1 server-receipt integrity:** NewRequest creation, RequestDetail human decision and admin escalation/reassignment responses now validate the exact reviewed immutable request, policy version/target and authoritative revision before presenting success; unverified routing receipts cannot be misreported as acknowledged. Rev38 RED→GREEN 16 cases, native Web **292/292 PASS**. **Rev39 selected-seat decision truth:** human Approve/Hold/Deny/Cancel POST projection must prove the chosen outcome and represented approval seat (including delegated actors) before reporting success; optional GET cannot overwrite that proof. New 9 regression cases with 6 initial RED and a delegated-review binding test; official Web **302/302 PASS**, TypeScript/Vite build PASS. **Rev40 delivery resend one-shot:** RequestDetail Confirm resend now takes a synchronous delivery-ID claim before the fresh GET; a possible resend POST cannot be repeated by same-render clicks, and only a successful explicit Refresh clears the claim. Rev40 RED→GREEN 7 cases, native Web **309/309 PASS**. **Rev41 final human review:** RequestDetail Confirm now displays frozen request identity, full action parameters/fingerprint, actual and represented reviewer seat; changed parameters or request identity forces a fresh Review. Rev41 five RED→GREEN scenarios, native Web **314/314 PASS**. **Rev42 transport truth:** RequestDetail separates Webhook callback status from FAILED email-notification count; 0 failures never implies mailbox receipt and unavailable counts do not become fabricated zeroes. New RED→GREEN 3 cases, native Web **317/317 PASS**, TS/Vite build PASS; rev44 Home task-first worklist also shows immutable operation and exact target in pending decisions, requester follow-up and recent requests, with no new permissions; native Web **333/333 PASS**. Rev45 requester Home execution status no longer calls an executor-reported SUCCEEDED/FAILED effect independently completed/failed; native Web **358/358 PASS**, TS/Vite build PASS. Rev35–49 remain LOCAL STAGED ONLY under prior denied Git write; rev48 mounted RequestDetail now presents exact action before technical state and returns each user to the appropriate role-scoped task queue (Web 406/406 PASS). **BLOCKED:** Inbox exact prior denied source, M1 backend overdue truth and installed same-HEAD human E2E, so B1 is NOT finished |
| **B2 — Email approval (no-login human decision)** | Issued link actually lands on PIN entry, optional OTP/fresh TOTP, selected human action and separate final confirmation, expiry/replay/auditable recipient attribution. **M4** | **#67/#70–#73/#78**; exact issued-link GET non-mutating and two unrelated real mailboxes/personas twice, policy verification-floor checks | **WAITING EXACT SAFETY GATE:** portal/adapter exists but actual issued URL/API landing is not mounted; earlier app.tsx route mutation blocked; no alternative-route workaround |
| **B3 — Shared Identity & Administration** | Foundation shared Login/Sidebar/Administration parity with Control, grouped navigation, member/admin capability truth, desktop + 320/375 first viewport, accessible keyboard. **M2** | **#57/#75/#67**, shared Foundation B2; role-true task actions and two-account same-version interactive review | **WAITING EXACT SAFETY GATE:** previous app/Admin/styles/mobile/browser edits blocked; shared Foundation remains owner, not Grant-specific CSS duplication |
| **B4 — Policies, approver groups & Notifications** | Policy lifecycle, groups, safe edit/conflict/CAS, full template sets, preview, branding and delivery worklist/send confirmation. **M3** | **#38/#64–#66/#80/#67**; two independent admin sessions must demonstrate atomic 409 stale-save without losing Deny/MFA/template changes, native non-sending previews, authorized test delivery only | **SOURCE PARTIAL:** policy Clone→Draft and Draft→Testing confirmation and failed-delivery resend review done; **P0 BLOCKED:** server policy/template CAS. Independent admin test email source is now Review → server-rendered preview → Confirm with signed-in account recipient, saved-template freshness GET and single SMTP-attempt gate (RED→GREEN 13, official Web **330/330 PASS**); no real SMTP sent. **Rev46:** Delivery Health now guards out-of-order filter/page GETs and same-render duplicate FAILED-email resend POSTs, unlocking an attempted ID only on explicit successful Refresh (8 new RED→GREEN tests; native Web **366/366 PASS**). **Rev48 P0:** Approver groups now have explicit member-order editing and Review→Confirm group save with server freshness read, original group CAS and synchronous one-shot attempted POST; Web **406/406 PASS**. **Rev49 P0 policy list:** rule/group/quorum truth and group-name search, Web **436/436 PASS**. **P0 BLOCKED:** server policy/template CAS and installed two-admin acceptance |
| **B5 — Evidence, recovery & native external effects** | Bounded/redacted audit, exception diagnostics, private backup/restore/migrations/provenance, native DataRelay Control exactly-once and separately verified Stellar callback, not synthetic grant-only effects. **M5 + M6** | **#48/#97/#99/#52/#74/#90–#94**; verified native durable effect/readback, disposable recovery, owner-approved external destinations | **PARTIAL / EXTERNAL WAITING:** rev45 Audit Explorer filters/readback now use latest-only request/page tokens and reject malformed/impossible audit date bounds rather than silently broadening searches, with request-specific evidence identity checking and collapsed safe metadata (22 source tests across three audit suites); native Web **358/358 PASS**. Existing isolated API/backup source and these audit UI tests do NOT qualify native Control/Stellar effects, customer restore or release; preserve G12 intentionally RED candidate integrity test |
| **B6 — Real user qualification and authorized release** | On one frozen installed HEAD, two complete independently operated real-browser+two-mailbox passes, keyboard/mobile, CI/PR/provenance/public smoke, owner signoff only after B1–B5. **M7 + M8** | **#54** and existing release WPs; same HEAD two-person E2E PASS → freeze → native required CI/hash/provenance/smoke → explicit owner acceptance | **WAITING DEPENDENCIES:** no same-HEAD real-user/mailbox/browser, Control/Stellar effect, PR CI or release authority confirmed; do not infer PASS from source tests |

**Independent B4 administrator test-email safety checkpoint, October 11:**
The saved Notification Template Sets editor formerly sent a real test
email immediately from the Preview & Test card. It now requires a
non-sending server render preview, displays the exact saved message and
the signed-in administrator's recipient restriction, and waits for a
separate Confirm before the existing SMTP test endpoint can be called.
A synchronous one-shot claim blocks rapid repeat Confirm clicks.
Immediately before send, a role-scoped saved-template GET rejects
another administrator's changed content; an ambiguous SMTP POST remains
latched until an explicit successful Refresh and mailbox reconciliation.
This is a client-side safety guard, **not** server template CAS.
New RED missing implementation → GREEN **13/13** unit cases; focused
16/16, official Web **330/330 PASS** (44 suites), TypeScript/Vite build PASS.
No real test email was sent, nor any approval or external execution.
The source remains LOCAL until the previously denied Git write is
legitimately unblocked. B4 lifecycle/server CAS and actual two-admin
user verification remain **NOT QUALIFIED**.

**Cross-bundle API qualification, October 11:** native
`bash scripts/checks.sh api` **482/482 PASS**, one upstream Starlette
deprecation warning, G12 deliberately RED test temporarily preserved
path-only and restored diff-SHA exact. This is isolated API regression,
not live SMTP, browser/persona E2E, release or CI acceptance.

**P0 competitor-derived reviewed scoped credential creation in mounted Integrations (rev53, October 11):**
The existing actual `Integrations → Credential tools → Create scoped integration
credential` Form previously issued a privileged
`POST /integrations/tokens` **immediately on submit**, without a separate
human review or guaranteed one-shot against rapid duplicate clicks.
It now follows **select enabled integration + exact purpose/scopes
→ read-only Review → separate Confirm → one server-authorized POST**.
The new `web/src/integration_credential_create_review.tsx` snapshots
the exact enabled integration ID/name/kind/tenant/callback origin and
decision verification minimum as a source identity fingerprint,
purpose and exact selected scopes. It rejects missing, disabled,
unrecognized or mismatched presets/scopes, and explicitly warns at
the final confirmation for mixed producer/executor permissions.
No raw API token exists or appears in the review.

Confirm synchronously claims the issuance **before any awaited network
work**; it requires a fresh role-scoped saved-integration GET proving
the reviewed connection's exact enabled/current identity, and still-
selected integration/view context before at most one POST. Successful
UI result requires the server's non-empty token ID/secret and
**exact reviewed scope receipt**. Raw secret is held only ephemerally
in React component memory, displayed once from this verified receipt,
and hidden on user action or leaving Credential tools; it is not logged,
stored in localStorage/sessionStorage or exported through errors.
An acknowledged/ambiguous POST remains latched until an **explicit
successful refresh of the originally attempted integration's saved
connections and credential ID metadata**; a read for another integration
or an automatic read does not release the latch. The raw token cannot
be retrieved from credential history. The backend existing
`grant/auth.py:issue_token` admin/current enabled integration validation,
issued scope restriction and audit remain authoritative; no extra
permission, IAM/approval action or external execution is created.

Test evidence: new `web/tests/unit/integration-credential-create-review.test.ts`
**15 RED→GREEN cases** including scope/tenant/connection drift,
same-render double Confirm, failure before POST, ambiguous write, wrong
integration refresh, server receipt integrity, mixed-scope warning and
ephemeral raw-secret display. Focused Integrations create/revoke source
**36/36 PASS**. Official native Web **502/502 PASS** across **62**
test files, TypeScript/Vite production build PASS. Backend API
482/482 remains **earlier unchanged-backend** qualification only.
This entire change is **LOCAL SOURCE STAGED ONLY**, with no actual token
issued, admin-browser/two-person E2E, changed-HEAD CI, normal Git
commit/push or release acceptance. All previous platform safety denied
actions and the original G12 RED/Inbox stash remain preserved.

**P0 competitor-derived integration credential task-first UI (rev52, October 11):**
The actual mounted `Integrations → Credential tools → Issued credentials`
previously displayed any late `GET /integrations/A/tokens` result even
after a user had chosen integration B. It also mixed active credential
actions and historical revoked entries, and the final credential
revoke button made an unguarded privileged POST. The page now binds
the selected role-scoped integration to monotonic latest-only read
tokens, rejects stale A/B reads and stale errors, and hides a previous
selection's token metadata immediately on changing the selected
connection. Existing server auth and credential list scoping are
unchanged. The worklist shows **Active credentials** first (most
recently issued at top) with scopes, status and opaque token IDs, and
places revoked history in a collapsed read-only section without
revoke affordances. Raw credentials can never be retrieved or
rendered by this list.

A specific enabled credential's **Review revoke → Confirm revoke**
shows the exact selected connection, token ID and scopes, requires
an immediate role-scoped GET verifying the exact reviewed
scope/status/created-at record, and takes a synchronous one-shot claim
before the existing server-authorized POST. Only returned
`{id:the-reviewed-token,enabled:false}` verifies server
acknowledgement. An ambiguous revocation remains latched until an
explicit successfully refreshed token list for that SAME originally
reviewed integration; refreshing a different connection cannot
unlock the previous attempt. The backend alone authorizes actual
credential revocation. Historical external effects and existing
human decisions are never claimed undone. No token was issued,
revoked or exported during synthetic tests.
`web/src/integration_credential_workspace.tsx`, existing mounted
`web/src/integrations.tsx`, and
`web/tests/unit/integration-credential-workspace.test.ts`:
12 RED→GREEN source tests (including racing A/B GETs, stale
errors, exact token review, duplicate Confirm, mismatched server
receipt and integration-specific reconciliation).
Focused Integrations flow 33/33 PASS. Official native Web
**487/487 PASS** (61 suites), TypeScript/Vite production build PASS.
This is still local staged source only; no real-browser/two-user
acceptance and no new permission/effect is implied.

**P0 competitor-derived mounted Integrations task workspace (rev51, October 11):**
The mounted `Integrations` page previously presented configured receivers,
new registration, verification management, raw credential creation and
diagnostics together, resembling an operations wallboard rather than the
accepted list-first configuration workspace. It also sent a real
`POST /integrations/{id}/test` diagnostic webhook directly from
the connection row without separate human review. The page now defaults to
a concise, searchable **Registered connections** table with current
Enabled/Disabled, DataRelay/Stellar kind, tenant, installation-projected
receiver **origin** and decision-verification floor. Technical IDs sit
under disclosure, a disabled connection has no Test action, and creation,
verification/credential management and diagnostics are separate explicit
task tabs. Existing supported flows are retained; the page does not import
Foundation RC3's private Draft or copy competitor code.

Connection creation also now uses an explicit **approval-verification
minimum selection** rather than silently relying on the backend
`EMAIL_PIN` default, then a frozen **Review registered connection →
Confirm create connection** stage. The review displays receiver
*origin*, integration kind, tenant, verification floor and only the
count/presence of configured headers and HMAC signature. It never
renders raw callback URL query strings, sensitive HTTP header values
or signing secrets. Unsupported floors, non-object headers, invalid
or unapproved-looking URL protocols and a missing Stellar tenant
fail pre-submit UI review. The separate final Confirm can start at
most one admin-only `POST /integrations`; an ambiguous write remains
blocked until explicitly refreshed current registration data.
A server receipt must match the reviewed connection name/kind and
verification minimum before the UI can report registration success.
The backend remains authoritative for allowed installation
destinations, account authority, sealed credentials and all
other registration policy. New
`web/src/integration_creation_review.tsx` and
`web/tests/unit/integration-creation-review.test.ts`:
**9 RED→GREEN** scenarios including hidden secret rendering,
explicit assurance choice, frozen content and single ambiguous-write
attempt. New Integrations focused total **31/31 PASS**, official
native Web **475/475 PASS** (60 suites), TypeScript/Vite build PASS.
This is frontend source only; no real integration registration or
external callback was attempted. Foundation private RC3 remains
uninstalled and unqualified.

Connection tests use **Review connection test → exact nonmutating human
confirmation → one server-authorized diagnostic POST**. The review freezes
the registered ID/name/kind/tenant/receiver origin/security minimum,
requires a fresh role-scoped GET with matching metadata immediately before
the POST, and synchronously claims one attempt before the network request.
Potentially committed diagnostics remain latched until explicitly
successfully **Refresh saved connections**, without any auto-retry.
Only an exact `transport_accepted=true`,
`execution_allowed=false` and nonempty server diagnostic event ID can
be acknowledged; this does not prove customer receipt, human decision
or a protected business operation. Backend administrator RBAC, approved
destination, transport pause checks and rate limits remain authoritative;
the client-only freshness GET is NOT an atomic receiver CAS.
`web/src/integration_connection_review.tsx`,
`web/src/integrations.tsx`,
`web/tests/unit/integration-connection-workspace.test.ts`:
12 RED-to-GREEN source cases, including the actual mounted
list-first default, role-scope search, disabled receiver, HTML escaping,
exact test review, changed receiver pre-POST rejection, double-click
and ambiguous POST guard. Focused integrations/verification
**22/22 PASS**, subsequently combined with 9 registration-review
cases to **31/31**. Official native Web **475/475 PASS**
(60 suites), TypeScript/Vite build PASS.
This is SOURCE-ONLY, no external diagnostic webhook was sent by tests;
private Foundation RC3 remains uninstalled pending exact owner
licensing/adoption review, and no user-browser/full E2E is qualified.

**P0 competitor-derived source UI — latest exact-request read protection (rev50, October 11):**
The actual mounted `RequestDetail` component previously treated independent
GET results as immediately displayable even when a faster user switched from
request A to B, initiated a later Refresh for the same request, or performed
a newer collaboration/administrative decision. A stale GET could overwrite
the current request view or reset the *new request's* attempt gate after a
prior request's asynchronous response. It now uses
`web/src/request_detail_read_scope.ts` with route ID and monotonic
generation binding, ignores superseded GET results/errors, validates the
returned exact request identity, and invalidates pending reads on a new
verified server mutation. A previously saved request with an ID different
from the active router ID never renders as an actionable approval task,
even before React runs the next route effect. Decision POST attempts own
their original one-shot guard after navigation, and automatic resend
readback only clears its refresh latch on an **accepted current-request**
read. Initial route loading does not silently skip while an older
`useTask` job is still busy. The existing server decision, collaboration,
routing, execution and notification APIs/RBAC are unchanged.

The mounted `NewRequest` replacement flow also formerly read profile
choices then a cancelled/expired original request asynchronously without
binding both server responses to the current `predecessorId`.
The new `web/src/request_intake_read_scope.ts` binds the full
role-scoped policy + exact eligible predecessor projection to the current
route and ignores stale data/errors, including overlapping same-context
reads. On predecessor change the form clears stale derived policy,
selectors, action and source values; it only fills the original title,
target, parameters and selected policy once the matching predecessor
has been verified as cancelled or an eligible expired requested-change
request. The previous create POST's synchronous one-shot claim is
retained across a context switch, preventing a new POST or navigation
from an old ambiguous attempt. All current server-side policy and
replacement validation remain authoritative.

RED missing source modules then GREEN **10/10** RequestDetail and **8/8**
NewRequest read-scoped regression cases, including crossed A/B response,
out-of-order same-request refresh, mismatched ID, GET failure after
navigation, and newer authoritative activity invalidating stale reads.
Related focused tests **50/50 PASS**. Official native Web
**454/454 PASS** (58 suites), TypeScript/Vite build PASS.
Frontend source and tests only; no actual external request creation,
approval or mail send, no installed browser/two-user qualification.
All rev35–50 changes remain **LOCAL STAGED ONLY** pending earlier
denied Git commit/push; unchanged original G12 RED and Inbox stash
are preserved. P0 Inbox, emailed human PIN route, shared Foundation
Administration/mobile and server policy/template CAS are still NOT DONE.

**P0 competitor-derived UI application — policy approval truth & delegations (rev49, October 11):**
Grant's actual mounted `Approval policies` directory previously displayed
the incidental single `approver_id` on all rows, even policies using a
reusable approval group and quorum/ordered voting. The directory now
explicitly shows the approval **rule**, exact available group name and
required count for `SINGLE`, `ANY_ONE`, `ALL`, `N_OF_M` and `SEQUENTIAL`.
Group-name search operates over the same already role-scoped server
`GET /profiles` data; a disabled/missing group or an invalid quorum is
labelled **unavailable**, never fabricated as a single reviewer.
`web/src/policy_approval_summary.tsx` and policy-list wiring;
`web/tests/unit/policy-approval-workspace.test.ts`: initial RED missing
module → GREEN **9/9**. Existing policy filters **3/3** PASS.

The mounted `Delegations` screen now shows **Active and scheduled**
role-scoped substitute assignments first, with latest-expiring active
windows prioritized and revoked/expired history accessible under
a collapsed `Previous delegations` section. The stage for scheduling or
revoking binds the exact acting user, substitute and time window or
recorded delegation ID; a separate human Confirm has clear read-only
context. A synchronous one-shot claim protects the GET→single POST
path from double clicking; the latest role-scoped directory/delegation
GET must still match the reviewed action before POST. Verified
server receipt is required to claim success, an ambiguous write remains
latched and only an **explicit successful Refresh** re-enables another
review. Server human principal/owner/admin validation, delegation
overlap, expiry and email issuance rules stay authoritative; this
frontend work does not approve or execute a protected action.
`web/src/delegation_review.tsx`, `web/src/delegation_worklist.tsx` and
mounted `web/src/delegations.tsx`;
`web/tests/unit/delegation-review.test.ts` **13/13** and
`web/tests/unit/delegation-worklist.test.ts` **8/8**, initial module
RED→GREEN plus actual mounted list-first RED→GREEN.
Combined **30 new regression cases**, official native Web
**436/436 PASS** (56 files), TypeScript/Vite production build PASS.
No actual delegation creation, revocation, email or external effect was
issued during these synthetic UI tests. All new source stays
**LOCAL STAGED ONLY** until earlier Git effect platform denial is
legitimately resolved. No same-installed-HEAD two-user Browser E2E,
real client policy/template server CAS or release is qualified.

**P0 competitor-derived UI implementation — group review and request detail (rev48, October 11):**
Grant's real `Approvers` editor now supports an explicit **ordered member
list**, Move earlier/later controls and a separate **Review changes →
Confirm save group** step for both creation and edits. Exact members added,
removed and proposed final approval seat order are human-readable before
the one POST. Group member sequence matters for SEQUENTIAL policy plans;
the prior flat checkbox editor did not let administrators correct it.
The final review freezes name, ordered member IDs and authoritative
`updated_at` group revision, invalidates on edits and requires a fresh
role-scoped saved-group GET before an edit POST. The existing serialized
server `expected_updated_at` CAS and admin RBAC remain authoritative.
A synchronous one-shot claim prevents rapid duplicate Confirm POSTs and
ambiguous responses require an **explicit successful Refresh saved groups**
before another attempt. The server-returned group ID, name, exact member
order and advanced revision must match reviewed expectations before
reporting success. No automatic membership permission or approval
is granted by this UI.
New `web/src/approver_group_review.tsx` and
`web/tests/unit/approver-group-review.test.ts`: RED unimplemented module →
GREEN **13/13**, focused groups **22/22 PASS**.

The mounted `RequestDetail` screen now starts with the **request title
and full immutable action kind, target, and business parameters**,
followed by the current role-scoped approval stage/progress/deadline.
Technical request ID, revision, execution validity and actor timestamps
sit under an accessible disclosure, rather than preceding the task.
All existing human Approve/Hold/Deny/Cancel and current seat authority,
delivery, audit and executor-report blocks remain unchanged.
New `web/src/request_detail_overview.tsx`,
`web/tests/unit/request-detail-workspace.test.ts`: RED missing module →
GREEN **6/6**, focused task-details **37/37 PASS**.
The mounted request-detail Back button now returns the current approver
to the server-filtered **My approvals** list, request creator to
**My requests**, and other permitted viewers to **Requests**.
It never offers an approval or external execution right by navigation.
New `web/src/request_task_navigation.tsx`,
`web/tests/unit/request-task-navigation.test.ts`: RED missing module →
GREEN **6/6**, focused context/group **25/25 PASS**.
Combined official native Web **406/406 PASS** (53 files),
TypeScript/Vite production build PASS. No server/backend, protected
Inbox/app/Admin/Foundation or real external SMTP/execution effect changed.
**LOCAL SOURCE ONLY** until previous Git write denial is legitimately
resolved; installed desktop/mobile/keyboard and two-human E2E remain
NOT QUALIFIED.

**P0 competitor-derived UI application — NewRequest and Approver Groups (rev47, October 11):**
The actual mounted `NewRequest` form was a flat all-settings card and
listed enabled but not necessarily ACTIVE policies. Its first task now
guides the requester through **1. choose a current active approval policy;
2. define the exact business action; 3. review before creating**.
The selected policy's immutable operation, approval mode/required
count when known, deadline, execution-grant validity and verification
tier are displayed as server-sourced read-only context, with technical
IDs collapsed. Draft/Testing/Disabled policies are excluded from the
new-request selector AND the pure pre-submit creation review fails
closed for such a policy. The existing fresh role-scoped server policy
check and one-shot create POST remain authoritative and unchanged.
If a create response is ambiguous, a task-oriented **Open My requests**
reconciliation button is displayed instead of another POST.

The actual mounted `Approvers` administration changed from an always-open
list plus group-creation/edit form to a keyboard-friendly
**searchable group directory → explicit Create / Review group → focused
member editor**, with enabled status, exact membership count and last
updated time. Existing exact `expected_updated_at` group update
contract, server RBAC, member account scope and conflict behavior are
unchanged. No automatic approval, IAM provisioning, grant execution or
external mail was added. Both screens are consumer-owned Grant UI, not
Foundation shell/CSS clones and not denied Admin/App/Inbox/core effects.
RED→GREEN: 9 NewRequest cases (2 RED after creating read-only
component), 6 Approver Group cases (all 6 initial RED), focused
NewRequest **39/39 PASS**, Groups **9/9 PASS**, official native
Web **381/381 PASS** across 50 suites, TypeScript/Vite build PASS.
This is **LOCAL STAGED SOURCE ONLY**: no commit/push, actual user
browser/mobile/keyboard E2E or release qualification. Next accepted UX
P0s at protected exact routes remain WAITING until legitimately unblocked.

**Independent B4 Delivery Health race/duplicate protection, October 11 (rev46):**
Mounted Delivery Health previously used React async state alone for the
failed-email resend Confirm and unconditionally accepted results from
overlapping filter/page GET requests. It now invalidates older reads when
the filter or page changes and synchronously claims the exact failed
delivery ID before its existing one server-authorized resend POST.
No same-render duplicate POST may start; an ambiguous/accepted attempt
remains latched until an explicitly successful Refresh, while other
deliveries remain independently reviewable. Post-attempt automatic
readback does not release the latch; server administrator RBAC still
owns resend authority, and delivery acceptance remains distinct from
verified mailbox receipt or business execution.
RED missing helper -> GREEN 8/8 new source regressions in
`web/tests/unit/notification-delivery-attempt.test.ts`;
focused notification suites 31/31; official native Web
**366/366 PASS** (48 test files), TypeScript/Vite build PASS.
No SMTP message or external action was actually executed; the P0
backend policy/template CAS and installed two-admin E2E remain open.
This is local staged source pending earlier denied Git commit/push.

**Independent B5 Audit Explorer / B1 Home truth checkpoint, October 11 (rev45):**
The mounted administrator Audit Explorer previously accepted stale async
search-page or request-chain HTTP results after filters, pagination, or the
selected request changed. It also showed audit record JSON inline in the
list and uncollapsed events in the chain, and silently dropped malformed
date bounds from a filtered query. Read-only UI now uses generation-bound
latest-only search/chain responses, binds chain identity to the exact clicked
request, fails closed on malformed/impossible/reversed date filters before
GET/export, and collapses safe technical metadata while retaining explicit
server event/visible counts and unverified execution wording. The backend
admin authorization, filtering semantics, retention and export limits are
unchanged; no Audit write or external effect.
Separately, Requester Home previously said "execution completed" for
`REPORTED_SUCCEEDED` and "execution failed" for `REPORTED_FAILED` even
though native Grant has not independently verified external effects.
Those are now explicitly **executor reports (not independently verified)**,
including legacy signal spelling, while NOT_STARTED and UNKNOWN remain
separate. Tests: newly added **8** latest-read, **8** evidence/table,
**6** fail-closed date, plus **3** Home assertion cases RED→GREEN; focused
audit/Home tests **41/41 PASS**. Official native Web
**358/358 PASS** (47 suites), TypeScript/Vite build PASS. All rev45 changes
remain local staged pending the prior Git write denial; no browser/two-human
E2E or Control/Stellar effect is implied.

### Competitive UI adoption — source reconciliation and next unblocked action (2026-10-11 rev44)

Existing `docs/GRANT_UI_UX_GAP_MATRIX.md` source scope: six official vendor
documentation targets (Teleport, Jira Service Management, Entra, ServiceNow,
Keycloak, StrongDM), 12 findings, **zero** independently operated vendor UI
sessions/screenshots/DOM captures. Competitor DOCUMENTATION research is
completed; live interactive competitor UI parity **is not verified**.
A static source unit test and an uninstalled implementation are not a
user-accepted Grant UI.

| Accepted UX item | Exact mounted-product evidence | Remaining release blocker |
| --- | --- | --- |
| UX-01A approver queue/deadline | server filtering and task summaries source present; Home action/target source improved rev44 | prior exact Inbox/backend overdue denial; independent human E2E |
| UX-02 email PIN/OTP approval | existing standalone portal/adapter components | actual issued URL human landing unmounted; previous app route denial |
| UX-03 role-true Administration/login | Foundation shared shell consumed, product hub source | member `core.users` and `grant.smtp.test` contradiction evidenced by test; old Admin/shared/browser denial |
| UX-04 policy/notification management | sectioned policy editor and reviewed notification test-send source | server CAS/two-admin lost updates, actual UI and SMTP/mailbox validation |
| UX-05 request decision/evidence | latest local RequestDetail source plus Home task-first row | installed same-HEAD desktop/320/375 keyboard/two-person qualification, real external effects |

**New independent task completed locally (rev44):** The mounted Home
`Decisions awaiting you`, `Your response is needed` and `My submitted
requests` rows now show the role-scoped request's immutable operation and
exact target before drill-down. The prior task title/status/deadline remain,
no action executes from Home, and untrusted context renders escaped.
RED 2/2 (reviewer row context, HTML escaping), additional requester row
RED 1/1; GREEN 3/3, focused Home 16/16, official native Web
**333/333 PASS** in 44 files, TS/Vite production build PASS.
No forbidden `web/src/request_inbox.tsx`, `grant/core.py`,
`web/src/app.tsx` or Administration shared UI edits were attempted.
This work is local staged source, not a passing installed browser test.
The accepted competing-vendor designs still have substantive P0s open.

### B1 — first macro delivery subdivided into four acceptance work chunks

These are **B1 execution checkpoints**, not new top-level bundles and not
permission to bypass an existing platform denial. B1 finishes only when all
four checkpoints are qualified on the same installed candidate.

| B1 checkpoint | Required exit evidence | Observed status |
| --- | --- | --- |
| **B1-A · Requester intake** | New request → immutable policy/action review → one create POST → verified matching server receipt; linked replacement must require fresh eligibility | **LOCAL SOURCE PASS / NOT INSTALLED:** review, fresh-policy check, synchronous one-shot and server-receipt binding; latest staged Web 358/358, Git write denied |
| **B1-B · Approver Inbox and deadline** | Task-first action/target/current seat/deadline; role-true needs/held/overdue filters and truthful backend deadline decision | **WAITING EXACT PLATFORM DENIAL:** `web/src/request_inbox.tsx` and `grant/core.py` prior blocked effects; preserved Inbox RED stash, no reroute |
| **B1-C · Human decision and evidence workspace** | Separate Hold/Approve/Deny/Cancel final confirmation; current seats vs historical votes; collaboration, delivery vs reported external effect and admin routing; no duplicate/ambiguous POST | **LOCAL SOURCE PASS / NOT INSTALLED:** decision, collaboration, routing and evidence tests RED→GREEN, latest integrated Web 358/358; rev35–45 local stage not pushed |
| **B1-D · Installed acceptance** | Same deployed/frozen HEAD used by two independent authorized people/mailboxes in real browser, keyboard and 320/375 mobile; role/error/deadline and audit evidence | **NOT QUALIFIED:** previously denied browser path, no verified two-person installed pass or same-HEAD CI/release |

**B1 stays SOURCE_PARTIAL / WAITING.** Rev34 `3ef8b66` is the last
GitHub-confirmed candidate; rev35–46 are staged local source until the
exact Git-write safety denial is legitimately resolved. Source tests do not
qualify B1-B or B1-D, and no new Work Packet/PR should be created.

**B1 executed source evidence, October 11:** [eae39d2](https://github.com/datarelay-labs/datarelay-grant/commit/eae39d2775386c9c6a8f7d3bcdd14df2d83b8b32)
contains this 6-bundle roadmap plus the Requester NewRequest second GET
policy/predecessor review freshness guard. A concurrent changed policy
version, approval plan, verification policy or linked predecessor rejects
the POST without retry. New RED→GREEN 7 cases, native Web **237/237**,
typecheck/Vite/Static PASS. The next B1 RequestDetail source batch adds
a nearby separate confirmation for admin FAILED/PENDING email/webhook
delivery resend, with request revision/action/hash and delivery-state
review, one current role-visible GET before a single resend POST, and
duplicate-attempt suppression until a successful manual refresh. New
focused RED→GREEN 8 cases and existing 1 UI suppression case,
native Web **247/247 PASS**, TypeScript/Vite/Static PASS. G12 deliberately
dirty RED regression is retained byte-exact; no actual delivery sent,
no live browser or customer credentials used. These checks do **not**
clear the historical exact Inbox source/backend safety denial.

**B1 administrator routing receipt checkpoint, October 11 (rev32):**
The mounted RequestDetail escalation and reassignment review now binds the
exact selected request identity/revision/action, user seat and approved
target. A reassignment POST's successful server-projected RequestRow is
presented immediately, without an unnecessary GET that could fail and
invite duplicate routing. Escalation's separate revision acknowledgement
is followed by at most one read-only status GET; if that optional read fails,
the accepted routing write is explicitly reported and stale control surfaces
are hidden until operator refresh. On uncertain POST outcome, the reviewed
intent is cleared and no automatic retry can occur. The backend's current
revision, administrator authorization and approval-seat membership are
still authoritative; the UI does not grant new routing permissions or
execute the requested business action. Focused regression 9/9, native Web
**256/256 PASS**, TypeScript/Vite build and native Static PASS on scoped
B1 source; actual installed two-human browser/E2E and historically denied
Inbox/backend actions remain **UNQUALIFIED**, so B1 stays SOURCE PARTIAL.

**B1 human decision one-shot checkpoint, October 11 (rev34):**
The mounted RequestDetail human Approve/Hold/Deny/Cancel confirmation now
claims its reviewed actor/request/revision/action before any await or React
rerender, preventing a same-render double submit. A failed/ambiguous POST
remains latched; a successful POST with failed/lagging readback also blocks
another decision until a successful role-scoped request Refresh. A confirmed
POST with a qualified fresh GET permits another explicit review where the
server allows it (for example a Held request). The backend still checks
seats/roles/revisions; no actual external execution or mail was sent.
Focused new tests RED missing helper -> GREEN 6/6; official native Web
**262/262 PASS**, TypeScript/Vite build PASS, Static PASS with G12 RED
path-only preserved/restored SHA-exact. B1 is **SOURCE_PARTIAL**, not
installed two-person browser/mailbox qualification. Inbox/core exact source
platform denials remain untouched; the Inbox RED stash is retained.

**B1 requester creation one-shot checkpoint, October 11 (rev35):**
The mounted NewRequest final Confirm now claims a synchronous one-shot guard
before its existing fresh policy/predecessor read-only GET and immutable
request-create POST. Two clicks in the same React render cannot start two
creates. A failed/changed policy or predecessor read with no POST releases
the claim so the operator can review again; an attempted create POST is
latched even on a lost response, and explicitly requires checking My
requests rather than repeating creation. Only one backend request creation
can be initiated by the reviewed Confirm; creation does not approve or
execute the protected action. Focused RED missing module -> GREEN 6/6,
related focused 29/29, official native Web **268/268 PASS**,
TypeScript/Vite build and Static PASS on scoped B1 source, with G12 RED
preserved byte-exact. Actual installed two-human browser/mobile/keyboard
E2E and protected Inbox/backend overdue truth remain **NOT QUALIFIED**.
No real SMTP, Control/Stellar operation or release authority was exercised.

**B1 current approval-seat evidence truth checkpoint, October 11 (rev36):**
The mounted RequestDetail reviewer evidence had treated a missing role-scoped
approval plan as `Single approver` and labeled `approver_id` as current seat 1,
contradicting the requirement not to fabricate an assigned approval seat.
Read-only UI now uses `Approval plan unavailable` and `Recorded reviewer
vote` unless the server actually projects `approval_plan.members`. A real
projected single or multi-seat plan still labels its exact current seats;
server-authoritative quorum and approval action permissions are unchanged.
New focused RED 1/16 failed, GREEN 16/16 PASS; related focused 45/45 PASS;
official Web **270/270 PASS**, TypeScript/Vite build and Static PASS.
Previous rev35 requester-creation source plus this rev36 evidence change
remain local only because the exact Git commit/push was previously denied by
platform inspection. Do not relabel them remotely committed, change the
canonical #37 body until source lands or retry the blocked write via another
tool/host/branch. G12 RED and Inbox RED stash stay preserved. Installed
two-user/browser/mailbox and blocked Inbox/overdue backend remain unqualified.

**B1 collaboration one-shot submit checkpoint, October 11 (rev37):**
The mounted RequestDetail collaboration confirmation previously kept reviewed
COMMENT/QUESTION/REQUEST_INFO/REQUEST_CHANGES/INFO_RESPONSE content until the
asynchronous POST finished. React busy rendering alone could permit two
same-render Confirm calls. The new guard claims synchronously before the
original server comments POST, verifies that the POST's projected request
matches ID/action fingerprint and is not older than the reviewed revision,
then uses that projection without a second GET. An ambiguous write or
unverified projection stays latched; the explicit `Refresh collaboration`
action performs one role-scoped read of the same immutable request before
another message can be reviewed. This does not approve or execute the
requested action. Focused RED missing module -> GREEN 6/6, related 18/18;
native Web **276/276 PASS**, TypeScript/Vite build PASS, Static required.
Changes are local only alongside staged rev35/36; the prior Git commit/push
platform denial was not retried or bypassed. Retain G12 RED and Inbox stash.
The blocked Inbox/core and same-installed-HEAD human E2E gates remain open.

**B1 receipt and actor/target integrity checkpoint, October 11 (rev38):**
The independently permitted mounted Approval Workspace work now validates
server response evidence at three high-value human-facing boundaries:
requester NewRequest creation must return the reviewed external ID, policy
and version, integration, immutable operation/target/parameters/source,
predecessor and a well-formed new request ID before navigation; a recorded
Approve/Hold/Deny/Cancel POST must return the reviewed request ID, action
hash/kind/target and valid revision before showing success, and a separate
optional GET must retain that same immutable identity; administrator
reassignment must return a matching updated request and actual new seat
membership, and escalation must acknowledge the expected request/revision
before its independent readback is accepted. Failed/ambiguous writes are
never retried. Routing now distinguishes a valid acknowledged write with
unavailable readback from an unverified POST response, and hides stale actions.
RED→GREEN 5 human-decision scenarios, 7 requester-creation scenarios, and
4 administrator-routing scenarios; final official Web **292/292 PASS**,
TypeScript/Vite build PASS, native Static PASS on scoped source. The work
creates no new backend API, permission, explicit approval, or business effect.
The earlier 9 staged B1 files remain preserved, and rev38 changes remain
local pending the prior denied Git write effect. B1 as a whole is still
**SOURCE_PARTIAL / WAITING**: prior platform-denied Inbox/core changes,
actual same-installed-HEAD independent user/browser/mobile/keyboard E2E,
CI and release authority remain unqualified. G12 RED and Inbox stash are
preserved without alternate tool/host/branch safety-gate workarounds.

**B1 exact selected-seat human outcome checkpoint, October 11 (rev39):**
The prior RequestDetail decision POST receipt checked the exact reviewed
request ID/action/revision but could still show `Recorded` for a response
whose actual chosen human vote was absent, attributed to a different approval
seat, or recorded under a different choice/reason. The independently scoped
read-only projection guard now binds the reviewed actual user to the
**represented approval seat** at Review time, including delegated approvers,
and invalidates a review if that seat changes. A successful
Approve/Hold/Deny POST must provide the selected seat's choice and exact
recorded reason; ALL/SEQUENTIAL quorum can remain AWAITING while a seat
has approved. Hold/Deny outcomes must match the projected request state;
Cancel must actually be CANCELLED with no committed execution. POST must
advance the reviewed revision; a later optional GET is only adopted when it
preserves the same actor-seat vote, immutable action and selected outcome.
Absent/mismatched server evidence is not approval and never causes a retry.
9 new regression cases RED 6/9 failed -> GREEN 9/9 plus one delegated
review-binding regression; focused 33/33 and native Web **302/302 PASS**
(42 test files), TypeScript/Vite build PASS. No API, backend RBAC,
notification or external execution path changed. This is LOCAL staged
source, NOT GitHub committed or installed two-human browser qualification;
the historic Git/Inbox/core/browser safety denials remain intact.

**B1 delivery resend synchronous one-shot checkpoint, October 11 (rev40):**
The mounted RequestDetail's admin notification resend confirmation had
used React asynchronous busy/state-only suppression. Two same-render
Confirm calls could issue duplicate role-scoped GETs and resend POSTs
for the same reviewed delivery. A new per-request synchronous
`createDeliveryResendAttemptGuard` claims a delivery ID **before**
the unchanged fresh GET and possible single notification resend POST.
Its attempted-ID latch survives an ambiguous POST/failed GET and is
released only after an explicit successful role-scoped Refresh; a
concurrent read cannot unlock an in-flight submit, and a separate
delivery remains independently reviewable after the first settles.
Existing administrator permission, immutable request/delivery review,
transport-vs-approval/execution separation and backend notification
policy remain unchanged. New RED 7/7 missing guard -> GREEN 7/7;
focused 31/31; official native Web **309/309 PASS** (43 suites),
TypeScript/Vite build PASS. No actual notification was sent or
external protected operation executed. This is local source, not a
committed/installed user browser acceptance; historical exact Git
commit/push, Inbox, core and browser-denied effects stay blocked.

**B1 explicit final decision action context checkpoint, October 11 (rev41):**
The separate RequestDetail action summary showed parameters, but final
Approve/Hold/Deny/Cancel Confirm omitted the full action JSON parameters,
request identity, external reference and immutable action fingerprint.
The mounted `RequestDecisionConfirmation` now displays a frozen snapshot
of request title/ID/external ID, action kind/target/fingerprint, full
action parameters, actual acting user and represented approval seat.
`RequestDecisionReview` requires a new review after parameter, request
title or external ID changes even if a stale matching action hash/revision
is returned. React escapes untrusted parameter values and no direct
Execute action exists in the dialog. New RED 4/4 failure -> GREEN 5/5
new regressions; focused related 31/31 and native Web **314/314 PASS**
(43 test files), TypeScript/Vite build PASS. This is an independent
user-facing B1-C presentation/review guard, not backend authorization
or business execution. Source remains staged locally; Git/Inbox/core/
browser historical platform denials remain unchanged.

**B1 independent webhook-vs-email transport truth checkpoint, October 11 (rev42):**
The backend's role-scoped `delivery_state` is the most recent **webhook**
outbox state, not proof of email delivery. The mounted RequestDetail status
summary previously placed that value under unqualified `Notification transport`,
which could suggest all notifications were delivered while email failed.
The B1-C read-only summary now names the Webhook callback explicitly and
separately displays the server-projected `notification_failure_count`
for FAILED emails. An absent/malformed count is shown as unavailable, not
zero, and even zero failures never asserts mailbox receipt. Neither
approval nor external execution is inferred from transport state.
Three targeted RED->GREEN regressions (webhook success + failed email,
zero failure uncertainty, absent email count); focused 28/28 PASS,
official native Web **317/317 PASS** (43 suites), TypeScript/Vite build
PASS. The existing role-scoped server contract and backend remain
unchanged. This is staged source only; prior Git/Inbox/core/browser
platform denials and real two-human E2E acceptance remain open.

**Execution rule:** Start B1 NOW, implement its independently safe work,
and do not claim B1 complete until the approved Inbox/backend UI and actual
user gate pass. A previously denied exact file/effect stays denied—do not
reroute to another path/tool/host. Continue safe, independently authorized
source tasks within the current bundle; when no runnable work remains,
record B1 WAITING with exact blocker and advance only to a separately
authorized independent bundle. **Owner's latest order supersedes the
unstarted rev29 test-mail task; it remains B4 backlog, not a completed feature.**
M1–M8 below remain the source-of-truth technical work/acceptance crosswalk
under these six delivery units.

---

## P0-UI-1 — OWNER FIRST: implement competitor-informed Grant UI (2026-10-11)

**STATE=IMPLEMENTATION_FIRST / PRIORITY=TOP_P0_UI_PRODUCT_DELIVERY / EXISTING_WP=#67 rev52 (rev53 local source checkpoint).**
**Owner decision:** the competitor documentation and licensed Keycloak REA
analysis have been completed; further survey or optional reverse engineering
must NOT displace real user-facing Grant UI implementation. Reuse the existing
six-vendor Gap Matrix, five-screen design, offline synthetic prototype, and
Keycloak 26.5.7 pinned source analysis. The offline prototype is *not* the
mounted product, and static/component tests are *not* real-user E2E.

**Delivery order** — execute the highest-priority independently authorized
product UI slice, RED→GREEN → native Web/Static (API if backend changed) →
ordinary Git push → exact-source review. A proven platform denial blocks **only**
that exact effect: do not bypass it under another path/tool/worktree. Continue
the next independent UI task rather than returning to broad research.

| Priority | Real screen & acceptance outcome | Ownership / existing WP | Current implementation, next unblocked gate |
| --- | --- | --- | --- |
| **UI-01 · P0** | **My approvals / Inbox**: task-first action kind, exact target and decision deadline, clear Review details, truthful pending vs overdue, role-safe filters and accessible keyboard/mobile worklist | **Grant M1 #67** (existing RED tests) | Four quick views already live in source; new row/detail source edit was platform safety-denied. **Independent requester-side New request Review→Confirm SOURCE COMPLETE at `837e33f`**; approver Inbox remains WAITING. Preserved rev9 RED regression stash `03cf0142b688baa17892e48785ff01803fa81c0e`; source change WAITING, no tool/worktree reroute |
| **UI-02 · P0** | **Emailed human PIN approval**: issued emailed link actually lands on no-login four-digit PIN form, optional policy OTP/fresh TOTP, selected Approve/Hold/Deny and **separate final Confirm**; expired/replayed and revoked links fail closed | **Grant M4 #67/#70–#73** | Decision portal/adapter source exists but **unmounted**; `web/src/app.tsx` previously denied, no alternate entrypoint bypass. Real distinct mailbox/user confirmation is separate M7 |
| **UI-03 · P0** | **Login / sidebar / Administration**: grouped Foundation work/menu, centered first viewport desktop and 320/375, role-true 9 tasks/4 groups, Grant Mail task and keyboard navigation | **Foundation B2 + Grant M2 #57/#75/#67** | Shared pf8.4 installed; member `core.users` / `grant.smtp.test` capability contradictions unresolved. Prior admin/styles/mobile/browser denial remains; shared Foundation owns global layout |
| **UI-04 · P0** | **Policies, approver groups, templates**: task-first list→detail→edit→preview, Draft/Testing/Active state and safe explicit save/409 conflict after another admin changes Deny/MFA/integration/templates | **Grant M3 #38/#64–#66/#80** | Existing lifecycle and templates source already present; two-admin lost update requires server CAS, not cosmetic UI-only conflict. **Independent Clone Review→Confirm Draft, Draft→Testing and failed-email resend review SOURCE COMPLETE (`42180e1`, `cc1061e`, `7034e66`)**; **two-admin server CAS/lost-update remains P0 BLOCKED**. Prior protected backend/Phase1 denial persists |
| **UI-05 · P0 independent / P1 polish** | **Request detail, collaboration, evidence**: immutable action and target first, explicit human decision, accurate current seats vs history, separately *reported* external effect, review-confirm message bound to actor/revision | **Grant M1/M5 #67/#63**, E2E **M7 #54** | **SOURCE PARTIAL COMPLETE:** server-authoritative progress `ecc5110a` / `f2a4e5d`; review/confirm and actor binding `0b267e1` / `d8e136a`; immutable action/stage summary `d9967928`; collapsed unverified external report `ca5a9322`; explicit decision POST receipt fallback on failed/lagging read `53c7169`; exact actor/action/reason-bound decision review `276a49e`; successful collaboration POST projection without secondary GET `9cf423b`. Actual same-installed-HEAD browser/mobile/two-user E2E **NOT PASS**. Do not repeat completed UI-05 source slices merely to restate PASS |

**2026-10-11 completed RequestDetail evidence, source checkpoint
`9cf423b4355e64e2791a071ff8e830154a93dfb8`:** UI-05 has five
incremental *mounted product UI* improvements beyond the earlier stable
quorum/review components; it is not merely an offline prototype. Official
Web regression totals progressed **180/180 → 186/186 → 191/191 → 198/198 →
203/203 PASS**, TypeScript/Vite production build PASS throughout. Official
Static PASS for the new rev15, rev16, rev19 and rev20 source increments;
**rev17 Static** was explicitly platform safety-blocked **before executing**
and has **NOT** been retrospectively relabeled PASS. Independent later rev19
and rev20 Static PASS qualifies those separate newer source states, not the
rev17 historical invocation. The UI now binds human decision review to
actor/request/action/reason and uses the successful server POST receipt to
display updated collaboration without a redundant second GET; neither
path auto-retries a possibly committed POST. Existing G12 deliberately RED
test remains uncommitted and unchanged, and the old UI-01 Inbox RED stash is
retained. UI-01 through UI-04 remain priority blockers at previously denied
source paths or real external/user gates; never reroute them through another
host/tool. No new HEAD CI, installed mobile/keyboard, two-person mailbox
E2E, independent Control/Stellar effect or release acceptance has passed.

**2026-10-11 new requester-side UI delivery (exact Grant source checkpoint
`837e33f4ab7391c5336c2acf7abfce42ff424e50`):** The mounted
`New request` page now requires **Review request → Confirm create request**;
requester previews the configured profile/version, immutable operation and
target, exact JSON parameters, source selectors and predecessor, reason and
external request ID. Every edit invalidates the reviewed payload; successful
confirmation makes one normal API POST, never automatically retries on an
ambiguous result, then navigates to the server-created request. It does **not**
authorize approval or an external effect; only the server resolves active
policy, approver plan and request creation. New unit cases **10/10 PASS**,
native Web **213/213 PASS**, TypeScript/Vite build **PASS** and native Static
**PASS** (G12 RED source temporarily path-stashed then restored SHA-exact).
Git normal push and GitHub independent 3-file commit/ref readback PASS.
This is **SOURCE COMPLETE only** for this requester slice; UI-01 Inbox,
UI-02 email PIN mount, UI-03 Foundation Administration/mobile and UI-04
server CAS remain separately safety/external gated. No installed-browser,
keyboard/mobile, independent real mailbox E2E, CI or release qualification.

**2026-10-11 independent UI-04 policy workflow delivery (latest source
checkpoint `cc1061e6f61987cee960342c03e897e440e90194`):**
Policy list and detail now use **Review clone → Confirm clone draft**
instead of unreviewed one-click Draft creation. The reviewer sees the source
policy ID/version, active version, action/integration and the available
verification/reason settings. A fresh server policy read must match the
reviewed state before **one** existing clone POST; its returned Draft is shown
without a fragile second GET. Any Cancel causes no POST. Source
[`42180e1`](https://github.com/datarelay-labs/datarelay-grant/commit/42180e115523434bbdbb04637fdec3639e39ccd6);
new clone-review scenarios 8/8 PASS, native Web **221/221 PASS**.
Policy **Draft → Testing** now also has an explicit reviewed source-version
confirmation, with cancel and a separate final POST; Testing is not Active
and does not grant execution authority. Existing Activate/Disable confirmations
are preserved. Source
[`cc1061e`](https://github.com/datarelay-labs/datarelay-grant/commit/cc1061e6f61987cee960342c03e897e440e90194);
focused Testing regression RED→GREEN, native Web **223/223 PASS**.
TypeScript/Vite production build and native Static **PASS** on both
incremental source checkpoints with original G12 deliberately RED test
preserved. **These are mounted UI workflow improvements only, NOT a
solution for the outstanding two-admin policy/template last-write-wins
failure**. Server-side atomic CAS remains required; UI checks cannot replace
it. Installed real-user browser/mobile E2E, linked PR/CI and owner release
acceptance remain unqualified.

**2026-10-11 notification Delivery Health confirmation (source checkpoint
`7034e669a6be43b896d5a76dd843c6b653688bde`):**
Only failed email notifications expose **Review resend → Confirm schedule
resend**, with the exact request/event/attempts/failure state and clear
transport-only warning. The review is invalidated by changed visible
delivery state, filters or pagination, and Cancel causes no POST. Confirm
posts only once through the existing endpoint; its acknowledged success is
not mislabeled failure if subsequent Delivery Health GET is unavailable,
and old FAILED list rows are cleared to avoid an accidental duplicate.
No approval, external protected execution, or mailbox receipt is implied.
Commit [`7034e66`](https://github.com/datarelay-labs/datarelay-grant/commit/7034e669a6be43b896d5a76dd843c6b653688bde)
changed only Notifications UI, new confirmation component and test.
New focused **7/7 PASS**, existing delivery health cases **3/3 PASS**;
native Web **230/230 PASS**, TypeScript/Vite production build PASS and native
Static PASS with unchanged G12 RED test restored. UI-04 policy/template
two-admin atomic CAS remains **P0 BLOCKED**, as do exact previously
platform-denied Inbox, email PIN mount and shared Administration paths.
No actual test email was sent, no same-installed-HEAD browser/mobile/two
human mailboxes/Control/Stellar E2E, CI, or release gate is qualified.

**Exit evidence per screen:** exact source + RED/GREEN tests + Web/build/static,
then authorized **installed same-HEAD desktop and 320/375 mobile/keyboard
browser pass, two different authorized real users and two mailboxes** for PIN,
and real external effect readback only under M6/M7. Mark each SOURCE_COMPLETE,
USER_E2E_PASS, or WAITING_BLOCKER independently; do not call screenshots, mocks,
vendor documentation or a successful unit test deployed acceptance. Full source
and user gates precede M8 release authority. No duplicate Work Packets or PRs.

---

## P0-UX-0 — completed competitor research, reused for P0-UI-1

**STATE=REA_STATIC_SOURCE_COMPLETE + INBOX_SAFE_UI_SOURCE_COMPLETE / NEXT_SCREEN_P0=P0-UI-1 / PRIORITY=RESEARCH_ALREADY_COMPLETE / Owner WP #67 (existing packet; UI implementation revision 32).**
This prerequisite is **satisfied by the documented six-vendor screen Gap Matrix,
Keycloak licensed static REA and five-screen blueprint**; further UI delivery
is tracked under P0-UI-1 above. It remains separate from independent safety,
security, real-user M6/M7 and M8 release qualification gates.
Existing completed sources and existing roadmaps/Work Packets remain authoritative.

**Why first:** Grant already implements many approval/policy/audit capabilities
but their browser navigation and task visibility do not yet present a coherent
approver-first product. Avoid more NOC-style or speculative UI construction before
identifying valuable competitor-proven screen patterns and current Grant gaps.

**Reuse rather than restart:** `docs/UX_COMPETITOR_RESEARCH_20261009.md` (14
named products), `docs/COMPETITIVE_GCI_GRANT_20261010.md` (official Jira/
Teleport documented evidence versus actual Grant code), Product Foundation
PF-CI [#99](https://github.com/datarelay-labs/datarelay-product-foundation/issues/99)
and merged [#100](https://github.com/datarelay-labs/datarelay-product-foundation/pull/100)
(licensed REA 6.3.0 source pilot and evidence/provenance tooling). Do not
create another generic browser collector, REA server or competitive framework.

### First research/implementation queue (five screen families)

| Order | Grant screen / functional flow | Initial vendor comparators (documentation first) | Required conclusion |
| --- | --- | --- | --- |
| **UX-01 · P0** | My approvals / Request Inbox, Hold/Deny, pending vs overdue | Teleport, Jira Service Management, Microsoft Entra My Access | Screen-level worklist/detail/action flow, explicit one-seat voting and overdue truthfulness |
| **UX-02 · P0** | Emailed Approve/Hold/Deny → no-login 4-digit PIN → optional OTP/fresh TOTP → separate final Confirm | Jira Service Management, ServiceNow | Actual human entrypoint, states and errors; distinguish existing unmounted code from functioning page |
| **UX-03 · P0** | Login, sidebar hierarchy, System Administration / Grant Mail and Account Security | Keycloak, ServiceNow plus DataRelay Control reference | Shared Foundation component vs Grant extension; real capability/RBAC truth, desktop and 320/375px |
| **UX-04 · P0** | Policy lifecycle, approval groups, MFA rules, notifications and templates | Teleport, StrongDM, Jira Service Management | Admin list→detail→edit→preview progression and stale-editor/concurrent-admin risk |
| **UX-05 · P1** | Request detail, action fingerprint, reviewer history, audit and reported execution | ServiceNow, Microsoft Entra My Access | Progressive evidence, decision vs actual effect, clear pending/failed/unknown status |

Six first-pass references: **Teleport, Jira Service Management, Microsoft Entra
My Access, ServiceNow, Keycloak, StrongDM**. Additional existing 14-product
research is reused only when it resolves a specific unresolved question, rather
than a new exhaustive survey or full proprietary code reverse engineering.

### Ordered execution and required deliverables

1. **Inventory current Grant as-built screens:** compare exact branch/HEAD,
   routes, Foundation AuthLayout/ProductShell/AdministrationHub versions,
   role/capability filters, selected screens, source/backend/API, actual
   mounted vs standalone UI, existing tests and installed build identity.
2. **Collect grounded competitive screen evidence:** official public help,
   UI images/videos and legitimately accessible read-only UI where independently
   authorized. Record vendor product/edition/version/role/date/source URL,
   real screenshot digest ONLY when actually captured. Published documentation
   is `DOCUMENTED`, never mislabeled `OBSERVED UI`.
3. **Build one Grant-owned screen/feature Gap Matrix** (new bounded
   `docs/GRANT_UI_UX_GAP_MATRIX.md` or existing competitive evidence record):
   screen/task, reference, exact evidence class + URL, Grant source path/HEAD,
   `SOURCE_PRESENT | PRESENT_BUT_UNMOUNTED | UX_DEFECT | CONFIRMED_GAP |
   UNKNOWN | DEFER`, usability impact, priority, dependency, acceptance
   scenario, and **Foundation shared vs Grant-owned** implementation route.
   Absence of a screenshot/document reference never proves a feature absent.
4. **Selective REA deep analysis only if it answers a real gap:** use existing
   PF-CI static workflows on first-party or independently licensed/authorized
   open-source/local JS/Electron/native code, pinned exact version, source SHA
   and license; inspect component/state/API architecture, not copy implementation
   or private algorithms. No unauthorized proprietary application reverse
   engineering, login bypass, network/credential capture or rerouting previously
   platform-denied Playwright/Grant browser actions. **REA execution itself is
   optional and cannot block the screen Gap Matrix.**
5. **Turn findings into owned, tested improvements:** deduplicate against M1
   completed UX code; rank the first 3–5 meaningful screen changes by user
   value and implementation readiness; map shared Auth/Menu/Admin work to
   Foundation and actual Grant behavior to existing M2/M3/M4 Work Packets;
   preserve current routes, RBAC and approval/execution separation. Finish
   with affected Web unit/TypeScript/build/static and permitted browser UI
   checks, then exact-installed-HEAD direct Full User E2E under M7; none of
   these gates may be inferred from research or source tests.

**UX-0 research acceptance COMPLETED at integrated baseline `5fe81068e2669fe6c5369064009a3e1f6035f2ea`:** evidence-backed `docs/GRANT_UI_UX_GAP_MATRIX.md` compares the five screen families / six first-pass vendors, backed by validated `docs/GRANT_UI_UX_COMPETITOR_STUDY_20261010.json` (12 findings, existing PF-CI research CLI `COMPETITIVE_MATRIX_PASS`, 0 actually operated competitor screens). It ranks five nonduplicative implementation/verification actions with Foundation vs Grant owners and native/Web/direct-user tests; unknown and out-of-scope items remain explicitly labeled. **This completes competitive source/document research, NOT product UI implementation.**
The next discretionary screen work follows the ranked, independently authorized M2–M4 P0 actions; existing platform-denied source paths and actual human/Control/Stellar/CI gates remain unresolved. Safety-blocked
`web/src/app.tsx`, Administration/styles/mobile/real browser, broad
`grant/core.py`, G12 builder and previously denied platform effects remain
blocked independently, regardless of vendor/REA tool. E2E, CI and release
readiness are NEVER established by this research.

### 2026-10-10 REA-guided screen design and first safe UI implementation

**New source deliverables, existing #67 rev8:** `docs/UX_REA_KEYCLOAK_20261010.md`, `docs/UX_SCREEN_DESIGN_GRANT_20261010.md`, and standalone offline `docs/ux-prototypes/grant-approval-workspace.html` (five clickable synthetic design views). Actual genuine **REA 6.3.0 static** analysis of **Keycloak Admin UI 26.5.7**, pinned upstream `97c2dad98597b17efae79006be47a51c6f5a72e9` licensed Apache-2.0, 17 TSX files / 0 parse failures, 375/529 application graph, 3657/3284 semantic graph, **1262 unknowns**, zero integrity contradictions; raw 14.8MB evidence and source stay private outside Grant Git. This confirms **licensed static UI source analysis only**, not a competitor browser screenshot, human usability finding, authentication permission guarantee or copied implementation. Existing PF-CI tooling reused, no new decompiler/crawler.

**Actual safe Grant product Web source implementation:** `web/src/request_inbox.tsx` plus `web/tests/unit/request-queue-disclosure.test.ts` implements four accessible quick task views (needs/held/delegated/recent) with server-scoped `view` request filtering, clearing stale hidden filters and pagination to zero; no direct approval or effect side effect. RED 2 failures before source, GREEN 8/8 targeted, **official Web 162/162 PASS + typecheck/Vite build PASS + Static PASS** on the scoped source candidate. Existing known-overdue backend gap is **not** mislabeled as fixed, and no new Overdue shortcut is promoted. All prior platform-denied Grant `web/src/app.tsx`, Administration/styles/mobile/browser, `grant/core.py`, G12 builder or M5 #82 rev7 write remain blocked and untouched.

**Pending separate real gates:** Review the concrete five-screen blueprint with owner as a design; independent same-installed-HEAD browser/mobile and real users not performed; email human PIN route still unmounted; overdue/role-permission/two-admin concurrency and external Control/Stellar/CI/release not qualified. Source-only updates do not mark these as DONE.

## Product outcome and hard invariants

Grant is a reusable **human-approval control layer**, not a workflow canvas,
ITSM clone, SOAR, arbitrary executor, tenant-wide IAM product or billing SaaS.
A business user requests an exact bounded action, an authorized reviewer
explicitly approves/holds/denies under current policy, and only the ORIGINAL
integrated product may separately consume a valid action-bound execution grant,
apply at most one durable effect and independently report/reconcile its result.
No request creation, email GET/HEAD, link preview, delivery receipt or approval
alone may execute anything. One approval seat counts once. Replayed intents,
expired links, removed recipients, stale policy revisions and revoked credentials
fail closed. In-email 4-digit PIN proves mailbox possession, **not named-person
identity**; a same-mailbox extra OTP is not independent MFA.

Default G10A behavior: no Grant login needed for ordinary EMAIL_PIN; per
request/recipient/decision opaque high-entropy answer URL + 4-digit code in
same email + bounded PIN POST + separately explicit final confirmation POST.
Optional policy-specific OTP and fresh TOTP/MFA require their full current
server-side proof. Existing original/delegate seat competition, Hold,
Deny-reason and seven-day-or-less bounded link TTL remain authoritative.

## Frozen observed baseline (for the roadmap reset)

| Evidence item | As verified on 2026-10-10 |
| --- | --- |
| Implementation repo | datarelay-labs/datarelay-grant |
| Current integration branch | feat/grant-g10a-g0-integrated-candidate |
| Last pre-reset HEAD | 9333b8f164c90d304c018358a09bf0479ad54407 |
| Working host | dev-atlas |
| Working directories | **24 registered Grant Git worktrees**; all 24 had **0 tracked, staged and untracked changes** at inventory time |
| Foundation | 10 exact pinned local `0.1.0-pf8.4` packages, source 8726549f80f85b79d94e91a87324d2523e27ddbb; no extra package reimplementation |
| Local component/regression baseline | API **419/419 PASS**, Web **156/156 PASS**, TypeScript/build/static PASS on prior exact HEAD |
| GitHub integrated-head CI | No associated PR-triggered Actions runs. **NOT CI PASS** |
| Older unmerged stack | PR #34, #39, #41, #43, #45, #47, #49, #51; Draft PR #53, #55, #56, #59, separately preserved |
| Owner preview, live external system | Different or unavailable installed HEAD, **NOT user/external acceptance** |

The 24-tree inventory showed no remaining uncommitted source backlog. A
separately committed/pushed but unmerged branch or Draft PR is still integration
work, **not** uncommitted content. Do not reset, clean, cherry-pick blindly,
force-push, close or merge another owner's branch/packet. Earlier worktree
dirty-file warnings are historical; always inspect current evidence again.

## Only active executable program — eight coherent major bundles

Relative size is for planning/scheduling, **not elapsed-time or staffing promise**.
Finish the next runnable P0 subset, test on one candidate, record the evidence,
then immediately move to another safe item. Never run previously completed
source tests solely to re-report green history.

| Bundle / rough size | Primary original roadmap & Foundation / CI mapping | Existing verified implementation (preserve) | Remaining completion work / gate |
| --- | --- | --- | --- |
| **M1 · P0 / L — baseline reconciliation + approval workbench truthfulness** | G0, G5/G6, G9; G-CI-1; WPs **#67, #75, #42, #48, #81** | G0 task-oriented Home/Queues, backend user-scoped request filters, G3–G6 plans and delegation, audit timeline; all 24 trees inventoried; official-vendor source comparison | **Previously completed M1 source batch:** replace the single canonical roadmap/Issue #37, classify Jira/Teleport official claims and actual Grant source, fix UTC request-created date/filter drift and surface CURRENT reviewer-seat votes distinctly from chronological audit; focused Web/static. No new approval group/workflow engine. Actual same-HEAD user QA remains separate M7. |
| **M2 · P0 / XL — shared Foundation Login/Sidebar/Administration** | G0, B2, G-CI-2 role/first-run surface; WPs **#57, #60, #67, #75** | Foundation pf8.4 ten packs, shared AuthLayout/ProductShell/AdministrationHub, nested task navigation, Account & Security | **2 proven member ADMIN_CAPABILITY_CONTRADICTION** findings (core.users, grant.smtp.test); complete Control-reference centered login/no white border, keyboard & truthful 9-task/4-group Admin, Grant Mail extension and mobile 320/375 visual parity. Earlier Grant app/styles/Administration source, screenshot, PR and credential/browser **platform-denied** actions remain blocked. No workaround. |
| **M3 · P0 / XL — policy + groups + notification operations** | G1–G4, G2, B4, G-CI-2; WPs **#38, #40, #64, #65, #66, #77, #80, #83–#86** | Versioned Draft→Testing→Active→Disabled, clone/history, single/any/all/quorum/sequential, original/delegate/hold, template sets/preview/branding, filtered delivery queues, recovery-paused direct-send safety | Fix **actual** two-admin lost-update/race for Deny/MFA/integration verification floor, stale template editors, safe registered recipient selection and real SMTP/health guidance where authorized; no fake SMTP credential editor or unapproved live test sends. Prior broad Phase1 write safety refusal still binding. |
| **M4 · P0 / XL — authenticated identity and G10A real email decisions** | G10/G10A, B3, G-CI-3; WPs **#50, #58, #67, #70–#73, #78, #90** | Account session/TOTP/recovery, signed scoped email answer intents, 4-digit PIN, optional OTP/fresh TOTP, expiry/replay/audit/seat safeguards, unmounted portal+HTTP adapter | Mount allowed no-login decision Web route (not prior blocked app.tsx by workaround); verify current-policy anti-downgrade, current recipient/delegate and named-identity attribution; REAL two-mailbox receipt/PIN/MFA explicit decision. No new credential/role boundary without approval. |
| **M5 · P0/P1 / L — operations, audit and protected recovery** | G7–G9, B4/B5; WPs **#44, #46, #48, #76–#83, #97, #99** | Exceptions, diagnostics, bounded redacted audit export, v2 draft-only config import, private SQLite backup/PAUSED restore, v8→v12 real-old-schema migration regression, unpublished candidate hashes, four direct diagnostic-send pause guards | Approve/qualify actual disposable installation backup→restore→rollback, offline origin/signature/provenance checks and native operational guidance. No customer DB, secret migration, unsanctioned restore, irreversible mutation or fake signed/GA artifact. |
| **M6 · P0 / XL — real DataRelay Control and Stellar receiver** | G8/G11, B6, G-CI-4; WPs **#52, #74, #90–#94, #98**; separate Control **#422/PR #420** | Grant pure integration/route/destination/tenant/case/alert/revision guards; isolated Control loopback prototype only | Owner-authorized non-bypassable Guard at Control's **existing** replay send boundary; durable Control effect count exactly 1, independent native ledger/destination readback; actual deployed Stellar version, authorized tenant/case/alert receiver and callback readback, feedback-loop exclusion. No Grant-helper-only M3/M4 PASS. |
| **M7 · P0 / XL — independently operated real Full User E2E** | G0–G12 user acceptance, B2/B3/B4/B6, G-CI-4; WP **#54**, with product WPs above | Prior synthetic Playwright desktop 28/28 and fixture tests; no direct-user acceptance | Read full contracts **before** acting as separate real Admin, Requester, Approver (+ unrelated person); first complete Surface Reconciliation → fix all findings → NEW two-person browser/inbox PIN/OTP/MFA request/hold/deny/reissue/recovery/real-result passes **on one installed HEAD**, twice as required. Cannot substitute scripts, fake credentials, mail echo or previous HEAD. Preserve prior real-password/mobile/platform stops. |
| **M8 · P0 / L — frozen source qualification and authorized release** | G12, B6 machine/release, G-CI-5 scope control; WP **#54**, existing PR chain/review | G12 unpublished package verifier, tests and exact local hashes | Only AFTER M1–M7 gates: freeze HEAD, actual required CI/PR reviews, Foundation Actions private Contents:read owner permission, native machine provenance/hash/SBOM/public smoke as the release contract requires, separate owner acceptance, then independent release/tag/publication authorization. No automatic merge, tag or deploy. |

### Priority & dependency rule

**P0-UI-1 IMPLEMENTATION is FIRST for new M1–M4 screen delivery:**
the grounded competitive Gap Matrix, licensed Keycloak REA and existing design
were already produced under completed P0-UX-0. Execute real screens in the
UI-01→UI-05 priority above, selecting the next independently safe UI task when
a specific P0 source path is platform-denied. Do not repeat past research or
finished M1 approval-workbench/G9 audit code. **This is a UI
sequencing priority, not authority to postpone independent P0 security/
reliability fixes, current-user E2E defect remediation, or external M6/M7
release prerequisites.**

After UX-0, run authorized M2/M3/M4 UI slices by user-value ranking and native
contracts; M5 recovery/security may proceed separately if authorized. M6/M7
require real owner-authorized external accounts/product effects. M8 is LAST.
Where blocked, preserve the exact previously denied target/tool/effect; never
reroute under another Work Packet, tool, branch or host. G-CI-2 has **P0 UX
evidence priority**, while generic cosmetic polish remains P1. G-CI-5 REA
remains an optional P2 *analysis technique* usable only on separately
authorized/licensed targets; REA must not block the matrix or bypass denied
browser/source operations.

## Canonical backlog crosswalk — all pre-reset themes accounted for

| Former workstream / product baseline | New owner bundle |
| --- | --- |
| G0: Foundation Auth, Sidebar, task Home, Admin; G-CI-1–2 | M1 for safe workbench & evidence; M2 for shared UI/mobile/roles |
| G1: policy lifecycle, versions and concurrency | M3 |
| G2: notification templates, preview, SMTP/delivery | M3 plus recovery M5 |
| G3: approval groups/multi-seat/quorum | M3; identity guard M4 |
| G4: delegation, reassignment, escalation | M3; E2E M7 |
| G5: comments, changes requested, replacement | M1 existing, actual-user test M7 |
| G6: approver inbox and requester workspace | M1, user tests M7 |
| G7: real operations dashboard | M5 |
| G8: integration admin and real connected systems | M5 for diagnostics, M6 for execution |
| G9: audit, export, v2 Draft portability and recovery | M1 visible history, M5 native operations |
| G10: MFA, session, authority and security | M4 |
| G10A: no-login PIN/OTP/MFA/decision and exact action | M4, real user gate M7 |
| G11: DataRelay source execution + Stellar receiver | M6 |
| G12: full two-user E2E, CI/freeze/release | M7 + M8 |
| PF-B2/B3/B4/B5/B6 | M2/M4/M3+M5/M5/M6+M7+M8 respectively |
| G-CI-1/2/3/4/5 | **P0-UI-1 actual UI implementation FIRST; P0-UX-0 research DONE**; M1 previous source evidence retained; P1 cosmetic polish later; M4 invariants, M6/M7 actual tests; REA P2 optional licensed analysis |

### Existing Work Packets / PRs are not deleted

- **Current canonical implementation** #67 (M1), #75 (G0), #83 (B4/B5)
  and verified source WPs #95–#99; #99 has historical issue-header
  status drift despite source commit/test completion. Do not repeat completed
  source or a previously blocked exact GitHub update to "fix" that marker.
- **Policy, Inbox and operations lineage** #38, #40, #42, #44, #46, #48,
  #50, #57, #58, #60–#86. Their old branch HEADs are evidence, not newer
  current-product capability. Retain stacked PR #34, #39, #41, #43, #45,
  #47, #49, #51 and Draft PR #53, #55, #56, #59 until ordinary independent
  review/owner merger scope. NO blind old-stack main merge.
- **G11/G12 waiting** #52 (Control/Stellar real effect), #54 (direct
  user/release), #90–#94 and #98 (pure guards only), Control #422/PR #420
  isolated test pilot only; never treat them as GA approval.
- New feature work must use an appropriate existing scoped packet and
  immutable preflight; **no duplicate AI Work Packet** is authorized merely
  by this roadmap rewrite.

## Reproducible gates and external owner actions

**Source level (S)** — proper Work Packet/context, minimal approved changes,
RED→GREEN unit, native affected official API/Web/Static, normal Git commit
and non-force push, exact HEAD and CI/review readback. Track P0 bugs here.

**True user level (U)** — installed same candidate, actual browser and two
distinct authorized human/mailbox personas, complete G0–G12 scenarios read in
full, direct operated interactions, remediation and fresh two-pass confirmation.

**External level (E)** — one real safe Control product effect with independently
observed destination/no duplicate; deployed Stellar receiver tenant/case alert
readback; actual inbox receipt (SMTP accepted alone is insufficient).

**Release level (R)** — U + E complete, frozen HEAD, required exact-head CI,
hash/provenance/SBOM per actual release contract, owner acceptance then separate
publication authority. Only this may be called 1.0 release-ready.

Owner/operator inputs needed for U/E/R: approve a disposable environment with
two separately accessible real mailboxes, authorized Requester/Approver/Admin
accounts, a nonproduction Control native send destination, the installed
Stellar receiver contract/version if available, narrow private Foundation
GitHub Actions read credential by the owner and owner-run release acceptance.
No ChatGPT assumption of credentials or real system permissions; no
platform-denied action by an alternate tool.

## Exit tracking convention

Use exactly one line per macro on roadmap #37 with
`STATE=IMPLEMENTING|WAITING_BLOCKER|SOURCE_COMPLETE|USER_E2E_PASS|ACCEPTED`,
last exact SHA, owned Work Packet, evidence paths, and meaningful external
blockers. **SOURCE_COMPLETE never means Full User E2E or GA.**
Report in Korean using: 로드맵 / 이번 작업 / 블로커 / 사용자 조치 /
다음 작업. Do not stop after a bounded source packet while another safe
authorized P0 next action exists.
