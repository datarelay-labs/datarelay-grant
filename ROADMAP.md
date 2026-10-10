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
**Competitive evidence:** docs/COMPETITIVE_GCI_GRANT_20261010.md (Jira /
Teleport official documents classified separately from observed UI).

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
| **M1 · P0 / L — baseline reconciliation + approval workbench truthfulness** | G0, G5/G6, G9; G-CI-1; WPs **#67, #75, #42, #48, #81** | G0 task-oriented Home/Queues, backend user-scoped request filters, G3–G6 plans and delegation, audit timeline; all 24 trees inventoried; official-vendor source comparison | **First runnable batch now:** replace the single canonical roadmap/Issue #37, classify Jira/Teleport official claims and actual Grant source, fix UTC request-created date/filter drift and surface CURRENT reviewer-seat votes distinctly from chronological audit; focused Web/static. No new approval group/workflow engine. Actual same-HEAD user QA remains separate M7. |
| **M2 · P0 / XL — shared Foundation Login/Sidebar/Administration** | G0, B2, G-CI-2 role/first-run surface; WPs **#57, #60, #67, #75** | Foundation pf8.4 ten packs, shared AuthLayout/ProductShell/AdministrationHub, nested task navigation, Account & Security | **2 proven member ADMIN_CAPABILITY_CONTRADICTION** findings (core.users, grant.smtp.test); complete Control-reference centered login/no white border, keyboard & truthful 9-task/4-group Admin, Grant Mail extension and mobile 320/375 visual parity. Earlier Grant app/styles/Administration source, screenshot, PR and credential/browser **platform-denied** actions remain blocked. No workaround. |
| **M3 · P0 / XL — policy + groups + notification operations** | G1–G4, G2, B4, G-CI-2; WPs **#38, #40, #64, #65, #66, #77, #80, #83–#86** | Versioned Draft→Testing→Active→Disabled, clone/history, single/any/all/quorum/sequential, original/delegate/hold, template sets/preview/branding, filtered delivery queues, recovery-paused direct-send safety | Fix **actual** two-admin lost-update/race for Deny/MFA/integration verification floor, stale template editors, safe registered recipient selection and real SMTP/health guidance where authorized; no fake SMTP credential editor or unapproved live test sends. Prior broad Phase1 write safety refusal still binding. |
| **M4 · P0 / XL — authenticated identity and G10A real email decisions** | G10/G10A, B3, G-CI-3; WPs **#50, #58, #67, #70–#73, #78, #90** | Account session/TOTP/recovery, signed scoped email answer intents, 4-digit PIN, optional OTP/fresh TOTP, expiry/replay/audit/seat safeguards, unmounted portal+HTTP adapter | Mount allowed no-login decision Web route (not prior blocked app.tsx by workaround); verify current-policy anti-downgrade, current recipient/delegate and named-identity attribution; REAL two-mailbox receipt/PIN/MFA explicit decision. No new credential/role boundary without approval. |
| **M5 · P0/P1 / L — operations, audit and protected recovery** | G7–G9, B4/B5; WPs **#44, #46, #48, #76–#83, #97, #99** | Exceptions, diagnostics, bounded redacted audit export, v2 draft-only config import, private SQLite backup/PAUSED restore, v8→v12 real-old-schema migration regression, unpublished candidate hashes, four direct diagnostic-send pause guards | Approve/qualify actual disposable installation backup→restore→rollback, offline origin/signature/provenance checks and native operational guidance. No customer DB, secret migration, unsanctioned restore, irreversible mutation or fake signed/GA artifact. |
| **M6 · P0 / XL — real DataRelay Control and Stellar receiver** | G8/G11, B6, G-CI-4; WPs **#52, #74, #90–#94, #98**; separate Control **#422/PR #420** | Grant pure integration/route/destination/tenant/case/alert/revision guards; isolated Control loopback prototype only | Owner-authorized non-bypassable Guard at Control's **existing** replay send boundary; durable Control effect count exactly 1, independent native ledger/destination readback; actual deployed Stellar version, authorized tenant/case/alert receiver and callback readback, feedback-loop exclusion. No Grant-helper-only M3/M4 PASS. |
| **M7 · P0 / XL — independently operated real Full User E2E** | G0–G12 user acceptance, B2/B3/B4/B6, G-CI-4; WP **#54**, with product WPs above | Prior synthetic Playwright desktop 28/28 and fixture tests; no direct-user acceptance | Read full contracts **before** acting as separate real Admin, Requester, Approver (+ unrelated person); first complete Surface Reconciliation → fix all findings → NEW two-person browser/inbox PIN/OTP/MFA request/hold/deny/reissue/recovery/real-result passes **on one installed HEAD**, twice as required. Cannot substitute scripts, fake credentials, mail echo or previous HEAD. Preserve prior real-password/mobile/platform stops. |
| **M8 · P0 / L — frozen source qualification and authorized release** | G12, B6 machine/release, G-CI-5 scope control; WP **#54**, existing PR chain/review | G12 unpublished package verifier, tests and exact local hashes | Only AFTER M1–M7 gates: freeze HEAD, actual required CI/PR reviews, Foundation Actions private Contents:read owner permission, native machine provenance/hash/SBOM/public smoke as the release contract requires, separate owner acceptance, then independent release/tag/publication authorization. No automatic merge, tag or deploy. |

### Priority & dependency rule

M1 is the **first runnable group** on the already integrated candidate.
After M1 implementation, continue M2/M3/M4 P0 that is independently permitted;
M5 may proceed in parallel on independently protected worktrees. M6/M7 require
real owner-authorized external accounts and product effects. M8 is LAST.
Where a group is blocked, record the exact denied tool/target/error in its
existing packet, keep other independently runnable groups moving, and never
relabel a protected write under another packet, tool, branch or host.
Vendor-inspired **G-CI-2 P1 polish waits for P0**; optional **G-CI-5 P2 REA**
never delays Grant 1.0 or circumvents earlier browser collector safety stops.

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
| G-CI-1/2/3/4/5 | M1 evidence; P1 M2/M3 polish; M4 invariants; M6/M7 tests; optional post-1.0 research |

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
