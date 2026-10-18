# Grant PF-01 — Private Foundation a8b633 consumer adoption

**Subsequent PF-106 candidate:** A newer *separate*, unmerged Grant worktree
uses exact private Foundation `b02ea10e45abc51913b534ce1adef086c6d124b4`
to mount the opt-in original-Control Administration catalog presentation
with native Grant tasks, without changing Grant's RC50 details/auth services.
See `docs/FOUNDATION_PF106_CONTROL_ADMIN_CONSUMER_20261019.md`; historical
PF-01 `a8b633` source and checksum evidence below remain immutable.

**Status (2026-10-19):** Isolated Web consumer candidate installed and qualified; source integration on an isolated development branch, **NOT merged or deployed**. PF-02 through PF-06 (real Grant-native administration, identity, installed-product E2E) remain independent acceptance gates.

## Design and trust boundary

The Grant GitHub repository is **public** while the Product Foundation repository and its 0.1.0-dev handoff are **private/unpublished**. Public Grant may commit only exact source references, package digests, code, test fixtures without private data, and CI configuration. Never commit private npm archives, native Wheels, compiled Control code, secrets or session/capability material. Private payloads are staged only under ignored `.foundation/` and `.dev/`.

The candidate updates the immutable F31 Control-derived presentation dependency to `a8b633d9275a484e16b13ea05299f398f792a69b`. It retains Grant's RC50 `@datarelay-labs/foundation` SDK (124 exports), including legacy `AdministrationHub`. The new Control-derived F31 bundle has 18 exports, **not** the legacy AdministrationHub API. Do not directly substitute it. The existing `createGrantF31LoginAdapter` continues to bind Grant-issued session, CSRF, TOTP and recovery to the shared F31 login presentation. Email capability PIN and explicit approval Confirm remain Grant-native and are never delegated to Control session stores.

The three newly available Control components, `ControlAdministrationHubPage`, `ControlAuditLogsPage` and `ControlOperationsBackupPage`, are qualified as package exports **only**. They are not yet mounted to Grant: native Administration/role/MFA/ACL/session/backup APIs must be separately proven. No invented NIC, Gateway, Watchdog, host mutators or mobile feature claims. Backup/Import stays safely unavailable until an actual compatible Grant Workspace Transfer exists.

The original Grant native Wheel `0.10.0.dev0` remains frozen at SHA256 `cfff22d3d24efb9bb7d6f5701515ac4616cb82029c62245494ae84bd1df81969`. The newer Foundation same-version Wheel is installed only in independent isolated tests, **not** used to replace Grant's trusted identity/authorization runtime. Rollback is the original development candidate HEAD `ce8c5291c18cf74f4576033e43d6a9848ea166d2`; existing 127.0.0.1:19685 LAB, public authenticated preview, Outbox, database and G12 dirty diff are not mutated.

## Exact source and artifact pins

| Artifact | Identity |
| --- | --- |
| Foundation Git HEAD | `a8b633d9275a484e16b13ea05299f398f792a69b` |
| Control upstream source commit | `fc89dadcb01a262ef7881a6bca94dd4989a8b496` |
| Original private handoff SHA256 | `c25503369eb7858b11ab4bd3c3373ced9483fd17182c44915b1ed5a19a3f3e36` |
| Control clone npm SHA256 | `7af971ab02986bffaa350b8a2747c6a97fdce7a963ed82dcef4b6f9886b66abe` |
| F31 facade npm SHA256 | `cb6249bf316ec6c237af465344d8aec4bb974386db6875c742dc229dc3b81963` |
| Original updated native Wheel SHA256 | `cf78eff6ab35edbdd8aba1a9203611b6bfe21442e8c58a97b78ba2766cf5a537` |
| Repack-stable native Wheel canonical member digest | `c56a6e0adf476b2bc2799bd088a7e2edf4c1990ba1893fe27fa853c109f68e3f` |

The exact pinned Foundation private-source stager reproduced both npm archives byte-identically. Its regenerated same-content Wheel differed in ZIP metadata timestamps in four entries while all 55 member names and uncompressed content bytes matched. The original handoff is checked by outer SHA256. For a rebuilt **clean exact HEAD** source, both npm packages must match full archive hashes and the Wheel must match canonical member-content SHA256. Never accept a different source/contents based on Wheel version alone.

## Developer qualification

With a separately approved private archive on an authorized machine:

```sh
python3 tools/prepare_foundation_f31.py --archive /path/to/approved-handoff.tar.gz
python3 tools/verify_foundation_f31.py
npm --prefix web ci --offline --ignore-scripts --no-audit --no-fund
npm --prefix web test
npm --prefix web run check
uv run --frozen pytest -q tests/test_foundation_a8_private_consumer.py
```

