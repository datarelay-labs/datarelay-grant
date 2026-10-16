# Grant adoption of private Foundation RC50

Status: Grant consumer adoption candidate. This does not publish Foundation,
merge Grant, authorize production, or replace Grant-native user acceptance.

## Exact Foundation handoff

- Foundation artifact source: 746e0a78f8dba782c00eba675099f24f647f1f09.
- Package family: ten synchronized @datarelay-labs/* version 0.1.0-rc.50 archives.
- Private bundle SHA256:
  abd25e7e6746d54006144d6ceeb33a2027ef36219b2fb6fe23aa62e48024193f.
- The private bundle outer SHA, safe archive paths, and all fifteen staged
  SHA256SUMS entries were independently rechecked before consumer mutation.
- web/foundation.lock.json, web/package.json, and web/package-lock.json pin
  the exact RC50 family. No registry tag or mixed Foundation version is accepted.

RC50 supersedes the prior RC41 consumer pin for the current Grant candidate.
The dated RC41 adoption document remains historical evidence and is not the
current package identity.

## Consumer boundary

Foundation owns the shared DataRelay login, ProductShell, AdministrationHub,
Control-reference visual tokens, shared task vocabulary and reusable
presentation/state contracts. Grant continues to own its users, roles,
sessions, approval policies, SMTP, database, integrations and every native
effect.

The current System Management page presents the complete RC50 thirteen-task
Control-reference vocabulary. Grant-supported tasks keep their real
View/Manage destinations. Shared tasks without a Grant-owned administrative
effect remain visible as unavailable with no active action rather than being
hidden or falsely advertised:

- Management Access (ACL)
- administrator-wide Multi-Factor Authentication management
- Roles & Permissions editor
- administrator-wide Sessions directory
- Retention

Personal password, TOTP/recovery and current-account session management remain
under Account & Security. These are not promoted into administrator-wide
control-plane capabilities.

Grant-specific Mail & Notifications remains a product extension to the shared
Administration surface.

## Shared UI ownership

Grant imports Foundation styles before Grant product styles and does not carry
a local .dr-* or ProductShell CSS fork. The prior RC41 mobile shell override
was removed during this adoption so RC50 owns the common shell presentation.

Product-specific .grant-* workflow styles remain consumer-owned.

## Qualification

Consumer qualification must include exact Foundation lock/archive identity,
full Grant Web unit/type/build validation, native Grant Chromium regression
including 320/375px, exact built/deployed Web byte readback, and Grant
persona-led Surface Reconciliation / Full User E2E on the resulting candidate.

Foundation tests and fixture browser tests are supporting evidence only; they
do not replace Grant's real signed-in personas, independent mailboxes, or
product-owned effects.
