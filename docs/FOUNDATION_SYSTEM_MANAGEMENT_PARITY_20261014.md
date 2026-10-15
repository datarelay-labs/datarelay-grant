# Foundation System Management parity — Grant vs Control (2026-10-14)

Status: **P0 accepted user-visible capability gap; SM-0/SM-1/SM-2 implemented, SM-3/SM-4 owner-gated, SM-5 acceptance open.**
Scope: DataRelay Grant development candidate only; neither Control nor shared Foundation source is modified here.

## User-reported behavior and root cause

The owner supplied two authenticated Administration screenshots:
- **Control reference:** System Administration presents HTTPS, User Management, Password Management, Display timezone, Network, Retention, Backup & Import, Audit and System Health with `Manage` and green `supported` indicators.
- **Grant at the time of the reported screenshot:** the same nine shared task labels appeared under `Administration > System management`, but HTTPS, Password Management, Display timezone, Network and Retention were `unavailable`. Backup & Import was `read only`; User Management was actionable, while Audit and System Health exposed product-scoped read-only views. Subsequent SM-1/SM-2 work intentionally advances only capabilities backed by real Grant contracts; the extra Grant-owned Mail & Notifications tasks remain.

**Verified source identity at the reported baseline:** Grant consumes the immutable private `@datarelay-labs/*@0.1.0-rc.41` Web packages via `web/foundation.lock.json`, and renders Foundation `AdministrationHub` and `createStandardAdministrationTasks` in `web/src/administration.tsx`. At that baseline the availability map explicitly set five core tasks to `unavailable` and wired `onOpen` for only Accounts, Audit, Health, Mail Test and lifecycle guidance. SM-1/SM-2 now add Grant-owned destinations without changing Foundation source. Grant `web/src/foundation.config.ts` declares product capabilities and navigation. Shared Web UI import by itself **does not** implement a Grant control-plane API.

**Control reference source** (`datarelay-control-dev/frontend/src/components/administration/administration-hub-page.tsx`) uses Foundation `AdminTaskCatalog` inside a Control-owned administration page; its task projection currently declares `supported` for all nine destinations. Control has separately implemented settings views including `admin-display-timezone-settings.tsx`, `admin-network-settings-page.tsx`, `admin-retention-settings.tsx` and `operations-backup-page.tsx`. The hard-coded badge alone is not evidence that every Control backend action is safely accepted in a live environment; the pages and API contracts are **Control-native**, not portable Foundation implementations.

Foundation RC41 also supplies optional read-only/review UI primitives (e.g. TLS certificate, network trust, backup policy and retention panels) plus a private Python on-prem security Wheel. The original Wheel is **not installed into Grant**. Core Control product backend operations have not been mapped to a Grant native host/configuration adapter. This is **feature/adoption incompleteness**, not an outdated RC or a missing shared navigation component.

## Required functional gap matrix

| User-expected task | Control reference UI | Verified Grant implementation / current evolution | Needed before calling it supported |
| --- | --- | --- | --- |
| HTTPS | Manage | Unavailable; TLS configured by deployment proxy | Authoritative listener/cert/redirect readback; secure certificate config validation, admin reviewed apply/rollback through an approved host adapter |
| User Management | Manage | Supported Grant admin account create/disable | Preserve current reviewer/role/security controls; parity review, not a rewrite |
| Password Management | Manage | Platform policy unavailable; personal password/MFA exists at Account & Security | Distinguish self-service from platform credential/password policy; only advertise platform Manage when a real admin policy API exists |
| Display timezone | Manage | Grant-native authenticated user override + platform default persisted in SQLite schema v15; effective resolver and UTC-safe display adapter wired to System Management and Account & Security | Preserve role/CAS/audit validation and same-HEAD preview/browser acceptance; stored business timestamps remain UTC |
| Network | Manage | Unavailable; deployment/operator-owned reverse proxy | Authenticated current listener/port readback, port validation, privileged dry run, explicit reviewed apply and rollback/reconnect paths |
| Retention | Manage | Unavailable; no web-managed cleanup scheduler | Actual policy persistence, preview counts, scoped scheduler, audit and safe recovery; no deletion just for parity |
| Backup & Import | Manage | Read-only recovery guidance; now links real admin-only Diagnostics and existing Draft-only configuration export/preview/import | Design separate backup/import/restore beyond current safe Draft portability, with atomic reviewed rollback and operator authority |
| Audit | Manage | Read-only authenticated Grant audit records | Role-scoped search/history appropriate to this task, not an invented config-modification API |
| System Health | Manage | Read-only Grant health/status & operational-readiness | Show current product evidence; no fabricated native Control/Stellar or host health claims |

## Ordered P0 implementation and acceptance

