# DataRelay Grant 1.0 — unified execution roadmap

**Owner replacement decision:** 2026-10-10. **One current roadmap, eight major
execution bundles.** This file supersedes all former sequencing prose in
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
| **B1 — Approval Workspace (FIRST)** | Requester New request → read-only review → one server create; approver Inbox task/action/deadline → explicit Hold/Approve/Deny/Cancel; current assigned seats, delivery vs reported effect, comment/linked replacement, truthful deadline. **M1 + M5 approval UI** | **#67** and existing M1 packets; exact mounted-source RED→GREEN + official Web/Static, then two independent authorized people and desktop/keyboard/mobile scenario same installed HEAD in B6 | **IN PROGRESS, SOURCE PARTIAL:** Requester New request Review→Confirm and RequestDetail/reviewer confirmation/evidence shipped, Web 230/230 at source checkpoint. **IMPLEMENTED THIS BATCH:** read-only fresh policy/predecessor verification before one request-create POST, and RequestDetail admin email/webhook resend Review→Confirm with exact current delivery and suppressed accidental repeats (source Web **237/237 → 247/247 PASS**, Static PASS). **Additional source:** RequestDetail reviewed admin escalation/reassignment routing no longer misreports successful POST when optional GET fails; reassign directly uses server-projected RequestRow, escalation refresh has a separate failure indicator and stale actions are hidden. New Web **256/256 PASS**, TypeScript/Vite/Static PASS. **BLOCKED:** Inbox exact prior denied source, M1 backend overdue truth and installed same-HEAD human E2E, so B1 is NOT finished |
| **B2 — Email approval (no-login human decision)** | Issued link actually lands on PIN entry, optional OTP/fresh TOTP, selected human action and separate final confirmation, expiry/replay/auditable recipient attribution. **M4** | **#67/#70–#73/#78**; exact issued-link GET non-mutating and two unrelated real mailboxes/personas twice, policy verification-floor checks | **WAITING EXACT SAFETY GATE:** portal/adapter exists but actual issued URL/API landing is not mounted; earlier app.tsx route mutation blocked; no alternative-route workaround |
| **B3 — Shared Identity & Administration** | Foundation shared Login/Sidebar/Administration parity with Control, grouped navigation, member/admin capability truth, desktop + 320/375 first viewport, accessible keyboard. **M2** | **#57/#75/#67**, shared Foundation B2; role-true task actions and two-account same-version interactive review | **WAITING EXACT SAFETY GATE:** previous app/Admin/styles/mobile/browser edits blocked; shared Foundation remains owner, not Grant-specific CSS duplication |
| **B4 — Policies, approver groups & Notifications** | Policy lifecycle, groups, safe edit/conflict/CAS, full template sets, preview, branding and delivery worklist/send confirmation. **M3** | **#38/#64–#66/#80/#67**; two independent admin sessions must demonstrate atomic 409 stale-save without losing Deny/MFA/template changes, native non-sending previews, authorized test delivery only | **SOURCE PARTIAL:** policy Clone→Draft and Draft→Testing confirmation and failed-delivery resend review done; **P0 BLOCKED:** server policy/template CAS. Rev29 separate test-email-preview task was scoped but **not started** and is deferred here, with no real SMTP sent |
| **B5 — Evidence, recovery & native external effects** | Bounded/redacted audit, exception diagnostics, private backup/restore/migrations/provenance, native DataRelay Control exactly-once and separately verified Stellar callback, not synthetic grant-only effects. **M5 + M6** | **#48/#97/#99/#52/#74/#90–#94**; verified native durable effect/readback, disposable recovery, owner-approved external destinations | **PARTIAL / EXTERNAL WAITING:** existing source and isolated checks are not actual native Control/Stellar or restore acceptance; preserve G12 intentionally RED candidate integrity test |
| **B6 — Real user qualification and authorized release** | On one frozen installed HEAD, two complete independently operated real-browser+two-mailbox passes, keyboard/mobile, CI/PR/provenance/public smoke, owner signoff only after B1–B5. **M7 + M8** | **#54** and existing release WPs; same HEAD two-person E2E PASS → freeze → native required CI/hash/provenance/smoke → explicit owner acceptance | **WAITING DEPENDENCIES:** no same-HEAD real-user/mailbox/browser, Control/Stellar effect, PR CI or release authority confirmed; do not infer PASS from source tests |

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

**STATE=IMPLEMENTATION_FIRST / PRIORITY=TOP_P0_UI_PRODUCT_DELIVERY / EXISTING_WP=#67 rev32.**
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
