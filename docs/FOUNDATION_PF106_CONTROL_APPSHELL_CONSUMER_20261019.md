# Grant PF106: Control-source AppShell consumer port (2026-10-19)

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
