# Grant PF106: Control-source AppShell consumer port (2026-10-19)

## Latest source correction: consumer search parity

The initial package `68aba7c4afba34b66822022cb418e35872077c4c`
recorded below is historical. An isolated Grant browser regression showed
two missing RC50 discovery controls, not a new authorization or API requirement.

The updated private Foundation [Draft PR #107](https://github.com/datarelay-labs/datarelay-product-foundation/pull/107)
uses exact **`acbdc50b34d2e2e819823ed1a9c7016572ab901f`**.
The opt-in `ControlConsumerAppShellLayout.quickNavigation` adds role-filtered
search, keyboard Ctrl/Command+K and Escape. The opt-in
`ControlConsumerAdministrationHubPage.searchable` adds an authorized
"Find administration tasks" filter. The native Control application,
backend/session code and immutable original 104-module source remain untouched.

| Private handoff identity | Exact SHA256 |
| --- | --- |
| Unpublished offline source archive | `849bf53bbbfc410c1d75c69e1b81a4bb1e8158f38c6be9dbd89ca587b5056b3c` |
| Control-clone npm package | `6b19121bac3caff798e76aafd2ccffa8bf306529d5e26aec346e966b3847f3bc` |
| Native original Grant identity Wheel (unchanged) | `cfff22d3d24efb9bb7d6f5701515ac4616cb82029c62245494ae84bd1df81969` |

**Exact-source evidence:** Foundation Control-clone 37/37 PASS, original Control
Chromium→API→SQLite 6/6 PASS, Control presentation source parity and private
handoff PASS. Grant pinned offline npm, Vite/TypeScript build,
Web 768/768 PASS, and Python handoff/negative checks 12/12 PASS.
The fresh isolated U8.05 Administration search browser case PASS.
A separate signed-in, fixture-only 320px Chromium case for role-filtered mobile
quick navigation, focus, Escape and the native My approvals route PASS (1/1).
Foundation Engineering System exact-head CI #39182629052 SUCCESS.
An earlier non-isolated B1 attempt returned PROFILE_NOT_FOUND (404) while
creating its fixture request, before testing the mobile UI. Fresh disposable
standalone and combined U8.05/B1 Chromium sessions with unique fixture files
both showed B1 PASS. The original 404 was not reproduced; fixture collision
is a hypothesis, not an established product defect. The first full unsharded
browser run exhausted the disposable fixture's native login rate limit;
its cascading failures are not proof of a product login defect. Native rate
limits were not weakened. A separate manual API-diagnostic command was
platform safety-denied and was not bypassed. Independent full installed
user acceptance remains open.

This addendum supersedes the source/package hashes and test counts in the
historical stage-one record below. No private archives or credentials are
included in the public Git repository.

## Initial AppShell stage (historical)

## Implementation and authority

The source-only, unmerged Grant PR #102 now opts into the **new private Foundation
ControlConsumerAppShellLayout** for the signed-in workspace. The shared Foundation
source was extended on PR #107, exact Git HEAD
`68aba7c4afba34b66822022cb418e35872077c4c`.
The pinned original Control AppShell frame, visual palette, original native Control
source/provenance and brand assets remain upstream-owned. Its Control-native
Sidebar/TopHeader/router retain Control-specific routes and are **not** mounted in
Grant: the new Foundation-owned *consumer* navigation/header adapters supply
Grant's actual routes, actor, actions and permission projection while retaining
the Control AppShell layout, mobile overlay, theme and skip-link. Pixel-for-pixel
end-user visual equivalence is **not** claimed.

Only signed-in Grant's existing native `/auth/session` principal and
`productConfig` navigation/capabilities drive the adapter. The public email
decision URL, Grant session/CSRF/TOTP/recovery, domain pages and Grant backend
authorization stay in their original sources. There is no Control HTTP call,
Control session token, hidden feature unlock or synthetic host permission. The
existing Grant Navigation blocker, history and request-editor behavior remain
product-owned. Native Grant `/security` is available to any authenticated Grant
account; admin menu entries require the appropriate existing capability and
Grant admin role. Missing or unavailable capabilities do not display a menu
button. The backend still independently rejects unauthorized routes/actions.

No real privileged operations are invented: no Control native Settings, Streams,
Connectors, Governance, Network/NIC/TLS/ACL/Role/Sessions administrative
mutations, retention, restore, global health assertion, arbitrary callback,
or missing operational alert. The shell displays runtime/environment status
only when the consuming service provides verified values; Grant passes neither.
The native Control AppShell default and Administration Hub from PF106 stage one
continue to work unmodified.

## Exact source and offline private artifact pin

| Evidence | Pinned value |
| --- | --- |
| Foundation private source PR #107 | `68aba7c4afba34b66822022cb418e35872077c4c` |
| Upstream Control snapshot (unchanged) | `fc89dadcb01a262ef7881a6bca94dd4989a8b496` |
| Control-source manifest | 104 modules, 96 byte-identical, 8 controlled original differences |
| Private source handoff (SHA256) | `2af634e67992d0c69be7adfe444ab9a614db66c80947a6cf33bfb50005b9e7c2` |
| New private Control npm package (SHA256) | `9ac7b407b7bd2bfb7e493c086a22caa2e82fe2bc6978751f66dc2cb4d40340b6` |
| Private facade package (SHA256) | `cb6249bf316ec6c237af465344d8aec4bb974386db6875c742dc229dc3b81963` |
| Original Grant native Wheel (unchanged) | `cfff22d3d24efb9bb7d6f5701515ac4616cb82029c62245494ae84bd1df81969` |
| Consumer Grant worktree | `feat/grant-pf106-consumer-hub-20261019` (PR #102 Draft) |

The bundle is private, unpublished and stored in operator-local restricted
directories. Public Grant commits include only source changes, exact hash/lock
metadata and tests. Materialization under ignored `.foundation/` is
content-verified and does not substitute a new native identity or restore Wheel.

## Test and acceptance evidence

- Foundation Source/TypeScript/native Control provenance and package build PASS.
  Control-clone unit tests **35/35 PASS** (includes consumer port).
- Original native Control SQLite/browser E2E **6/6 PASS** in a fresh isolated
  loopback environment using a known existing Python `uvicorn` virtualenv;
  the first attempt had an absent shell `uvicorn` and did not start, which was
  corrected without changing product code.
- Exact private package handoff and fresh npm offline packaging/installation
  PASS, Grant Web pinned package verification and original Grant runtime
  preservation PASS.
- Grant Web unit tests **768/768 PASS** and TypeScript/Vite build PASS.
- Affected Chromium isolated test: native Admin login, member self-service and
  Administration shortcuts **3/3 PASS**.
- Additional Chromium isolated tests: actual Admin/Member route permission
  projection and keyboard-accessible mobile drawer **2/2 PASS**.
- The isolated browser fixture does **not** prove genuine independent external
  test mailboxes, SMTP provider delivery, production public surface, Control or
  Stellar side effects, F31 native authenticated FUE, performance or visual
  pixel-equivalence. These remain under independent PF05 and owner gates.
- Exact-HEAD CI conclusions and checks must be filled from actual GitHub
  workflow evidence after push. A successful local test is not CI PASS.

No merge, release, public deployment, real SMTP send, production change or
privileged host mutation occurred here.

## Resume

1. Confirm Grant PR #102 exact HEAD and upstream/CI terminal status;
   reconcile any actual CI failure at that exact source rather than redoing
   finished Foundation/Admin/approval UI steps.
2. Advance PF03 genuine product-native admin identity/MFA/ACL/Role/Sessions
   *only* where approved and independently backend-enforced. Unsupported
   surfaces remain inert.
3. PF05 real independent Admin/Requester/Approver and mailbox-based Full User
   E2E plus product owner visual acceptance, with separate legitimate
   sessions and transport authority; do not use synthetic fixture evidence.
4. PF06 merge/release/production only after explicit owner approval.

## PF106 search and browser-fixture reconciliation (follow-up)

**Current opt-in Foundation candidate:** private Draft PR #107 exact source
`acbdc50b34d2e2e819823ed1a9c7016572ab901f`; handoff archive SHA256
`849bf53bbbfc410c1d75c69e1b81a4bb1e8158f38c6be9dbd89ca587b5056b3c`.
The Grant-owned product-native AppShell now explicitly opts into
`quickNavigation` and the Control-origin Administration consumer hub opts into
`searchable`. These reuse Foundation-owned presentation and search only
authorized Grant projections; neither dispatches a missing Control native task.
The exact package/archive hashes are in `web/foundation-f31.lock.json`.

**Verified affected source:** Foundation 37/37 original/consumer Control-clone
unit tests, unchanged original Control Chromium/UI→API→SQLite 6/6, exact Control
104-module provenance and shared TypeScript/build PASS. Grant private package
digest verification, isolated offline install, existing Grant Wheel preservation,
Web 768/768, TS/build and pin Python 12/12 PASS. Grant's actual isolated
Chromium U8.05 Administration search and B1 Inbox keyboard/search 320/375
both PASS on one disposable server with a *unique fixture file*. This remains
synthetic source E2E, not the separate real-human/mailbox acceptance.

**Browser rate-limit contract:** The original browser suite runs many valid
admin logins sequentially against one temporary database, exceeding the
unchanged native 15-logins-per-user/300-second guard. The updated 58-test suite
must be evaluated using `python3 tools/run_browser_e2e_shards.py --shards 6`,
which selects individual cases with Playwright `--fully-parallel` while
keeping one worker per shard, retains every original auth/rate-limit check and
starts a new private 127.0.0.1-only disposable SQLite fixture for each shard. Evidence,
including per-shard JSON and fixture, stays in ignored `.e2e/browser-shards/`.
No auth policy, login control, role, SMTP provider or rate-limit code is relaxed.
Per-shard and exact-pushed-HEAD outcomes must be reported from actual execution
rather than inferred from this source contract.

This candidate remains unmerged, unpublished and uninstalled on the public
preview. No release, production change, real SMTP send or external Control/
Stellar effect is authorized by a browser fixture passing.
