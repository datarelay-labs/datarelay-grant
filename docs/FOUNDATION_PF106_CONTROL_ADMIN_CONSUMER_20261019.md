# Grant PF-106 — Original Control Administration UI consumer

**Date:** 2026-10-19
**Status:** Isolated Grant candidate, source-only. Not deployed, not merged, not privileged host/auth-qualified.

## Source and boundaries

This candidate is stacked on Grant PF-01/02/04 Draft PR #101, with its own branch/worktree. It consumes exact private Foundation Draft PR #107 HEAD `b02ea10e45abc51913b534ce1adef086c6d124b4`. The original Control-derived F31 component `ControlConsumerAdministrationHubPage` supplies the Administration page's shared card-grid/header/help/disabled-task presentation. Grant `grantControlConsumerAdministration` supplies exact server-derived actor, known task ID, availability/access/route mappings. Every click must still resolve the trusted original `resolveGrantAdministrationSelection` binding before displaying a native Grant detail. Foundation has no permission to call Grant APIs or assume backend authorization.

Grant product `/system` is an administrator-only native route. The underlying Grant-owned New Request, My approvals, Notifications, Approval policies, Audit, User Management and personal security remain implemented by their existing actual APIs/RC50 page details. No Control account database or security Wheel replaced Grant auth. Shared Control `AppShellLayout` is not mounted: it still contains Control-only streams/connectors/governance routes. No fake or missing network/backup/TLS/roles/session host actions are enabled.

**Explicitly unavailable:** administrator-level MFA/ACL/Role Policy/Session directory, native host mutating settings, retention deletion, database backup/restore, SMTP configuration. The shared Control UI renders these as inert cards. The Grant task ID/access/target allowlist rejects missing/wrong/foreign path, unavailable role, read-only Manage and mismatched callback.

## Private source provenance and packaging

| Item | SHA256 / identity |
| --- | --- |
| Exact Foundation source HEAD | `b02ea10e45abc51913b534ce1adef086c6d124b4` |
| Exact private original handoff SHA256 | `28edfbd6358810be4ab9468872c5b52185e858e031e00c5d333096069e2fd119` |
| Original Control source commit | `fc89dadcb01a262ef7881a6bca94dd4989a8b496` |
| New private Control npm clone SHA256 | `9efca980190b4fc66b3e7e28ddf0a5ee98b03981699f3b29a55beea98bdb43cd` |
| New private Foundation npm facade SHA256 | `cb6249bf316ec6c237af465344d8aec4bb974386db6875c742dc229dc3b81963` |
| Updated private native Wheel (NOT integrated into Grant auth) | `9ff7b2e45ff2c40af622bc24ea47fd53307a8355e71fa0bd660174c992e80013` |
| Canonical updated Wheel ZIP member content SHA256 | `c56a6e0adf476b2bc2799bd088a7e2edf4c1990ba1893fe27fa853c109f68e3f` |
| Original Grant native auth Wheel still installed | `cfff22d3d24efb9bb7d6f5701515ac4616cb82029c62245494ae84bd1df81969` |

Foundation package bytes and compiled Control binaries remain exclusively in Gitignored private files. GitHub Grant is a **public** repo; do not commit/publish those files. The Web CI checks out the already-authorized private Foundation immutable HEAD, builds its package and verifies npm archives, Wheel member content, Control provenance and version pins. The original Control 104-source provenance stays unchanged. No registry or release publication is authorized.

## Scope-accurate acceptance

- Foundation shared optional component source tests and native Control default/regression/loopback browser PASS from the separate Foundation #106 workstream.
- Grant PF-106 native administrator catalog adapter, callback allowlist and unsupported task behavior are covered by source-level tests, actual isolated browser Admin navigation, and exact-head CI (record actual result after run).
- Grant's previously proven localhost email/PIN approval outcome remains independent; it was an AUTH_BYPASSED_LAB and is **not** an authenticated Full User E2E for this new source HEAD.
- PF-03 MFA/ACL/Roles/Sessions native enforcement, PF-04 host effects, PF-05 independent installed-user Full User E2E, PF-06 production/merge/release remain separate and open.
- Rollback is original Grant PR #101 exact `af134482c90756ada637589b946dbf5462a6f3af` and original PR #100 untouched, with existing LAB and G12 unmodified.

**Remaining reusable Foundation gap:** configurable full Control AppShell/navigation/header/account slots separate from the now-implemented opt-in Administration catalog (Foundation #106). Do not recreate Control shell/styles inside Grant.
