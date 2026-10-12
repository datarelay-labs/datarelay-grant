# Grant UI research — owner P0-1 before P0-2 (2026-10-11)

## Source adoption reconciliation (2026-10-12)

The first-party competitor analysis and licensed static Keycloak REA are
finished. This is a **scope/implementation ledger**, not a claim that
every feature offered by those vendors was cloned or that two independent
real-user mailboxes completed E2E.

| Selected reference/pattern | Grant source status | Still missing or deliberately excluded |
| --- | --- | --- |
| Entra/ServiceNow Inbox selected-item review | P0-2A mounted and source-qualified | Real user acceptance on same installed HEAD |
| Windmill/ServiceNow progressive Request Detail Activity | P0-2C mounted and source-qualified | Independent user keyboard/mobile E2E |
| Teleport reviewer deadline / StrongDM requested vs approved grant | P0-2D/E read-only, authority-bound mounted UI | Native verified external execution; vendor IAM entitlement features excluded |
| Keycloak role/group administration | P0-2F group facets and saved-account coverage; B4 server policy/template CAS; B3 two known Foundation member-capability contradictions corrected at source | Real two-admin/browser acceptance and any separately approved future Foundation consumer integration |
| Windmill minimal issued-email PIN Review→Confirm | P0-2B source and backend HTML/JSON routing committed; original test formatting I001 corrected with owner authorization | Two distinct actual human recipients / genuine independent mailboxes and HTTPS/SMTP installation acceptance |

### P0-2G additional mounted policy list usability (2026-10-12)

**Observed source gap:** The already-selected Keycloak Group Administration
list and ServiceNow task-first row/detail pattern were source-adopted for Grant,
but its **Approval policies** table still required reading seven horizontally
scrollable columns at 320/375px. An actual installed-browser inspection at
320px observed a seven-column table extending far beyond the viewport within
its internal scrolling container. This is a compact-screen workflow usability
gap, not a data leak or authority failure.

**Selected safe adaptation:** Mount a narrow-screen policy card view of the
**same backend-authorized, search/lifecycle-filtered policy list**, keeping
policy name, Draft/Testing/Active/Disabled state, version/security summary,
action and integration scope, approval group/rule, notification template,
updated timestamp, and explicit Open/Review clone. The desktop seven-column
table remains unchanged and mobile CSS hides the inactive desktop view from
tab navigation. No policy GET/POST, backend access, version/CAS, approval,
mailbox or external execution change. The design is independently authored
from first-party published screen patterns; no competitor source/assets copied
and no Foundation unpublished RC installed.

**Test-first acceptance:** On mounted Grant at 320 and 375, the original
Chromium browser test was RED because the mobile policy list did not exist.
After adopting the card rendering, the same native browser test passed on
both narrow widths, keyboard Enter opened the exact saved policy, the page
had no document overflow and the 1280px table remained visible. Full native
Web 666/666, TypeScript/Vite passed on the modified source. Separate
two-independent-human, external mailboxes, native Control/Stellar, and
PR/CI/owner release acceptance remain outside this source-only result.

The unresolved **UI/functionality** backlog is limited to independently
evidenced Grant gaps in the B1–B6 roadmap. StrongDM workflow priority and
enterprise access lifecycle require real Grant product projections and separate
selection; they are not implicitly implemented just because the vendor has
them. Teleport long-lived role elevation, Jira ticket designer, StrongDM
auto-approval and Windmill workflow execution engine remain explicitly
out of scope, not source failures. No proprietary UI code/pixels copied.


Research is from official vendor-published screens and workflows, not
authenticated vendor sessions or proprietary code. No vendor UI account
or binary was used. Published imagery does not prove current edition parity.