In CI, the already-approved Foundation Contents:read credential checks out the immutable private source without persisting credentials. `tools/prime_foundation_f31_npm_peers.py` derives exactly ten public npm runtime dependencies from the pinned private lock and checks each exact version online, then offline, to prime the resolver cache; the upstream smoke still uses strict peer checks and `--offline` without bypass flags. The source-only stager produces ignored artifacts; `tools/prepare_foundation_f31.py --source` verifies them. API-static checks public lock metadata and the **existing** Grant Python runtime; foundation-web separately checks all new private artifact bytes and the Grant Web build. A missing token or mismatched source fails closed instead of reverting silently to 917df932. Private archives are neither Git-committed nor publicly uploaded by the workflow.

## PF-02 bounded Grant Administration routing (source implementation)

The first PF-02 Grant-owned source step is implemented in
`web/src/grant_control_administration_contract.ts` and wired to the existing
shared RC50 `AdministrationHub` on the genuine `/system` screen.
Only a task with an exact recognized product ID, matching native action/path,
current administrator role, matching task access and non-unavailable capability
can open a real Grant detail/route. Unknown task IDs, Control-only host actions,
unavailable administrator ACL/Roles/Sessions/Retention or configured SMTP tasks,
changed target paths, wrong role and malformed access fail closed with no API
mutation. Grant-specific navigation/focus state and password route are retained.

The immutable Control F31 catalog-to-Grant crosswalk deliberately treats
administrator-wide MFA/ACL/Roles/Sessions, native backup and retention as
UNSUPPORTED rather than silently substituting weaker personal or guidance
screens. Source integration is **not** a claimed migration of the original
hardcoded Control AdministrationHubPage, nor a new security permission.
Affected unit/UI regression and one real isolated browser Admin shortcut
acceptance validate unchanged actual route navigation; full installed-product
and account-auth acceptance are PF-05 and remain open.

The remaining Foundation-owned dependency is a configurable task/router and
identity/capability port for the original Control AdministrationHubPage and
AppShellLayout. Both presently hardcode Control routes and governance tokens;
Grant cannot mount them truthfully with existing product-native principal and
capability endpoints. Do not clone or modify shared Foundation UI in Grant.
Document and reconcile this before a full PF-02 product UI migration.

## PF-04 product-native read-only management evidence (source stage)

The existing administrator-only Grant HTTP endpoint
`GET /api/v1/admin/operational-readiness` projects current stored Grant state
with `allows_execution=false`. It reports no independently verified host SSH
allowlist, Web management CIDR enforcement, encrypted backup ledger, restore
drill, configured retention/deletion policy or authorized host mutation.
Missing/malformed recovery pause is `null`, never assumed healthy.

The original Grant `/system` screens now place verified
`NativeIngressReadback` under Network and `NativeLifecycleReadback` under
Backup & Import. The readback uses the same strict
`validOperationalSecurityReadiness` schema as System Health; unexpected backend
facts and failed/missing admin reads show an explicit warning instead of a
false-positive security or recovery status. Network still distinguishes the
stored service origin from independently tested HTTPS/SSH/ingress; lifecycle
keeps private CLI operator guidance separate from a verified restore drill.
Neither view adds a restore, delete, rotation, retention, firewall or host
policy operation.

Validation: unit tests for valid/missing/tampered backend projections and
read-only button absence; isolated *authenticated* admin Playwright session
matches the backend GET projection on both screens and asserts zero privileged
effect buttons. Existing Python readiness tests independently guard admin
authority, active state, secret redaction and no read-side Outbox/audit writes.
This is a product-level read-only source qualification, **not** an installed
native host audit, policy installation, recovery drill or PF-05 full user E2E.

## Workstream and strict acceptance

| WBS | Current engineering status | Missing closure |
| --- | --- | --- |
| **PF-01** private package provenance, reproducible preparation and pinned Web consumer | Exact source and package content verified; isolated npm/Wheel import and candidate Web build/tests PASS | Exact pushed-head CI, product baseline/rollback and separate final distribution approval |
| **PF-02** Control desktop shell/Admin adaptation | Grant-owned task ID/target/role/availability fail-closed router integrated into existing RC50 Administration; private Control exports available, original UI retained | Shared original Control hub/shell configurable router+capability adapter, full mounted visual/host readback; no fake native permissions |
| **PF-03** native user/MFA/ACL/Roles/Sessions | Original Grant backend and native Wheel retained without scope change | Authorized Grant-native backend adapters with independent identity and permission tests |
| **PF-04** native host/backup task truth | Source stage: verified persisted admin-only Grant recovery/ingress/retention readbacks on Network/Lifecycle with fail-closed absent evidence; unsupported mutations remain disabled | Native host/backup/restore/retention/SSH/TLS actual authority, isolated execution, recovery drill and owner acceptance NOT qualified |
| **PF-05** installed persona and approval E2E | Earlier no-login real email/PIN/Confirm UI tested separately, not eligible as native-auth evidence | Mounted exact PF candidate Admin→Requester→Approver, true sessions/RBAC and mail decision/replay checks |
| **PF-06** product release qualification | NOT STARTED | Exact-head Git/CI/evidence, backup/rollback, owner approval for merge/release/production |

Private package installation is **not** evidence of full Foundation application, nor is an AUTH_BYPASSED_LAB approval proof of MFA/RBAC or privileged host behavior.
