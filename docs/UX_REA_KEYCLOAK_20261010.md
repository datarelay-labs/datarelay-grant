# Grant competitive UI REA evidence — Keycloak Admin UI 26.5.7

**2026-10-10, static/source-only. NOT an authenticated Keycloak UI walkthrough, browser capture, or Grant release.**
Authority: Grant [Roadmap #37](https://github.com/datarelay-labs/datarelay-grant/issues/37), existing [Work Packet #67](https://github.com/datarelay-labs/datarelay-grant/issues/67) rev8. Consumer source before the new UI patch: `datarelay-labs/datarelay-grant@7a6eaf575ad2de9972a838ace927e20f6acbb1bf`.

## 1. Real REA analysis actually run

| Provenance | Verified value |
| --- | --- |
| Competitor | [Keycloak](https://github.com/keycloak/keycloak), Admin Console |
| Exact upstream code | [Git tag `26.5.7` commit `97c2dad98597b17efae79006be47a51c6f5a72e9`](https://github.com/keycloak/keycloak/tree/97c2dad98597b17efae79006be47a51c6f5a72e9/js/apps/admin-ui) |
| License | [Root Apache License 2.0](https://github.com/keycloak/keycloak/blob/26.5.7/LICENSE.txt), SHA256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| Package validation | `js/apps/admin-ui/package.json`: version `26.5.7`, `license=Apache-2.0`; React / PatternFly V5, `react-router-dom` |
| Scope | **17 selected original TSX files**, 61,088 original source bytes; each privately SHA256-pinned; NO commercial binary/decompiled source |
| Tool | **`rea-agents@6.3.0 analyze-javascript-application`**, original CLI; 17/17 syntax parsable |
| Isolation | Local dev-atlas unprivileged user/mount/network/PID namespaces, readonly source and tool bind mounts, empty environment, user home masked; no website traffic / login / app execution |
| REA source-artifact digest | `492acfe5465a282a620cf89ef0b4bd849a33582f5e450c8190e9dd9d30ce0aef` |
| Evidence ID | `ev_43a17e9a165bcb79aecf663b3f016b7598f1a5594bd42cbe852bfa0e2087f24b` |
| Raw evidence SHA256 | `a098d296a1b8263d0c3b313214937fa01a93cfeaa34e11467ef2f798632cd2bc` (raw ~14.8MB stored privately **outside Git**) |

### Measured output, not guessed UI capability

| Measurement | Observed |
| --- | ---: |
| Relevant files (includes scoped package manifest) | 18 |
| TSX source parsed / parse failures | 17 / **0** |
| JavaScript AST nodes visited | 8,050 |
| Application graph nodes / edges | 375 / 529 |
| Static semantic nodes / relations | 3,657 / 3,284 |
| **Unresolved semantic references** | **1,262** |
| Integrity contradictions | 0 |
| Static coverage | **Partial / unknown** for cross-module and runtime behavior |

**Caution:** the 17-file subset deliberately excludes most of the Keycloak application. REA can identify local declarations and candidate relationships but **cannot establish authenticated routing behavior, accessibility compliance, correct IAM policy enforcement or visual parity**. The unresolved relationships are genuine limitations, not additional identified features. No vendor UI screenshots, credentialed browser interactions or live REST calls were performed.

## 2. Exact open-source UI patterns extracted and disposition

| Licensed source evidence | Static or direct-code observation | Grant decision, not code copying |
| --- | --- | --- |
| [`PageNav.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/PageNav.tsx), especially lines 28–45 and 88–153 | Nav items check route access; higher groups `Manage` and `Configure` appear conditionally, with active route link | **REUSE EXISTING FOUNDATION** `ProductShell` role-filtered grouped nav. Do not rebuild a sidebar. For Grant's member role, remove/fix misleading Administration capability items under M2 (separate protected source gate). |
| [`routes.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/routes.tsx), lines 27–73 | Route descriptors carry `handle.access` and optional breadcrumb metadata | Keep Grant route+capability consistency as a **design contract**; do not transplant realm/IAM route models or treat UI checks as API authorization. |
| [`UsersSection.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/user/UsersSection.tsx) and [`RoutableTabs.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/components/routable-tabs/RoutableTabs.tsx) | Route-oriented list and permissions tabs; active tab derives from route parameters/path | **NEW safe Grant application slice:** surface first-class `Needs my decision / On hold / Delegated to me / Recently decided` task buttons in the existing approver Inbox. Do not allow tab state to bypass existing server-side `view` filter or load admin data. |
| [`UserDataTable.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/components/users/UserDataTable.tsx) and [`GroupTable.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/groups/GroupTable.tsx) | Search/filter terms, table row detail links, explicit empty state, status/selection distinction | Maintain Grant primary title/action + separate decision and execution status. Bounded pagination means never invent an exact global queue count from first-page results. |
| [`ViewHeader.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/components/view-header/ViewHeader.tsx) and [`PageBreadCrumbs.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/components/bread-crumb/PageBreadCrumbs.tsx) | Page title/action region and route-derived breadcrumb hierarchy | Grant design hierarchy **My work → My approvals → Request detail**, immutable action title and dominant next step, supporting evidence disclosed secondarily. Implement only on separately authorized existing routes. |
| [`FormAccess.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/components/form/FormAccess.tsx), line 123, and [`ConfirmDialog.tsx`](https://github.com/keycloak/keycloak/blob/26.5.7/js/apps/admin-ui/src/components/confirm-dialog/ConfirmDialog.tsx) | Read-only/insufficient-access state can disable form controls; explicit confirmation modal with cancel path | **Design principle:** permission-aware controls and explicit final human confirmation. Grant `core.users` and `grant.smtp.test` member projection contradictions remain P0 until corrected in Foundation/Grant. Grant email PIN must still use server-side policy and 2 distinct POSTs; Keycloak confirm dialog is not an email security model. |

A note on attribution: a Keycloak **source-code** pattern above may be corroborated by the REA graph's static evidence, but the chosen design outcome is our independent requirement. We do not claim REA rendered these screens or discovered their exact runtime behavior. No Keycloak protected source is copied into DataRelay.

## 3. Why REA is selective rather than a new UI dependency

- REA **succeeded** for a pinned, licensed, relevant Keycloak Admin UI source subset. The result is materially more specific than last turn's 6-vendor official-doc Gap Matrix and addresses the owner's question about real static analysis.
- Jira/ServiceNow/StrongDM/Teleport commercial UI source is **not** assumed to be available for reverse engineering. Their official docs remain `DOCUMENTED`, no runtime-`OBSERVED` category.
- Keycloak's IAM roles, realm settings, user automation, PatternFly component implementation and copyrighted code **are not** Grant functionality. Transfer high-level interaction principles only.
- No additional REA run is necessary to build the first Grant UI slice: use the listed evidence and confirm with our own React/TypeScript tests; revisit only if a new licensed exact target can answer a material unresolved design question.

## 4. Concrete downstream design and implementation

See [Grant five-screen blueprint](UX_SCREEN_DESIGN_GRANT_20261010.md) and the independent [HTML design prototype](ux-prototypes/grant-approval-workspace.html). Both are explicitly non-production design; the HTML has no API/network side effects.

Existing shared component owner: **Product Foundation** (`AuthLayout`, `ProductShell`, `AdministrationHub`, responsible for desktop/mobile/roles). Product page owner: **Grant** (`RequestList`, email decision, policy editor, request details). Real user E2E always requires exact installed Grant HEAD and distinct authorized personas and mailboxes; Keycloak static analysis is not evidence of such acceptance.