| Official screen evidence | Observable layout and task flow | Grant selected action |
| --- | --- | --- |
| [Microsoft Entra My Access Approvals](https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-request-approve), official `my-access-approve-request.png` | Pending list on left; click row to reveal right-hand request details/history, due date and final Approve/Deny reason and Submit. | **P0-2A:** read-only selected-request context next to existing Grant Inbox; final vote stays on Request Detail Review→Confirm. |
| [Teleport 18.x Access Review](https://goteleport.com/docs/identity-governance/access-lists/reviewing-access-requests/), official `alice-review-request-*.png` | Pending status, expiry, requested target table, timeline, distinct final Submit Review. | Show exact action/target, deadline, human decision separately from externally reported execution; no role-elevation clone. |
| [ServiceNow Employee Center My To-dos](https://www.servicenow.com/docs/r/employee-service-management/employee-experience-foundation/ec-to-dos-use.html) | Open/Completed task list and adjacent selected task **Details/Activity**, overdue indicator. | P0-2A selected context; read-only snapshot, no extra wide-scope API. |
| [Jira Service Management approval](https://support.atlassian.com/jira-service-management-cloud/docs/approve-or-decline-a-request-from-the-new-issue-view/) | Work item → This requires your approval → Approve/Decline panel. | Existing Request Detail review flow retained; no generic ticket builder. |
| [StrongDM Enterprise Access Workflows](https://docs.strongdm.com/admin/access/access-workflows) | Admin workflow list→detail; Requests→All Requests→View details shows history, reason, requested resource. | Existing policy/group workspaces; server two-admin CAS remains separately required. |
| [Windmill Suspend/Approval](https://www.windmill.dev/docs/flows/flow_approval) | Minimal approval page shows request, who/when, description, form and Approve/Reject; Detailed adds run metadata/graph. | **P0-2B:** minimal human email PIN portal with true Grant OTP/MFA policy, without auto execution. |
| [Keycloak 26.5.7 pinned OSS Admin UI](https://github.com/keycloak/keycloak/tree/97c2dad98597b17efae79006be47a51c6f5a72e9/js/apps/admin-ui) | Route- and permission-aware groups, user/group lists, confirmation UI. | Existing Foundation shell reused; member capability contradictions remain gated. |

## REA execution and licensing decision

**Actual REA pilot was already performed** on 2026-10-10:
`rea-agents@6.3.0 analyze-javascript-application`, Apache-2.0 Keycloak
Admin UI tag `26.5.7` commit `97c2dad98597b17efae79006be47a51c6f5a72e9`,
17/17 pinned TSX files, artifact hash
`492acfe5465a282a620cf89ef0b4bd849a33582f5e450c8190e9dd9d30ce0aef`.
Full real evidence/limitations: `docs/UX_REA_KEYCLOAK_20261010.md`.
The same pinned v6.3.0 package exists on dev-atlas. This run reused
the actual prior evidence; it did **not** run REA again. On 2026-10-11,
a **read-only actual REA doctor call** against the cached v6.3.0 binary
returned exit 1 / `healthy=false`: Ubuntu 24.04 and Node 24.21 passed,
but no configured Ghidra and no Hopper native analysis engine were
available. This does **not** invalidate the prior static TSX analysis;
no native analyzer was installed or auto-configured. REA doctor is
a tool-health probe, not new screen evidence. Entra pane layout
is already evident from its vendor-published screenshot, so unrelated
Keycloak binary/static analysis would not improve that decision.
For a later unresolved licensed target, **run REA read-only when material**
and record exact artifact, license, tool/provider and evidence; do not
decompile private enterprise UI without authorization. No competitor
source/screenshots were copied into Grant.

## P0-2 adoption disposition

- **Selected and implemented in this slice:** Entra + ServiceNow
  selected-task context as a role-scoped Grant Inbox read-only preview,
  bound to the exact current query and loaded request ID, immutable
  action/target and review-versus-reported-execution truth.
- **Next P0:** Windmill-like concise emailed human PIN landing, preserving
  Grant one-use issued link, server policy verification, OTP/MFA and
  explicit final Confirm; still requires separate boundary/E2E verification.
- **Gated:** Foundation role-aware Admin mapping and real 320px view;
  policy/template security two-admin atomic CAS, current-head CI.
- **Already implemented:** task-first queues, full detail and human
  Confirm, group/policy/notification/credential review, audit worklist.
- **Declined/deferred:** Teleport role elevation, Jira ticket designer,
  StrongDM automatic approval, Windmill workflow execution engine,
  Entra entitlement management; not the accepted Grant 1.0 scope.

This analysis represents official-screen evidence, not live vendor
operation or release acceptance; no proprietary copy or unauthorized
privilege/execution effect was introduced.

## 2026-10-11 owner P0-1 second pass — screen-first, fresh licensed REA

**Evidence classification:** First-party, vendor-PUBLISHED screenshot and documented
role/task flow only; **0 authenticated live competitor accounts/sessions**, 0
proprietary binaries inspected. The screenshot can represent a specific
version/edition, not current entitlement or runtime parity.

| Competitor / evidenced screen, user role | Exact visual anatomy / navigation observed in first-party material | Reusable Grant gap (no copied source/pixels) |
| --- | --- | --- |
| [Windmill, minimal approval screenshot](https://www.windmill.dev/assets/images/approval_page_minimal-57a5958de0cdbdfc0555ccbe2f137b86.webp) and [suspend/approval docs](https://www.windmill.dev/docs/flows/flow_approval), flow-recipient, docs observed Oct 2026 (version not pinned for hosted page) | One compact request title → requester/time → description/form → explicit Approve/Reject; Detailed skin exposes run graph/inputs/history instead. Secret resume URL has Windmill-specific execution semantics. | **P0-2C** use a minimalist, decision-first Grant request screen with progressive disclosure for audit/transport. Keep separate server-reviewed human Confirm and Grant policy, never copy URL-resume execution. **P0-2B** issued-email PIN landing remains a separate security-gated requirement. |
| [ServiceNow My To-dos (Australia release, 2026-03-12)](https://www.servicenow.com/docs/r/employee-service-management/employee-experience-foundation/ec-to-dos-use.html), employee/task approver | Open/Completed left list, selected task context to the right; **Details vs Activity** provides progressive secondary material. | P0-2A selected Inbox pane already shipped; **P0-2C** fold secondary audit/transport under an explicit keyboard-operable Activity disclosure in mounted Request Detail, while the decision form stays plainly visible. |
| [Microsoft Entra My Access Approvals screenshot](https://learn.microsoft.com/en-us/entra/id-governance/media/entitlement-management-request-approve/my-access-approve-request.png), approver, illustrative Woodgrove UI | Pending row → right Details/Request history pane → Approve/Deny, required reason, Submit. | **Already shipped P0-2A:** exact role-scoped Inbox selected preview; final Grant Review→Confirm requires full detail. No second preview. |
| [Teleport 18.x reviewer screenshot](https://goteleport.com/docs/assets/images/alice-review-resource-request-0f9bc389a3aeb264aae1e561368fee09.png) and [guide](https://goteleport.com/docs/identity-governance/access-lists/reviewing-access-requests/), bob requester/alice access-list reviewer, **Enterprise-only** | Pending banner/expiry → requested resource/role table and timeline → reviewer controls and explicit review submit. | Grant target kind/name/deadline is already visible; keep requested target distinct from later externally confirmed execution. Do not adopt long-lived access grants. |
| [Jira Service Management Cloud request approval](https://support.atlassian.com/jira-service-management-cloud/docs/approve-or-decline-a-request-from-the-new-issue-view/), named approver, hosted version | Work item detail → 'This requires your approval' contextual approval panel → explicit Approve/Decline. | Review control stays near immutable request identity; no generic ticket form or code redistribution. |
| [StrongDM Enterprise Access Workflows](https://docs.strongdm.com/admin/access/access-workflows), admin/approver, Enterprise edition | Workflow priority/status table → edit configuration; Requests → All Requests → Actions → View details exposes resources, reason, approved vs requested duration and history. | Policy ordering and requested/approved/effected duration are potential future read-only diagnostics, but require authoritative Grant API projections and two-admin CAS before mutation. |
| [Keycloak 26.5.7 Apache-2.0 Groups/Users](https://github.com/keycloak/keycloak/tree/97c2dad98597b17efae79006be47a51c6f5a72e9/js/apps/admin-ui), realm admin, pinned source + publicly documented group UI | Group hierarchy, Member selection and per-user access-gated Add/Remove actions; role-scoped tabs, selectable groups with disabled states. | No IAM implementation reuse; make current Grant approver-group member authority/audit truthful (existing rev70 covers account projection, not real two-person E2E). |

### Fresh REA v6.3.0 run (different source from the 2026-10-10 pilot)

- **Pinned licensed target:** existing immutable Keycloak 26.5.7 Git checkout at
  upstream commit `97c2dad98597b17efae79006be47a51c6f5a72e9`; root
  **Apache-2.0 LICENSE.txt SHA256**
  `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`.
  This is the code whose copyright permission was verified, not a claim
  of license to proprietary Windmill/Teleport or to reproduce UX artwork.
- **New scope:** seven **different** TSX files: `user/UserGroups.tsx`,
  `user/UserRoleMapping.tsx`, `user/UserSessions.tsx`,
  `components/group/GroupPickerDialog.tsx`,
  `components/group/GroupPath.tsx`, `groups/GroupsSection.tsx`,
  `user/user-credentials/ResetCredentialDialog.tsx` plus package manifest.
- **Exact command:** cached `rea-agents@6.3.0`
  `node scripts/rea.mjs analyze-javascript-application <PRIVATE_PINNED_INPUT> --json`,
  in an isolated unprivileged Linux user/mount/network/PID namespace,
  read-only input copies and no login/browser/native engine. Original
  scripts `Hopper`/`Ghidra` **not needed** for this source-only analyzer.
- **Private evidence:**
  `/home/aella/.local/state/datarelay-grant-ux-research/20261011-keycloak-groups-new/`;
  per-file manifest, source artifact SHA256
  `8ba255b264a3a923d204efb6984f23de4fa7f41850c78b4a9d54e66a03ce7d4e`,
  output SHA256 `3793c980becae917477edab791660f1f69cb1e86724e7f7581ce0d2cb69512af`,
  evidence ID `ev_4256718726bd7fdfab94035b7879707e0c51e9384ca8c2c8e82e91b10a27db92`.
- **Actual REA output:** 7/7 TSX parsed, 0 failures, 4,809 AST nodes,
  application graph 179 nodes / 231 edges; semantic graph 2,335 nodes /
  2,194 relations with **837 unresolved** and 0 integrity contradictions.
  This is **static** partial evidence only; does not verify actual UI runtime
  or role permissions. Direct source crosscheck: `UserGroups.tsx` disables
  Add/Remove by `manageGroupMembership`; `GroupPickerDialog.tsx` limits
  empty selection and provides group-scoped selection controls.
- **Windmill license boundary:** The upstream [LICENSE](https://github.com/windmill-labs/windmill/blob/main/LICENSE)
  states `frontend/` is AGPLv3 **except proprietary license-gated code**;
  distributed Community Edition also includes commercial restrictions.
  Vendor-published UI was viewed; **no Windmill source was reused or
  incorporated into proprietary Grant**. Static Keycloak Apache evidence
  answered the bounded group-selection permission question instead.

### Ranked Grant-useful changes / P0-1 acceptance decision

| Rank | Vendor-screen → mounted Grant gap | Selection / exact target | Benefit and RED→GREEN acceptance |
| --- | --- | --- | --- |
| **1 — implement now** | Windmill Minimal + ServiceNow Activity: Request Detail still gives 3 separate audit/transport cards at the same visual level as the human decision. | **P0-2C accepted:** `web/src/request_evidence.tsx`, fold only subordinate history/delivery/audit, leave full request action and human Review→Confirm always reachable. | Decision-first focus; native `<details>/<summary>` keyboard operation, all existing evidence survives and resends are role-only. SSR/unit and browser disclosure interaction; Web/Static PASS. |
| **2 — separate auth gate** | Windmill Minimal emailed decision: actual issued Grant `/api/v1/decision-intents/<opaque>` still lacks complete mounted PIN landing. | **P0-2B accepted, NOT DONE:** existing rev72 unstaged API + RED Web test preserved; `web/src/email_decision_landing.tsx` plus route requires verified current security authority. | No mutation on GET, no action before 4-digit PIN + server OTP/MFA and final Confirm; two independent human mailboxes and replay tests. Never bypass a denied route. |
| **3 — existing, no repeat** | Entra selected pane and Keycloak group membership: partial snapshot clarity. | P0-2A Inbox preview and rev70 Approver Groups truth **already implemented**; no rework. | Verify already shipped exact role scope, missing account state and explicit refresh in qualified installed user tests. |
| **4 — deferred** | Teleport/StrongDM requested vs granted access, precise target scope and timeframe. | Request Detail API/projected validity and future role-scoped activity view; no fabricated granted state. | No UI claim of actual execution from mere human approval or transport; test API truth first. |
| **5 — gated** | StrongDM workflow priority, Keycloak permission-gated membership edit. | Product-owned Policy/Groups UI, backend two-admin CAS and shared Foundation capability truth. | Real concurrent 409 stale-save + member admin/approver parity; no cosmetic bypass. |

**P0-1 exit:** five ranked dispositions and exact test targets above. The first
mounted P0-2C UI slice is independently scoped; it does not touch the
unfinished B2 public emailed capability page, unreconciled governance
floor or G12 intentionally RED source.

### P0-2C mounted implementation and qualification (2026-10-11)

- **Actual product source:** `RequestDetail` already renders `RequestEvidence`
  in `web/src/requests.tsx`; this change wraps its existing three cards in
  a native `<details>` named **Activity & supporting evidence** via
  `web/src/request_evidence.tsx`. The request action, exact server-projected
  deadline and explicit Approve/Hold/Deny/Cancel Review→Confirm remain above
  this disclosure and fully accessible. Admin-only notification resend is
  retained inside the evidence (with original Review→Confirm gates).
- **Truth/scope:** Counts come solely from the exact already fetched,
  role-scoped `RequestRow`; an omitted array is **unavailable**, not
  interpreted as zero. No additional GET/POST, broader role, execution or
  credential access introduced; existing nested audit details remain intact.
- **Test-first:** three new focused tests genuinely RED 3/3, then GREEN
  focused `19/19`. `bash scripts/checks.sh web` **635/635 PASS across
  76 files**, TypeScript and Vite build PASS. Native isolated Chromium
  focused keyboard Enter/Space + decision visibility **1/1 PASS**, then
  **all discovered native Chromium browser scenarios 38/38 PASS**
  over 5 independently seeded 8+8+8+8+6 fixture batches. This is not
  two independently operated humans/two genuine mailboxes or vendor login.
- **Static/diff:** official Ruff scope includes an owner's preserved,
  deliberately unfinished untracked test
  `tests/test_g10a_email_human_landing.py` whose import formatting is
  already nonconforming. Native Ruff with that one untouched file excluded
  **PASS**, exact changed-file `git diff --check` **PASS**; the full
  `bash scripts/checks.sh static` cannot be claimed PASS while that test
  and the deliberately RED G12 EOF whitespace remain unmodified.
- **Guarded original REDs:** `grant/domain_routes.py` diff SHA256
  `92446619249a0cb3e79a7785de23be033d16ff6dfa3791ea42f68f2ddbd1cc6e`;
  untracked API test SHA256
  `4192cac275de144ddb0e0351cacd944e66e5283e669c68509c2cf9131f8c6e2c`;
  untracked Web RED test SHA256
  `e1831c6f6d42c595a81261b08adc3cfcfe7bbad82e3a42bf894848ec71e28755`
  (temporarily isolated only for native Web, byte-identically restored),
  protected G12 diff SHA256
  `cd7252633d96b424aa4e8f24ae08a8660f9663828b5fdffc0285ce9a73e68d4f`;
  Inbox stash object `03cf0142b688baa17892e48785ff01803fa81c0e`
  remains present. No current CI/merge/release, native Control/Stellar or
  human mailbox acceptance is inferred.

### P0-2D selected: Teleport-style reviewer deadline parity (read-only)

- **Source:** Teleport 18.x [reviewer expiry and access review screenshot](https://goteleport.com/docs/identity-governance/access-lists/reviewing-access-requests/)
  demonstrates a deadline with the pending task; this is a documented
  vendor-published journey, not a live vendor UI session or cloned design.
- **Observed Grant gap:** the shipped Inbox correctly shows the role-scoped
  server `overdue` flag, expired-without-decision and approved-grant expiry
  distinctions, but Request Detail displayed only a date under "Approval
  deadline". Moving from Inbox to Detail therefore hid the reviewer's
  already available urgency/historical outcome evidence.
- **Accepted safe source scope:** reuse **exact** existing
  `InboxDeadlineTruth` in `RequestDetailOverview`, preserving original
  server response and `State` semantics. No client clock-based overdue,
  new API/GET, mutable route, new approval/execute action, permission
  elevation or copied proprietary UI. The same configured policy deadline
  applies across the queue and detail.
- **RED→GREEN:** focused RequestDetail component tests prove a pending
  server-flagged escalation, expired previous approval (not overdue), and
  unavailable timestamp fail-closed. Browser visits the **real mounted
  RequestDetail** with a role-scoped logged-in fixture user and confirms
  current deadline anatomy while original human Review→Confirm remains.
- **Separate gates:** issued email PIN Web auth boundary B2, backend
  overdue state correctness and real two-human E2E are not replaced or
  silently completed by this read-only UI parity.

### P0-2E implemented: bounded grant scope without claiming execution

**Selected original rank 4 (read-only subset):** Teleport reviewer target/expiry
and StrongDM [Access Workflow Requests details](https://docs.strongdm.com/admin/access/access-workflows)
show the business value of distinguishing what was asked from what is
actually approved and when it can be used. These are vendor-published
screen/task observations (no authenticated vendor account, no source copy).
The remaining enterprise access policy editor/role elevation is **not** in scope.

**Actual Grant gap:** `RequestDetailOverview` already showed the requested
immutable operation/target and technical `grant_until` in a collapsed metadata
bucket, but offered no clear, separate explanation of the currently
server-recorded approved grant and its time boundary. That made an approved
request easy to mistake for completed external execution.

**Product-owned safe implementation:** `web/src/request_grant_scope.tsx`
read-only section is mounted in the **real Request Detail**, immediately
following the three separate state columns. It reuses the single existing
role-scoped `RequestRow` (no new GET, POST, storage, credential or role
boundary). `APPROVED` plus matching decision `APPROVED` shows immutable
action kind/target and **server-recorded** `grant_until`. A missing/invalid
end returns **validity unavailable**, never an invented date. Server state
`EXPIRED` with previous decision `APPROVED` is a **historical expired grant**,
not an overdue human approval or re-execution permission. Denied/held/
cancelled/pending states show **no current execution grant**, even if stale
`grant_until` is present. No browser clock is used to claim grant validity,
no UI may authorize/execute or verify an external effect, and final consumer
API revalidates validity and action fingerprint at execution commitment.
The original raw technical metadata/approved-grant deadline is now displayed
in this dedicated purpose-bound area rather than buried in technical fields.

**RED→GREEN and safety:** seven missing-component cases were first RED,
then all focused related unit cases passed; actual isolated Chromium uses
different disposable requester/approver browser contexts, reviews the
pending state before final Confirm and checks the approved bounded
server state and 375px viewport after the real UI approval. No synthetic
state override and no production/real-mailbox credential. Missing original
rev72 emailed PIN landing remains deliberately RED and untouched; this
separate read-only UI does **not** remove the required owner authorization
for public email-link auth-boundary changes.

### P0-2F source adoption — Keycloak-style group directory facets

**Ranking:** The original ranked #5 Keycloak Admin UI 26.5.7 user/group
list and permission-filtered membership pattern is independently useful as
a **read-only admin directory facet** before any gated backend group CAS or
Foundation role-authority work. P0-1 source evidence is the existing pinned,
Apache-2.0 `rea-agents@6.3.0` seven-file AST analysis of
`UserGroups.tsx`, `GroupPickerDialog.tsx` and `GroupsSection.tsx`; no
additional REA run and no upstream source or UI artwork was copied. This
is a product-owned design choice, not a claim of Keycloak live login.

**Observed mounted Grant gap:** `Administration → Approver groups` already
showed the saved group name, Enabled/Disabled, member count and current
account truth (`rev70`). Operators still had to scan every row to find
incomplete/missing/disabled member accounts or groups with unknown account
projection, with no status facet independent from group name search.

**Actual, narrow implementation:** Add a native accessible **Filter saved
groups** select in `ApproverGroupDirectory` with All, Enabled, Disabled,
Member account review required, Account status unverified. Filtering is
purely over the **already-loaded, current administrator-scoped group and
account GET** and combines with the original name search; results remain
sorted and show x of y saved groups. It reuses the existing
`assessSavedGroupAccountCoverage` with its intentional distinctions:
known unavailable/duplicate/empty member IDs → attention; missing account
projection → unverified (not a guessed zero); disabled saved group →
disabled, never silently reactivated or counted as available. A malformed
member set keeps its attention classification even when account GET is
unavailable. Loading/error states still do not invent an empty directory
or verified member seats. State is per currently mounted admin UI and no
policy, stored membership, server request, approval, credential or role
was changed. Native select remains keyboard-operable on mobile.

**Acceptance:** seven RED-first focused facets, existing source-truth and
list-to-detail tests; installed disposable Chromium administrator actually
creates a test-only saved group through **Review → Confirm**, selects each
facet and combines a name search without a new POST/PUT, and must still
explicitly refresh the saved group to re-enable the review action. This
is fixture UI verification, not real two-human or mailbox/E2E. Public
emailed-PIN capability routing **P0-2B remains the higher-priority owner-
security-gated task**, not silently approved by this independent UI slice.

### P0-2B issued-email public PIN page — owner-approved mounted UI, gated backend publication

**Owner authorization:** Explicitly approved the public-email decision link
authentication/approval routing change on 2026-10-12. The formerly platform-
denied exact `web/src/app.tsx` operation was legitimately retried using the
same dev-atlas Remote Desktop Commander tool, and **allowed** in this session.
No alternate-host/tool workaround was used.

**Actual source, large bundle 1:** The **identical issued URL** at
`/api/v1/decision-intents/<opaque>` now has a dedicated branch in the real
`App` before private session/bootstrap, loading the minimal
`PublicEmailDecisionLanding`. It rejects malformed/extra path/fragment/query
tokens, renders no private details or capability value, and makes a
**read-only JSON preflight only after mount** to load the server-chosen
Approve/Hold/Deny outcome/assurance. It reuses the existing
`EmailDecisionPortal`, `email_decision_adapter` and
`email_decision_flow`. A recipient must deliberately enter the exact four-
digit PIN, independently request/verify OTP when required, or submit a fresh
TOTP against an authenticated **exact eligible** recipient session, and
separately review and Confirm. A request GET, email scanner visit, unsupported
route, initial render and malformed token never auto-approve, auto-send OTP,
log in, grant execution or reveal the action target before PIN. PIN and
same-mailbox OTP prove mailbox access only, never an independently
authenticated human. The final consumer remains the external effect authority.

**Security and bundle 2:** Existing backend nonce/seat/action/policy/expiry,
Origin, single-use, replay, rate-limit and session-fresh-MFA checks remain
authoritative and unchanged. The public client bypasses the private App
session loader intentionally; therefore MFA POST now explicitly validates the
current authenticated same-origin session and captures its server CSRF **only
after the human submits fresh MFA**, while the backend separately enforces the
recipient identity. Wrong/absent session cannot POST MFA; the client also
checks that the returned verified person matches the authenticated user.
PIN/OTP do not trigger a session GET. A separate SSR test guards inert
initial render.

**Actual browser evidence:** Two independent disposable Chromium browser
journeys, each using **actual sealed outgoing email delivered through the
installed loopback SMTP worker**, parse its MIME quoted-printable wrapping
(no constructed/fake capability token). Browser A: original Approve URL,
JSON/HEAD inert preflight, PIN, verified request scope, request still pending
before separate Confirm, then server-approved with execution `NOT_STARTED`,
and link replay rejected. Browser B: a separate, unambiguous OTP-specific
test-only policy/action and email Deny link, PIN, explicit same-mailbox OTP
request/delivery/verification, mandatory denial reason and Confirm, server
DENIED with execution `NOT_STARTED`, 320px viewport. The fixture policy has
a distinct `test.otp.operation` action to preserve backend
`POLICY_MATCH_CONFLICT` fail-closed semantics rather than weakening the
matcher. These are real installed disposable UI/backend/mail journeys,
**not** two independently operated real humans/two real mailboxes,
production SMTP or live external execution.

**Original owner-protected backend source:** The already-uncommitted
`grant/domain_routes.py` content-negotiation patch is preserved byte-exact
with original diff SHA256
`92446619249a0cb3e79a7785de23be033d16ff6dfa3791ea42f68f2ddbd1cc6e`.
It is required to serve `text/html` for the original emailed URL while
retaining `application/json` preflight, inert HEAD, global no-store,
no-referrer and CSP response headers. Its original untracked backend tests
remain unmodified. **Do not claim a clean, remote-checkout-installed full
P0-2B** while the protected server patch remains outside Git: the committed
frontend alone cannot change the remote server's JSON-only GET handler.
Publish the existing exact backend patch only under the distinct preserved-
source Work Packet constraint; do not silently stage, overwrite, restore or
replace it. Retain the deliberately RED G12 patch, original inbox stash and
all original protected file hashes.

**Remaining gates:** independent actual human/mailbox identities, native
Control/Stellar effects, CI governance-floor migration/provenance and owner
release approval remain separate. OTP is NOT independent MFA; fresh MFA
browser/manual acceptance against the exact recipient is separate from the
automated adapter/backend assurance checks.