1. **SM-0 Evidence/contract: DONE 2026-10-14.** Record the Control/Grant adapter split, exact package pin, and real capability matrix in this document and the canonical roadmap; correct the mistaken "M2 complete means complete Control-like System Management" interpretation. Preserve all existing Foundation and Grant implementation.
2. **SM-1 Low-risk product-owned routes and read-only parity: DONE.** Reuse Foundation's nine canonical task labels/layout, existing Grant `/security`, `/admin/info`, `/admin/health`, scoped audit and configuration export/preview, and verified source data only. Password Management now opens personal password/MFA self-service as read-only; HTTPS and Network expose only the authenticated configured service-origin projection with explicit deployment-operator ownership and no apply controls; Backup & Import opens the existing Draft-only portability path. Retention remains explicitly unavailable because no scheduler exists. Focused unit, type/build and authenticated browser route/focus checks pass. Keep additional Grant mail tasks.
3. **SM-2 Persisted non-destructive settings: DONE (source + deterministic qualification).** Grant now has an independently designed IANA display timezone contract with authenticated user override/platform default persistence, server validation, stale-write CAS, audit, effective resolution and UTC-safe display formatting. Personal settings live under Account & Security; the platform default is an admin-only System Management action. Stored business timestamps remain UTC. Focused backend/Web/browser qualification and full Web regression are green; exact pushed-head development-preview readback is finalized under SM-5 rather than treated as a separate mutation.
4. **SM-3 Privileged host/security settings: OWNER-GATED.** Real HTTPS/TLS, reverse-proxy network apply, platform credential policy, secret lifecycle, and certificate changes need explicit owner-approved target/host permissions, a trusted on-prem adapter contract, safe review/CAS/idempotency/audit and rollback. No host/proxy/listener or user credential changes are authorized by this document.
5. **SM-4 Retention and recovery mutations: OWNER-GATED.** Real retention scheduler/deletion, backup/import apply and DB restore need accepted source-specific semantics, reversible disposable qualification, recovery protections and separately authorized durable effects. Foundation panels and a mocked preview are not execution proof.
6. **SM-5 Control-like usable web surface: OPEN after prior source.** Verify the same nine tasks with real role-scoped capability truth and action destinations at desktop/390px, selected-task keyboard focus, and same-HEAD authenticated user E2E. No default `supported` badges to imitate the Control screenshot. Update the development preview without modifying existing data, email/worker/integration tokens, or production.

### Non-negotiable boundaries

The user asked for **functionality comparable to the first screenshot**, not simply green badges or dead-end `Manage` buttons. Do not copy Control-specific endpoints/schema into Grant without an explicit Grant contract. Shared cross-product UI differences belong in the Foundation source project; product adapters/backend remain Grant-owned. Do not revisit the finished competitor analysis, Group/CAS/PIN/MFA, native Control/Stellar business effects, two-human Full User E2E or release, unless the owner separately reauthorizes those scopes.

**Correct milestone reporting:** Foundation RC41 source/bundle and the previously accepted Grant Web consumer integration are complete. **M2 System Management functional parity is NOT complete**. Broader M1–M5 accepted pre-E2E source work is preserved; its past "source complete" scope must not hide this newly confirmed explicit user requirement.

## First implementation — safe existing Grant portability destination

The Grant-only `Backup & Import` card retains truthful **read only**
availability and operator-only DB restore guidance. Clicking its
`Open configuration portability` link now opens
`/integrations?view=diagnostics`, which is already restricted to
administrators by the Grant product router; it displays the existing
`ConfigurationPortabilityV2` component. The resulting normal page GET
does not import, approve, activate, issue credentials or send an outbound
message. The Integration tab resolves an exact allowlisted
`view=diagnostics` query and refuses duplicate or unknown mutation-tab
queries. The existing Draft import still requires its explicit server
preview, mapping and later Confirm and is **not** a database restore.

New first-party unit cases were intentionally RED before the wiring,
then GREEN with existing Admin/Integrations/configuration tests
**24/24 PASS**, TypeScript and Vite production build PASS.

## SM-1 closeout — truthful existing capability routes

The remaining low-risk existing capability routes are now wired without
inventing host control. `Password Management` is a read-only task that opens
the existing `/security` password/MFA self-service and explicitly states that
there is no system-wide password-policy editor. `HTTPS` and `Network` are
read-only selected-task views backed by the authenticated `/admin/info`
projection; they show the configured service origin and deployment-operator
ownership only, and explicitly do not claim certificate, listener, redirect,
proxy apply or reconnect control. `Retention` remains unavailable because
Grant still has no web-managed scheduler.

Focused Foundation/System Management units are **7/7 PASS**, TypeScript and
Vite production build PASS, and the authenticated Grant browser scenario
covering HTTPS, Network, Password Management, System Health and existing
shortcuts is **PASS**. This closes **SM-1**. SM-2 timezone persistence is now implemented and
qualified as described above; SM-3 privileged host/security effects and SM-4
retention/restore mutations remain owner-gated, while SM-5 same-head preview
and complete user-surface acceptance remain separate.
