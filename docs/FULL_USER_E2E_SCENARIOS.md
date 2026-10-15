# DataRelay Grant 1.0 — Full User E2E Scenario Contract

> **Purpose:** Complete Grant core product-quality testing through first-time administrator setup, real requester/approver browser journeys, local operator CLI/recovery, designated email/PIN/MFA, negative/race/concurrency/usability and truthful approval→consume→reported-result separation. Native Control/Stellar acceptance is a separate profile.
> **Canonical repository/path:** `datarelay-labs/datarelay-grant` / `docs/FULL_USER_E2E_SCENARIOS.md`.
> **Companion:** `docs/CLI_FEATURE_SCENARIO_RECONCILIATION.md` is a **separate non-destructive** feature/CLI/UX coherence audit.
> **Existing authority retained:** `docs/FULL_USER_E2E.md`, `docs/USER_SCENARIOS.md`, `docs/SURFACE_RECONCILIATION.md`, `docs/INTEGRATION.md`, `docs/G11_EXTERNAL_ACCEPTANCE.md`, `docs/OPERATIONS.md` and the current Engineering System `standards/USER_ACCEPTANCE.md`. Read these **entirely before execution**.
> **Design reference:** Adapted from the current DRLink canonical contract resolved through `/home/aella/datarelay-link-current`: `datarelay-labs/datarelay-link/docs/FULL_USER_E2E_SCENARIOS.md`, source HEAD `a26c6465730dc388590113aa1967191b109f75b2`, file SHA256 `215f388eedc0cb97a3ba61e6425191fa3c77aa4a083a63244f08c8e1e3d6b50e`. Preserve its black-box persona, exhaustive public-surface coverage, failure-accumulation and evidence semantics while adapting DRLink-specific network/multi-host concerns to Grant's Web-first human-approval product.
> **Initial candidate while drafting:** Grant Draft PR #100 `e07e8864b14b7c30ae4c65ec2d563525ca05533d`. This is not frozen or accepted; resolve actual source, test-contract and installed build identities at test time.
> **Foundation ownership:** Foundation project owns common login/sidebar/administration UI and public SDK. Grant owns approval-domain pages, Grant-specific backend/adapters, policies, mail decisions and native product integration. Found Foundation UI defects must be assigned upstream rather than independently rewritten here.
> **Status:** NORMATIVE TEST CONTRACT / NOT EXECUTED ON THE CURRENT CANDIDATE. This document does not grant external effect, production or release authority.

## 1. Trigger, coverage profiles and completion claims

A user request for "Grant Full User E2E", "Grant 사용자 E2E", "전수 사용자 테스트", or execution of this exact document is an **immediate execution command**: resolve this canonical contract and exact candidate, then start every safe independent persona/test lane whose prerequisites are already satisfied. Missing owner/safety/environment/tooling prerequisites block only their dependent scenarios; they do not convert the whole request into planning or pause unrelated runnable lanes. A request **to prepare the documents**, as in the current task, authorizes writing/validation/commit only: **no E2E execution now**.

| Profile | Scope | Legal conclusion |
| --- | --- | --- |
| `CLI_FEATURE_SCENARIO` | Separate public CLI/feature/workflow audit | Never user E2E |
| `TARGETED_USER_E2E` | Explicitly narrowed domain(s), e.g. signed-in Home→Request→Approval or mobile | Only targeted result; remaining scenarios `NOT_RUN_BY_SCOPE` |
| `DISPOSABLE_PRODUCT_E2E` | Exact built Grant Web+API, disposable DB/accounts and real local SMTP/HTTP fixture | Product candidate E2E evidence, not independent mail/native external acceptance |
| `FULL_USER_E2E` | Complete Grant core product journey: first-time admin setup, requester/approver work, real browser/auth, real designated mailboxes, local operator lifecycle, negative/recovery/concurrency/usability | Core product-quality PASS when every applicable in-product lane has public-surface and durable evidence; native Control/Stellar is not folded into this result |
| `EXTERNAL_INTEGRATION_ACCEPTANCE` | X-001..X-011 only: real DataRelay Control effect/readback and deployed Stellar receiver acceptance | Separate integration-quality result governed by `docs/G11_EXTERNAL_ACCEPTANCE.md`; blocked external owners do not prevent core Grant E2E execution |
| `RELEASE_QUALIFICATION` | FULL_USER_E2E plus exact-head machine/CI/provenance; additionally require EXTERNAL_INTEGRATION_ACCEPTANCE only for release claims that include those native integrations; two complete same-HEAD confirmation passes | No merge/release automatically implied |

**False-PASS prevention:** A Grant SMTP send accepted by a fixture does not prove a real inbox received it. A Grant-generated HTTP callback does not prove Stellar Cyber ingestion. A Grant helper or simulated Control SQLite effect does not prove the real Control operation executed. React SSR/unit tests, API fixtures and scripted Playwright accounts are supporting evidence, not persona-led public-surface E2E. An email decision link `GET` does not itself approve. A safe source-only preview with workers/SMTP disabled cannot pass end-to-end delivery.

**Owner-controlled gates:** actual deployed Control/Stellar effects, host/proxy/security mutations, destructive recovery/load beyond an approved disposable boundary, PR merge, production and release require separate explicit authorization. Core persona-led Full User E2E is executable by ChatGPT when legitimate independent accounts/inboxes/sessions and disposable Grant state are available. Missing native Control/Stellar authority is recorded against the separate external-integration profile and does **not** block a clean core Full User E2E result. A missing prerequisite blocks only its dependent scenario as `BLOCKED_OWNER_AUTHORIZATION`, `BLOCKED_ENVIRONMENT` or `BLOCKED_TOOLING`; it never silently becomes PASS.

## 2. Acting roles and independent users

ChatGPT is the default FULL_USER_E2E executor and final auditor unless the owner explicitly selects another authorized tester. ChatGPT must act as multiple **knowledge-isolated real-user personas** on genuinely permitted browser/CLI/mailbox surfaces; the test does not require multiple biological humans. If the owner performs a browser action manually and supplies evidence, record `OWNER_PERFORMED_WITH_CHATGPT_AUDIT` for that lane rather than inventing a ChatGPT login. Source/API/internal receipts are auditor evidence **only after the relevant persona's public-surface evidence is frozen**.

| Persona | Mission and identity rule | Information allowed initially |
| --- | --- | --- |
| `ADMIN` | Administer disposable installation, users, groups, policies, notifications, integration credentials, audit | Approved admin account and product URL; no hidden fixture/token |
| `REQUESTER_A` | Request a bounded harmless action, track it, answer questions and replace/cancel | Own account, reason, target and discoverable policy |
| `APPROVER_B` | Receive independently delivered approval mail and consciously decide Hold/Approve/Deny | Independent account/inbox/browser context B, selected seat, no requester cookies or requester-only knowledge |
| `UNRELATED_C` | Verify unrelated user cannot enumerate protected request/admin actions | Separate authorized member identity without seat |
| `DELEGATE_D` | Act only on a specifically delegated/current seat | Separate eligible identity and bounded delegation |
| `OPERATOR` | Safely install/check/recover disposable Grant with public `grant` CLI | Trusted sandbox paths, operator access, no user decision authority |
| `CONTROL_OBSERVER` | X-profile only: verify approved native action at the real Control-owned execution boundary | Separate read-only Control effect ledger/destination; not required for core Full User E2E |
| `STELLAR_OBSERVER` | X-profile only: verify deployed Stellar tenant/case/alert receiver state | Actual deployed receiver version and independent readback; not required for core Full User E2E |

Requester and approver must be **independent identities, independent inboxes and independent browser/session contexts**; aliases that collapse into one inbox/session do not qualify. The same authorized ChatGPT executor may act as both personas only through isolated actor contexts that do not share cookies, mailbox state or prior-role knowledge. Record account identity (redacted), mailbox, browser context and product role separately. Admin cannot impersonate a human vote. A future owner/human UAT may add assurance but is a separate acceptance surface. Never send raw credentials, mail decision tokens, PIN/OTP/TOTP, cookies or bearer keys in ChatGPT evidence.

### Persona public-surface discipline

- Acting users begin with a **mission**, navigate real built pages and react to public labels, normal errors and their own email—not a source-derived exact command checklist.
- Before switching persona, establish a new legitimate session/inbox and reset previous actor's knowledge; no cookie copying or reading saved fixture passwords.
- Browser drivers may record permitted click, keyboard, screenshot and network assertions, but helper scripts alone are supplementary evidence, not persona-led acceptance.
- During an active black-box lane, the acting persona does not inspect product source, test source, internal SQLite, hidden APIs, fixtures or scenario-answer tables. Those become auditor/remediation inputs only after that lane's public evidence is frozen.
- Prior platform-denied fixture-credential extraction and detailed browser DOM operations must never be retried or rerouted via other tools/hosts/scripts. Record `BLOCKED_TOOLING` when real-user interaction cannot be performed.
- The auditor verifies server-side revision, role scopes, email receipt, durable operations, external readback and cleanup separately. Successful UI toast alone is not evidence of a durable transition.

## 3. Required isolated topology and preflight authorization

Use **owner-approved nonproduction** private storage, accounts, test mailboxes, external action and network targets. Do not repurpose development preview, real credentials, customer deployment or host services without explicit authority.

~~~text
                 Approved HTTPS nonproduction Grant origin
              /          |           |              \
 ADMIN browser    REQUESTER_A     APPROVER_B       UNRELATED_C/DELEGATE_D
                                   + inbox B
                   |                 |
                   +--- Grant Web/ASGI + private SQLite ---+
                                      |                     |
                         durable mail outbox          registered webhook
                                      |                     |
                         real inbox A, inbox B          disposable integration receiver
                                                          |
                                                consume/replay/result readback

Native Control and Stellar receiver paths are intentionally outside this core topology;
they belong to the separate `EXTERNAL_INTEGRATION_ACCEPTANCE` profile and require
separately approved installations/targets.
~~~

The current self-signed `https://221.139.249.116:18443/login` preview is a **development viewing surface**, not automatically an approved external delivery/test environment. Its SMTP/worker remain off unless a separate owner-approved test installation is prepared; do not enable effects while preparing this plan.

### Preflight identity and owner-action manifest

~~~text
RUN_ID=                          START_UTC=               END_UTC=
PROFILE=                         TARGETED_SCOPE=             EXTERNAL_PROFILE_SELECTED=
REPOSITORY=                      BRANCH=                  PR=
DOCUMENT_CONTRACT_HEAD=          DOCUMENT_SHA256=         CONTRACT_DIRTY=
PRODUCT_SOURCE_HEAD=             INSTALLED_API_HEAD=      INSTALLED_WEB_SHA256=
PINNED_FOUNDATION_SOURCE=        FOUNDATION_BUNDLE_SHA256=
INSTALLED_CLI_SHA256=            DATABASE_SCHEMA_VERSION=
CORE_CONFIRMATION_HEAD=          RELEASE_PASS1_HEAD=       RELEASE_PASS2_HEAD=
TEST_ORIGIN=                     TLS_TRUST_STATUS=
MAIL_SENDER_APPROVED=            MAILBOX_A_INDEPENDENT=   MAILBOX_B_INDEPENDENT=
APPROVER_ROLE_AUTHORIZED=        ADMIN_ROLE_AUTHORIZED=
CONTROL_NATIVE_TARGET_APPROVED=  STELLAR_RECEIVER_APPROVED=
TEST_DATA_DISPOSABLE=            ROLLBACK_STORAGE_READY=
BACKUP_RESTORE_APPROVED=         DESTRUCTIVE_TEST_APPROVAL=
LOAD_PROFILE_APPROVED=           EXTERNAL_EFFECT_APPROVED=
PRE_EXISTING_REQUEST_COUNT=      PRE_EXISTING_OUTBOX_COUNT=
P0_SYSTEM_MANAGEMENT_GAPS=       WORKER_AND_SMTP_STATUS=
~~~

Preflight MUST:
1. Resolve current Grant `AGENTS.md`, `.engineering/project.yaml`, all applicable existing user-acceptance/integration/operator documents linked above, plus full current tests contract and Engineering System `USER_ACCEPTANCE`.
2. Record the currently approved source/test contract SHA, pinned Foundation artifact, installed HTML/JS/CSS and backend identity, actual schema/health; stale installed preview does not yield product-current evidence.
3. Require independent requester/approver account identities, two independent inboxes and isolated browser/session contexts for the mail/decision gate. They may be operated by the same authorized ChatGPT test executor through separate actor contexts; a fixture alias, shared inbox/session or unattended coded click does not qualify.
4. Obtain explicit written owner approval and safe rollback boundary **before** modifying host/proxy/credentials/SMTP, sending to third-party servers, performing external Control actions, using real Stellar receiver or deleting/restoring data.
5. Prepare separately namespaced disposable requests, policies, messages and credentials, avoiding shared production records. Capture baseline delivery queue and users/requests.
6. For core Full User E2E, prepare only the approved disposable generic integration boundary needed to verify Grant consume/replay/result semantics. For the separate external profile, and only when explicitly authorized, identify the native Control product-owned effect ledger and deployed Stellar receiver/version/tenant/case/alert readback.
7. Bind distinct persona contexts and confidential delivery of credentials *without* retaining plaintext values; record evidence directory 0700 and secret-bearing artifacts 0600.
8. Record missing prerequisites as exact per-scenario `BLOCKED_ENVIRONMENT`/`BLOCKED_OWNER_AUTHORIZATION`/`BLOCKED_TOOLING`. Execute remaining independently safe lanes; do not fake E2E with mocks.

## 4. Overall run sequence, failure handling, and final double-pass

1. **Surface Reconciliation gate:** On the exact candidate, perform complete `docs/SURFACE_RECONCILIATION.md` first with genuinely authorized browser role. Desktop and 320/375/390 mobile width, keyboard/focus, signed-in shell, admin task truth, actual UI links/controls and permission discrepancies. Common Foundation defects are reported to Foundation; Grant adapter/domain defects to Grant. If real login is unavailable, record the blocker and continue safe independent preflight.
2. **First persona-led discovery sweep:** Use the user goals in sections 5-12 below. Accumulate failures before modifying any source. A failed scenario stops only truly dependent or unsafe downstream work. Keep other isolated role/scenario lanes running.
3. **Source/remediation boundary:** After the sweep is exhausted, freeze findings. Repair Grant bugs in a separate scoped development phase; send common Foundation UI bugs to its project for its own versioned handoff. Do not edit a frozen installed user candidate mid-pass.
4. **Reruns:** Run affected scenarios on the actual new build/HEAD with a new trace; retain explicit superseded evidence. Do not restart the entire suite after each small fix, but any qualifying source/build change resets release PASS1/PASS2.
5. **Final Full User E2E:** After all actionable findings are closed, run **one NEW complete clean persona-led confirmation** on one frozen exact installed HEAD with fresh request IDs and isolated requester/approver account+browser+mailbox contexts. This is the ordinary FULL_USER_E2E product-quality gate.
6. **Release qualification:** release qualification requires **two NEW complete FULL_USER_E2E confirmations** on the same exact frozen HEAD, plus exact-head machine/CI/provenance. If the release claims native Control/Stellar integration support, the separate EXTERNAL_INTEGRATION_ACCEPTANCE profile must also PASS on that same candidate family. No merge, tag, production deployment or external effect follows automatically from this document.

Failure disposition while collecting: `RECORD_VISIBLE_EVIDENCE → CLASSIFY_SEVERITY → CONTINUE_INDEPENDENT_LANES`. Do not enter a source-fix loop at the first failure, do not quietly skip a user-reproducible defect, and do not repeatedly execute risky setup or external actions merely to attach another scenario label.

## 5. Mandatory real-user scenarios — first-party browser + saved state

Every applicable scenario is recorded individually, even when several share the same request. All state-changing scenarios require owner-approved disposable test records; a preview-only/protected session cannot be promoted to PASS.

### 5.1 Requester, approver and unrelated-user tasks

| ID | Acting role / business objective | User flow and mandatory authoritative outcome |
| --- | --- | --- |
| U-001 | Requester signs in for the first time | From public login find credentials/MFA flow, enter own account; server session equals requester; wrong credentials rejected without protected-data leak |
| U-002 | Requester starts first approval | Home → New Request; select actual ACTIVE policy, title/reason, integration target/action; read final Review then explicit Confirm; before Confirm no POST, after one server request ID/action fingerprint/policy version |
| U-003 | Requester fixes invalid/missing fields | Invalid active policy, missing target, unexpected JSON or stale choice displays actionable form errors; no partial request, no duplicate external ID or silent source changes |
| U-004 | Approver independently finds task | Separate browser login, My approvals Inbox; exact assigned seat/action/target/deadline, server-scoped overdue and quorum count; unrelated request not visible |
| U-005 | Approver holds an eligible request | Request Detail → Hold → inspect Review → Confirm held; prior pending unchanged before Confirm, durable HELD/revision afterwards, consume cannot commit, original deadline unchanged |
| U-006 | Approver approves the held request | Exact action/target/reviewer seat shown; Approve Review→Confirm; durable APPROVED and chosen-seat evidence; notification delivery and actual execution still separate |
| U-007 | Approver denies a different request | Deny Review→Confirm; DENIED state, requester sees explanation, no commitment/external effect permitted |
| U-008 | Requester cancels an open request | Cancel Review→Confirm; durable CANCELLED, old link/queued notification cannot restore approval; unsafe consume denied |
| U-009 | Requester replaces an earlier request | From cancelled/changes-requested Request Detail, Create replacement; fresh external ID, modified target, predecessor reference; new immutable action and new approval |
| U-010 | Approver asks for information and requester replies | Add scoped comment/INFO_REQUESTED, requester sees follow-up and responds; required approval seat remains undecided |
| U-011 | Approver requests a change | CHANGES_REQUESTED; requester navigates to fresh replacement request, old action never updated in place; chronology and link correct |
| U-012 | Current delegate acts in approved interval | Admin/approver creates bounded delegation, delegate signs in separately; only current authorized seat exposed; after revocation/expiry stale delegate denied |
| U-013 | Requests/My requests/Approvals filters | Filter lifecycle/action/date/approver, pagination/partial counts, mobile list; reset and stale GET handling show current server scope, not cached foreign rows |
| U-014 | Unrelated person attempts access | Separate member attempts request detail, approval action and admin-only routes; HTTP 403/404 as appropriate, no existence leak or unauthorized write |
| U-015 | Current session terminates | Sign out, browser back/refresh; protected data unavailable, revoked session cannot reissue decision |
| U-016 | Fresh complete end-user confirmation | After remediation, repeat all applicable user scenarios with **new isolated** Requester A and Approver B account/browser/mailbox contexts, distinct mail receipts/request IDs and no shared-session shortcut on the frozen candidate; release qualification repeats this complete confirmation twice on the same HEAD |

### 5.2 Administrator product-configuration workflows

| ID | Admin objective | Mandatory action and expected saved receipt |
| --- | --- | --- |
| A-001 | Admin signs in and finds Foundation shell | Role-correct grouped navigation, keyboard/mobile accessibility, actual nine standard System Management tasks plus Grant-owned mail tasks |
| A-002 | Manage one approved disposable account | User Management → Review create account → Confirm one POST; exact username/role, initial password absent from review/log; unrelated role denied |
| A-003 | Manage current user password/MFA and sessions | Account & Security password change, TOTP enrollment/verification/recovery codes, session list/revoke and fresh login; no global policy-editor claim |
| A-004 | Register a safe receiver | Integrations Add connection with actual approved HTTPS origin, type and tenant, decision verification minimum, separate final review; registered != connected |
| A-005 | Create single-approver and group-based policy | Verify approver/group roster, approval mode SINGLE/ANY/ALL/QUORUM/SEQUENTIAL and server accepted member order |
| A-006 | Edit and test a Draft | Full policy fields action/tenant/mode/MFA, Draft→Testing, isolated nonexecuting test, explicit Test→Activate, prove Draft alone cannot authorize |
| A-007 | Clone/version/disable policy | Clone→Draft; changed version, active selector and notification snapshot; stale save server 409, no silent lost Deny/MFA floor |
| A-008 | Concurrent two-admin edit | Two real admin sessions load same policy/template; first saves, second stale CAS fails and must Review latest; no lost update |
| A-009 | Define full event-template set | All required event types, preview safe variables, adjust branding; save Review→Confirm only if current version, no injection/script execution |
| A-010 | Send isolated admin test mail | Explicit send-to-current-admin preview, separate confirmation; transport success not actual receipt, no unapproved recipient |
| A-011 | Review delivery failures | Notification Delivery Health filters, failed event, idempotent resend review/confirm and signed transport audit, no unintended external action |
| A-012 | Issue and revoke scoped integration credential | Separate request:create, grant:consume, result:write and read-only scopes; one-time raw secret; later metadata/revoke and failed replay |
| A-013 | Examine Audit Explorer and admin history | Filter request ID/action/actor, open bounded evidence chain and permitted export; admin-read-only evidence, no secrets/unbounded disclosure |
| A-014 | Use protected Draft configuration portability | System Management Backup & Import → Integrations Diagnostics; export v2, preview mapped Draft import with explicit confirmation, no active policy or host DB restore |
| A-015 | Inspect system readiness and exceptions | Actually persisted API facts and recovery marker; missing/mocked SSL, backup, Control/Stellar, retention state shown as unknown/unavailable |
| A-016 | Verify Control-reference System Management parity | HTTPS, users, password-policy, timezone, network, retention, backup/import, audit, health each real supported View/Manage or truthful unavailable; current P0-SM gap is FAIL/OPEN until delivered by respective owner |
| A-017 | Close admin session and clean temporary records | Revoke only test-owned credentials/accounts as authorized; ensure no persistent extra admin or unsafe email sender/policy activation remains |
| A-018 | First-time administrator configures Grant end to end | Starting from normal signed-in navigation and no internal runbook, complete the canonical setup order: Accounts → Approver groups → Integrations → Notification templates → Draft policy → Test → Activate; then verify the requester sees the published request type and cannot rewrite administrator-owned routing/template/verification controls |

### 5.3 Email decision and independent PIN/OTP/MFA

Email is not equivalent to normal signed-in UI approval. Use actual independent mailboxes and distinguish transport acceptance, received email, inert link GET, required verification and final human decision.

| ID | Human mail/assurance scenario | Required independent observation |
| --- | --- | --- |
| E-001 | Requester submits eligible new request | Selected Approver B receives original request in a genuine independent mailbox; redact subject/body/token; store sender/recipient/arrival metadata and source request ID |
| E-002 | Approver B opens emailed link without Requester A's session | GET is non-mutating and shows verified target/request/seat; original request state unchanged |
| E-003 | Correct issued PIN, then Hold/Approve/Deny choice | Only bound recipient/current seat verifies; final explicit Confirm produces selected durable human vote, not just clicked link |
| E-004 | Wrong/missing/expired/replayed PIN or capability link | No decision, bounded attempts/rate limits, no token disclosure or downgrade |
| E-005 | Required OTP via approved second challenge | Fresh one-time token generation/delivery/verification; expiry/replay/recipient mismatch fail |
| E-006 | Fresh MFA/TOTP by existing account assurance | Prove fresh required factor and correct floor; same-mailbox OTP is NOT an independent factor, stale TOTP fails |
| E-007 | Raise verification floor while link is outstanding | Cannot approve at weaker old floor, version/current-floor anti-downgrade and reissue requirement enforced |
| E-008 | Change/revoke selected seat after issuance | Previously eligible person loses authority, newly selected seat receives bound intent, old link unusable |
| E-009 | Reissue/resend link and attempt old/new intent | Exactly one valid current choice, stale/expired choice rejected, delivery retry is not duplicate vote |
| E-010 | Multi-seat ALL/SEQUENTIAL quorum fanout | Correct recipients and ordering, each seat counted once, full quorum only after last authorized decision |
| E-011 | Distinct actual mailboxes A and B prove delivery custody | No aliases/one shared inbox; requester/approver mailbox identities and browser sessions are separate, and each actual received message is attributable to the correct role |
| E-012 | Delayed/failed/retried SMTP after cancellation | Stable event IDs, transport state != receipt, expired/cancelled requests do not revive |
| E-013 | Fresh final mail/decision confirmation | After remediation, use new tokens/challenges/inbox receipts/request IDs and independent browser contexts on the frozen candidate; release qualification repeats the complete confirmation twice on the same HEAD |

### 5.4 Example complete real-persona pass — one request

This is an **auditor expectation list**, not hidden command syntax to preload into a novice persona:

1. Admin has previously activated a **non-executing/sandbox policy** with correct current approver seat and verification floor. Record policy ID/version and already approved sender/receiver, without showing secrets.
2. Requester A logs in in browser context A, discovers New Request, enters exact intent and target, reads review and separately confirms. Capture the server-created request ID, immutable action fingerprint and pre-decision audit.
3. Verify the intended notification was **actually received** in independent mailbox B. Preserve redacted receipt identity and arrival timestamp; SMTP transport queue alone is insufficient.
4. Approver B independently uses browser context B or issued email intent; inspect exact proposed action/role and verification floor. Opening GET alone has no vote. For a HOLD case, select Hold then Confirm; observe HELD and rejected consume.
5. Approver reopens exact saved request and chooses Approve then Confirm, with required PIN/OTP/fresh MFA when applicable. Compare saved decision seat, server revision, current policy version and audit; no approval from the mere first click.
6. Observe the separate Grant execution-grant/consume/result state using the approved disposable integration boundary. Native Control/Stellar observation belongs to the separate EXTERNAL_INTEGRATION_ACCEPTANCE profile and is executed only when separately authorized.
7. Verify unrelated member C cannot view/decide; end all sessions, retain redacted evidence, and after remediation repeat the complete core journey once with new resources for the final clean FULL_USER_E2E confirmation.

All other Deny/Cancel/Expired/delegate/replacement/race scenarios use separate named test resources; do not mutate a previously frozen request to force another terminal state.

## 6. Local installation CLI / operator E2E — all seven real commands

Unlike the **non-destructive CLI reconciliation document**, this section uses the actual public `grant` CLI to perform safe state changes **only on an explicitly approved, newly isolated disposable installation**. Discover current public help first. Use the repository's locked toolchain, not invented commands or a test wrapper claiming to be a user. The actual public subcommands are `init`, `user-add`, `serve`, `check`, `backup`, `restore`, `recovery-resume` (seven); `--config` is global.

**Disposable example syntax** (replace operator-approved NEW private paths, use interactive confidential prompts; never paste keys/passwords into chat):

~~~sh
uv run --frozen grant --help
uv run --frozen grant --config /absolute/disposable/grant.json init --dev --origin http://127.0.0.1:8794
uv run --frozen grant --config /absolute/disposable/grant.json user-add --username e2e-admin --email e2e-admin@example.invalid --role admin
uv run --frozen grant --config /absolute/disposable/grant.json check
uv run --frozen grant --config /absolute/disposable/grant.json serve
# After confirming durable state, stop that service before the recovery exercise:
uv run --frozen grant --config /absolute/disposable/grant.json backup --output /absolute/private-backups/NEW-backup.sqlite
uv run --frozen grant --config /absolute/disposable/grant.json restore --input /absolute/private-backups/NEW-backup.sqlite --output /absolute/disposable/NEW-restored.sqlite
# Only after separately verified external reconciliation and explicit owner authorization:
uv run --frozen grant --config /absolute/disposable/restored.json recovery-resume --acknowledge-external-reconciliation
~~~

This is a contract/example, **not a command list that was executed by the assistant**. The example email invalid domain must be replaced by an approved disposable account destination before real mail scenarios. The restore step requires a separately correctly configured `restored.json` pointing to the NEW restored database and matching protected key; do not assume the CLI creates that config automatically. The `serve` process binds loopback, while HTTPS reverse proxy is separately operator-owned.

| ID | Actual operator goal / command family | Expected persisted assertion and negative check |
| --- | --- | --- |
| L-001 | Discover `grant --help`, seven command families, global `--config` and each `--help` | Correct documented grammar, no hidden server mutation during help |
| L-002 | `init` NEW isolated configuration, with `--dev` and approved origin | Private config mode 0600, fresh key, NO default user/DB, refusal on same config existing |
| L-003 | `check` before first DB and on invalid schema | Nonzero `CHECK_REFUSED` / `SCHEMA_UPGRADE_REQUIRED`, no new DB, no automatic migration |
| L-004 | `user-add` admin and member with private repeated getpass | Only requested users stored, role recognized, no password echo/dump, duplicate/short/mismatch refusal |
| L-005 | `serve` isolated loopback and normal browser login | Actual responsive Grant HTTP/HTTPS proxy as approved, PID/port identity, clean stop/restart with same DB |
| L-006 | `check` on existing versioned installation | `DATABASE=ok`, correct `PAUSED` and `SMTP` status, no writable remediation, no accidental send |
| L-007 | `backup --output` a new private filename | Same DB snapshot identity and SQLite quick_check, 0600 publication, no key leak, backup did not migrate old supported schema |
| L-008 | Backup to existing path / missing or symlink/nonregular source | Bounded `BACKUP_REFUSED`, no overwrite, no partial temp, no fabricated empty backup |
| L-009 | `restore --input --output` into NEW private DB | Sessions invalidated, delivery/consume PAUSED, saved snapshots/credentials under same key; old DB unchanged |
| L-010 | Restore invalid/duplicate/output-symlink/reserved-character path | `RESTORE_REFUSED` on bad state, no overwrite, no partial output, exact actual input filename selected |
| L-011 | `recovery-resume` without verified reconciliation; only authorized acknowledgement afterwards | No accidental resume; after separately approved explicit acknowledge restored open/uncommitted grants cancelled, uncertain committed effects UNKNOWN |
| L-012 | Reopen original and clone in isolation, inspect offboarding | Original remains unchanged, restored state/private key consistent, only disposable owned service/temp files cleaned |

**Operator integrity:** `recovery-resume` is not a UI reset button or a normal check. Do not run on actual development/customer installation just to attain CLI command coverage. Lack of explicit restore/resume authority is `BLOCKED_OWNER_AUTHORIZATION` for L-009..L-012, not reason to bypass. The command inventory still must be fully reconciled by the companion audit.

## 7. Separate External Integration Acceptance profile — native Control/Stellar

These X scenarios are **not part of core `FULL_USER_E2E` PASS**. They qualify claims that Grant is integrated with a real DataRelay Control execution boundary and/or deployed Stellar Cyber receiver. No amount of fixture Web/API testing substitutes for those independent product effects, but unavailable external owners must not prevent Grant's own requester/approver/admin product-quality loop from running to completion.

Run X-001..X-011 only under `EXTERNAL_INTEGRATION_ACCEPTANCE` when the corresponding external target/effect is explicitly authorized. For a release that advertises those native integrations, this profile becomes a separate mandatory release gate; otherwise retain `NOT_RUN_BY_SCOPE`/`BLOCKED_OWNER_AUTHORIZATION` without downgrading core Full User E2E.

| ID | Scope and actual acceptance step | Independent readback / rejection oracle |
| --- | --- | --- |
| X-001 | Approved real DataRelay Control operation registered with an existing Control-native safeguarded sender and destination | Record actual installed Control version/HEAD/target, native operation ID and immutable action hash; product-owned guard not bypassed |
| X-002 | Request without current approved human seat attempts Control execution | Existing Control operation refuses before native effect; durable destination ledger unchanged |
| X-003 | Valid approved human request triggers native Control operation exactly once | Actual Control send boundary commits single native effect, independent destination/ledger readback matches tenant/action/request |
| X-004 | Duplicate consume/retry, crash-after-effect-before-ACK, restart | Identical replay doesn't create second business effect; uncertain result reconciled against native operation ledger |
| X-005 | DENIED, HELD, EXPIRED, CANCELLED or stale delegated approval attempts execute | Every case rejected by Control-side enforcement, not Grant helper-only warning |
| X-006 | Stellar Cyber delivered receiver is connected to approved test tenant/case/alert | Log deployed Stellar version/config and supported receiver route, actual tenant/case/alert correlation, signed destination record |
| X-007 | APPROVED/DENIED case event reaches Stellar and is actually ingested | Independent native Stellar search/readback confirms exact event identity/state; no acceptance from an echo/HMAC fixture alone |
| X-008 | Forged, stale, malformed, duplicated, feedback-origin or wrong-tenant outcome received | Native/Grant ingress rejects or deduplicates as contracted; no self-triggering feedback loop |
| X-009 | Delayed/failed sender retry followed by restoration | Event IDs stable, error/backoff shown, no new human approval or business effect created |
| X-010 | Mail transport to independent recipient | Received original and final decision mails in actual unrelated mailboxes, not just SMTP 250/HTTP 200 |
| X-011 | External cleanup of authorized test-owned effects | Native observer confirms no unapproved residue; never delete production records to satisfy cleanup |

For all X rows capture `ORIGIN_PRODUCT_VERSION`, `EFFECT_TARGET_APPROVAL`, `REQUEST_ID`, `ACTION_HASH`, `CONSUME_ID`, `NATIVE_OPERATION_ID`, `EXTERNAL_LEDGER_ID`, `RECEIVER_TENANT_CASE_ALERT`, timestamp and independently witnessed result; redact secrets, IPs/customer identifiers when inappropriate.

## 8. Mandatory negative, incident, privacy and recovery cases

| ID | Injected *approved/disposable* fault or user mistake | Required safe behavior |
| --- | --- | --- |
| S-001 | Wrong role / unrelated member / self-approval / integration-token approval | Server denies with no request existence or human-seat privilege escalation |
| S-002 | Stale policy edit from another administrator | Atomic 409/CAS, unchanged saved policy/template and explicit reload/re-review |
| S-003 | Duplicate request external ID, rapid Confirm, ambiguous timeout | At most one durable request/decision, operator must reconcile instead of auto-resubmit |
| S-004 | Mutate immutable action/tenant/source between review and submit | Block or force new request, never silently carry approval to changed action |
| S-005 | Expired approval seat and reminder deadline race | No post-deadline approve, monotonic server expiry, no browser-clock privilege |
| S-006 | Cancellation vs consume race | Exactly one permitted outcome, no work executed without pre-commit valid grant |
| S-007 | Revoke/deactivate credential during external attempt | Later scopes denied, no unaudited reuse or raw-secret leak |
| S-008 | Link/PIN/OTP/TOTP tamper, replay, brute-force limit | No decision, bounded/recorded failures, no weakening assurance floor |
| S-009 | Browser refresh/logout while confirmation pending | No extra POST; ambiguous result requires fresh authoritative read |
| S-010 | Wrong host/tenant/case/alert and callback URL redirect | Registered destination and TLS/tenant authority enforced, no arbitrary external send |
| S-011 | Oversized, malformed, duplicate-key, nonfinite, nested feedback JSON | Bounded refusal and audit; no state corruption or event amplification |
| S-012 | SMTP unavailable/retrying, webhook HTTP timeout, duplicate queue attempt | Stable bounded retries, explicit FAILED/UNKNOWN, no human-approval or execution claim |
| S-013 | DB filesystem permission failure, symlink/nonregular file, no free space | Private storage refusal, no insecure publication, no stack trace/secret contents |
| S-014 | Backup source wrong name/URI reserved chars/missing PAUSED marker | Exact source integrity and new-path output guard, no partial restore |
| S-015 | Restart during reserved consume/outbound send | Lease reconciliation, idempotent replay and UNKNOWN preserved; no duplicate effect |
| S-016 | Recovery-paused installation attempts send/consume/resend | Fail closed until explicit separately approved reconciliation/resume |
| S-017 | Incompatible backup/version or old v8 schema | Read-only check refuses implicit migration, protected pre-upgrade snapshot, isolated v8→v15 upgrade regression |
| S-018 | Missing Foundation package/incorrect pinned bundle/Web assets | Exact-head staging/CI failure, no fake fallback to incompatible shared UI |
| S-019 | Admin System Management unsupported task clicked | Honest unavailable/read-only messaging, not a dead Manage button; raise outstanding P0-SM defect |
| S-020 | Mobile/keyboard/no JS accessible labels | No hidden essential confirmation, wrong focus, horizontal overflow or screen-reader ambiguity |
| S-021 | Unauthorized CSV/JSON audit export or oversized query | Role-scoped bounded/redacted output and no partial secret disclosure |
| S-022 | Service offline, expired session, stale inbox GET | Recoverable public error; no ghost verified counts, stale/foreign request or misleading healthy status |
| S-023 | Invalid Draft-only import mapping/conflict/version | Preview blocks, no policy activation or secret transfer, no partial import |
| S-024 | Unrecognized legacy/hidden CLI aliases/options | Help/parser errors nonzero with correct public guidance; no undocumented privileged grammar |

Only faults wholly contained in approved disposable resources may be injected. Never break a live customer SMTP, firewall, DNS, certificate, production database or Control/Stellar tenant to satisfy a test. When environment control is unavailable, mark specific S row blocked and continue independent tests.

## 9. Concurrency, repetition, load and post-stress functional truth

An otherwise passing single approve/deny is not sufficient. User actions, backend queues and native effects may race; verify **durable no-duplicate effects and truthful current-seat/readback** under concurrent load. Explicitly bound test rates/CPU/storage/tenants before executing.

### 9.1 Concurrent real-behavior scenario matrix

| ID | Simultaneous case | Oracle |
| --- | --- | --- |
| C-001 | Two administrators edit same policy/template/group revision | One commits, other CAS/409 and review required; no lost update |
| C-002 | Same selected approver opens twice/confirms concurrently | Exactly one seat decision and one audit outcome |
| C-003 | Two different valid quorum reviewers confirm nearly together | Correct ANY/ALL/QUORUM/SEQUENTIAL state, no skipped seat |
| C-004 | Requester cancel races with approver decision/consumer commit | Transactional winner honored, rejected contender cannot produce extra work |
| C-005 | Multiple email PIN/OTP/reissue confirmations for same bound seat | No replay or weaker verification, at most one current decision |
| C-006 | Concurrent consume retries and result reports, native crash simulation if approved | Single execution claim/effect, result bound to correct action/tenant |
| C-007 | Many notification callback retries including receiver restart | Same event identity, idempotent delivery/reconciliation, no mail-execution conflation |
| C-008 | Multiple independent browser users/filter changes while list GETs complete out of order | Latest query/scope shown, no cross-user disclosure or wrong empty state |
| C-009 | Recovery/backup attempt while operations are paused or recovering | Existing pause/safety guards, isolated restore evidence and no reopened spent grants |
| C-010 | Final clean confirmation and release-repeat identity | Ordinary Full User E2E performs one fresh complete clean confirmation on the frozen HEAD; release qualification performs a second complete confirmation on that same HEAD/build with new requests/mail/session contexts |

Every concurrency assertion records chosen isolation method, role identities, starting revision, overlapping timestamps, winning server revision and independent durable row count. Failures must remain repeatable without uncontrolled product cleanup.

### 9.2 Measured functional performance and endurance

| ID | Workload and observable metrics | Required functional invariant |
| --- | --- | --- |
| P-001 | Browser login/new-request/confirmation baseline latency p50/p95/p99 | Auth roles correct, request created once |
| P-002 | Reviewer Inbox/policy filtering with growing isolated request history | Current-seat/latest-query truth, bounded pagination |
| P-003 | SMTP notification fanout across authorized approver group | Per-recipient delivery IDs, no unapproved recipient |
| P-004 | Many parallel human request/decision attempts from distinct disposable identities | No cross-user/tenant leak, no duplicated same seat |
| P-005 | Grant consume/replay contention against the disposable integration boundary | One fresh Grant commitment per execution ID/action hash, stable replay semantics and no duplicate receiver-side fixture effect; native Control effect-once belongs to X scenarios |
| P-006 | Callback retry/timeout/delay after simulated receiver restart | Durable queue bounded, correct eventual state |
| P-007 | Create/approve/cancel during read-heavy audit and health polling | No lost audit events, user-visible commands remain responsive |
| P-008 | Longer controlled idle session and worker soak within approved budget | Bounded memory/process growth, no auto sign-in bypass |
| P-009 | Function-under-load collision: policy CAS + request create + mail retry | No stale policy downgrade or changed immutable action |
| P-010 | Stop stress and restart checked disposable service | Recoverable verified state, no orphan temp/extra send, normal short user journey still PASS |

Performance results include actual rates, p50/p95/p99, error counts, resource pressure, queue age and post-stress recovery. **Do not invent numeric SLOs**; when no accepted SLO exists label `MEASURED_NOT_NUMERICALLY_QUALIFIED` instead of claiming performance PASS. Functional safety under load is mandatory even without a numeric SLO. Saturation/long soak require explicit approved host and load budget; otherwise mark those scenarios `BLOCKED_OWNER_AUTHORIZATION`.

## 10. Foundation UI, device/keyboard, Grant domain UX and product parity

**Common UI ownership:** Foundation common login, Product Shell, navigation, System Management composition, iconography, shared cards and components are verified on Grant's **pinned installed Foundation release**, but **repaired by the Foundation project**. Grant's own integration must consume a reviewed Foundation handoff and wire real product APIs. Do not duplicate Foundation implementation inside Grant to make screenshots look similar.

| ID | User-facing observable test | Expected qualified outcome |
| --- | --- | --- |
| V-001 | Login desktop 1280, 390, 375 and 320 width | Sign-in form visible without scrolling past help; proper field labels, errors and MFA/recovery; no horizontal overflow |
| V-002 | ProductShell desktop navigation, collapse/expand and mobile drawer | Home/My work/Configuration/Administration and Account & Security reachable with keyboard, focus and active-route clarity |
| V-003 | Home → New Request → Approvals → Request Detail | Prominent next actions, numbered workflow, explicit review/final confirm, current server status and role-scoped queue |
| V-004 | Policies/group/Notification/Integration workspace on mobile | Same scoped records and enabled actions as desktop; cards/tables do not invent data or eliminate controls |
| V-005 | System Management reference vs actual Grant | Correct nine core task names, current support/read-only/unavailable truth, product-specific Mail & Notifications; missing real backend actions remain P0 Gap |
| V-006 | Approve/Deny/Hold on keyboard and screen reader | Selection does not POST before separate confirmation, readable exact action/reviewer seat and correct focus return |
| V-007 | Error/loading/zero records and unsupported controls | No green 0 before GET, no stale success after error, no fake "Manage" or backend-less DNS/TLS/retention toggle |
| V-008 | Themes/different zoom/touch targets | Foundation-supported interactions maintain contrast/readable density; Grant-specific issue vs shared upstream owner distinguished |

Record per viewport actual browser+OS build, screenshot location/hash, keyboard sequence and accessibility observation; a static image may illustrate UI but cannot prove a linked button operates correctly.

## 11. Mandatory test evidence, result ledger and trusted state

Use a unique private directory, distinct from code and private customer state:

~~~text
e2e-reports/grant-full-user-e2e-<UTC-RUN_ID>/
  run.env
  preflight/contract-source-installed.txt
  preflight/approved-destinations-and-personas-redacted.txt
  preflight/clean-and-disposable-state.txt
  personas/admin/*.txt
  personas/requester-a/*.txt
  personas/approver-b/*.txt
  personas/unrelated-c/*.txt
  personas/delegate-d/*.txt
  operator/cli/*.txt
  browser/desktop/*.png
  browser/mobile/*.png
  mailbox/receipt-redacted/*.txt
  native-control/effect-ledger-redacted/*.txt
  stellar/receiver-readback-redacted/*.txt
  requests/action-and-revision-evidence/*.txt
  recovery/disposable-db-hash-and-pause.txt
  performance/approved-profile-and-results.tsv
  ledgers/scenario-results.tsv
  ledgers/feature-command-coverage.tsv
  ledgers/persona-sessions.tsv
  ledgers/external-evidence.tsv
  ledgers/findings.tsv
  ledgers/execution-lanes.tsv
  cleanup/owned-resources.txt
  summary.txt
  final-confirmation.txt
  release-pass1.txt              # only for RELEASE_QUALIFICATION
  release-pass2.txt              # only for RELEASE_QUALIFICATION
  final-report.txt
~~~

All run/test/evidence paths are templates until an authorized E2E run creates them. Mode 0700 for private directories, 0600 for secret-adjacent files; keep evidence outside Git. Redact actual login names/email personal content, raw credentials, API keys, bearer tokens, PINs, full email capability URL, MFA secrets/recovery codes, sensitive host/customer addresses, ciphertext/private SQLite backups, and unredacted traces. Prefer SHA256, normalized timestamps, role ID and separately witnessed nonsecret response IDs.

Canonical TSV schemas:

- `scenario-results.tsv`: `SCENARIO_ID, PROFILE, APPLICABLE, MANDATORY, CONFIRMATION_ID, ACTING_PERSONA, PERSONA_EXECUTION_MODE, PRECONDITION, USER_RESULT, ACTUAL_SERVER_STATE, EXTERNAL_RESULT, FINAL_RESULT, BLOCK_REASON, EVIDENCE`.
- `feature-command-coverage.tsv`: `FEATURE_ID, CLI_ID_OR_WEB_API, SCENARIO_IDS, EXPECTED_VARIANTS, EXECUTED_VARIANTS, NEGATIVE_COVERED, READBACK, RESULT, EVIDENCE`.
- `persona-sessions.tsv`: `PERSONA_ID, ACCOUNT_ID_REDACTED, BROWSER_CONTEXT_ID, INBOX_ID_REDACTED, ACTOR_ISOLATION, KNOWLEDGE_ISOLATION, HEAD, AUTH_RESULT, START_UTC, END_UTC, EVIDENCE`.
- `external-evidence.tsv`: `PRODUCT_KIND, VERSION, REQUEST_ID, ACTION_HASH, OPERATION_OR_EVENT_ID, TENANT_CASE_ALERT_REDACTED, DESTINATION_READBACK, EFFECT_COUNT, RESULT, EVIDENCE`.
- `findings.tsv`: `FINDING_ID, SEVERITY, USER_BLOCKING, OWNER_REPO, STATUS, SCENARIO_IDS, REPRODUCER, READBACK_DIFF, EVIDENCE, FIX_HEAD, RERUN_ID`.
- `execution-lanes.tsv`: `LANE_ID, PERSONA, DEPENDENCIES, START_UTC, END_UTC, RESOURCE_PREFIX, RESULT, EVIDENCE`.

For core `FULL_USER_E2E`, every mandatory row from **U-001..U-016, A-001..A-018, E-001..E-013, L-001..L-012, S-001..S-024, C-001..C-010, P-001..P-010, V-001..V-008** must have one final disposition in the clean confirmation, including BLOCKED/NOT_APPLICABLE/NOT_RUN where allowed by the profile. This is **111 indexed core scenarios**. `EXTERNAL_INTEGRATION_ACCEPTANCE` separately dispositions **X-001..X-011**. The combined matrix is 122 indexed scenarios. A supported capability discovered during execution must be added, not omitted to keep the counts green. The auditor computes all counts **from these ledgers**, not from prose or memory.

For the existing `tools/user_acceptance_contract.py` FULL_USER_E2E evidence schema, `real_effect_coverage_pct=100` means all **core Grant effects required by this profile** were directly observed: durable request/decision/policy/session/recovery state, actual designated mailbox receipt where required, and disposable integration consume/replay/result behavior. It does **not** claim native Control or Stellar effects. Those are recorded and qualified only by the separate X-profile ledger/report.

A scenario's evidence must show:
1. role/persona mission, legitimate starting knowledge and product URL/head;
2. public path/CLI action actually taken by the persona with timestamp, including the visible guidance/error used for the next step;
3. pre-state and exact immutable identifiers (request ID/action hash/current seat/policy version or CLI database schema);
4. expected vs observed UI, server durable readback and *independent* mailbox/native effect when applicable;
5. negative/timeout/replay/recovery observation;
6. status, severity and owning project if there is a finding;
7. screenshot/log/artifact hashes and redacted custody trail;
8. cleanup/termination of only authorized test-owned resources.

If summary counts disagree with evidence (`REPORT_CONSISTENCY_FAIL`), regenerate from ledgers; do not edit underlying evidence to match a preferred PASS. Existing API fixture pass, local Chromium pass, Web unit and official CI are separately labeled `SUPPORTING_AUTOMATED_EVIDENCE`, not a persona-led public-surface/native-effect scenario.

## 12. Status, finding severity, blockers and acceptance

Each scenario must use exactly one final state:

- `PASS`: observed on the exact allowed installed build by the stated persona-led public-surface actor (ChatGPT or owner-selected tester) with requisite durable/nonsecret independent evidence.
- `FAIL`: expected supported product behavior failed; real product defect.
- `PARTIAL`: only some assertions executed/verified; blocks Full PASS.
- `FAIL_PRECONDITION`: same-run required product behavior has already failed, so dependent scenario cannot pass; link prior failure.
- `BLOCKED_ENVIRONMENT`: required real mailbox, approved TLS, native external product/port or disposable resource absent.
- `BLOCKED_OWNER_AUTHORIZATION`: host/security/external effect/delete/recovery/load not authorized.
- `BLOCKED_TOOLING`: genuine user action cannot be completed with permitted tooling; do not reroute denied credential/browser effects.
- `STALE_CANDIDATE`: observed installation does not match exact candidate, correlation only.
- `INVALIDATED_BY_CONCURRENT_STATE`: another test lane changed preconditions; rerun isolated.
- `NOT_APPLICABLE`: documented feature/platform does not exist in the supported candidate, **with product authority evidence**; cannot excuse a newly promised feature gap.
- `NOT_RUN_BY_SCOPE`: only for a user-explicit TARGETED scope, never a Full PASS.
- `MEASURED_NOT_NUMERICALLY_QUALIFIED`: approved functional performance metrics collected but no accepted numeric SLO.

Severity:
- **P0:** unauthorized approval/execution, role/tenant bypass, stolen credential/secret, duplicate native effect, data loss, unsafe restore/retention. Immediate release blocker and safety stop for the affected lane.
- **P1:** nonfunctional advertised workflow, lost-update/atomicity, email decision verification failure, incorrect current approver, external product readback defect. Release blocker.
- **P2:** user-blocking task discovery/focus/mobile/status/error guidance, misleading supported/unavailable state, Foundation product parity. User-blocking P2 is release blocker.
- **P3:** non-blocking UI polish or wording, triaged with reason and owner.

A blocked tool or missing owner authorization is **not a Grant product failure**, and not PASS. A source-implemented-but-not-user-tested capability is `NOT_RUN`, never "fully verified".

## 13. Final all-suite confirmation, exit gates and cleanup

**A final FULL_USER_E2E PASS is prohibited unless ALL apply:**

1. Every applicable **core** mandatory scenario actually executed on the correct installed candidate and has persona evidence plus durable state proof; no unresolved core FAIL, PARTIAL, BLOCKED or invalidated row.
2. Requester and approver use independent accounts, browser/session contexts and two independent mailboxes with no cookie/account impersonation, scripted-user substitution or shared-inbox shortcut. ChatGPT may operate the isolated personas; separate owner/human UAT does not replace this gate.
3. The first-time administrator completes the canonical configuration chain Accounts → Approver groups → Integrations → Notification templates → Draft policy → Test → Activate, and a requester then consumes the published request type without administrator routing authority.
4. Real designated email is received and required PIN/OTP/fresh MFA/current verification floor/reissue/replay behavior is verified for applicable policies.
5. Grant's own approval/execution boundary is truthful: approval, consume/replay and reported result are distinct; generic disposable integration evidence never claims native Control/Stellar execution.
6. CLI lifecycle and versioned private backup/restore are safely checked on disposable private state; no active/customer path is overwritten and no unsafe unauthorized `recovery-resume` occurs.
7. Mandatory negative, race, recovery and approved functional-under-load assertions confirm no duplicate human decision, role leak, stale-policy overwrite or durable corruption.
8. Foundation common UI matches the pinned accepted package; Grant-specific policy/ACL/MFA/Admin task destinations work or truthfully show unavailable, with no unresolved core user-blocking defect.
9. Findings P0=0, P1=0 and user-blocking P2=0; no undispositioned actionable UX issue. Native repository tests/CI and explicit product provenance match the frozen candidate.
10. Evidence ledgers reconcile to summary; each persona has real evidence; runtime/test-contract identities are retained; cleanup PASS.
11. One brand-new **complete clean confirmation** passes after the final remediation on the frozen HEAD. Two same-HEAD complete confirmations are required only by `RELEASE_QUALIFICATION`.
12. Native Control/Stellar X-scenario status is reported separately and cannot be mislabeled as core Grant E2E evidence. Release/merge/production remain separately **not authorized** until the owner explicitly accepts qualifying results and required release gates.

**Offboarding:**
- Stop only approved test-owned CLI/service/SMTP/HTTP processes. Never kill an unrelated dev preview, clean another worktree, delete customer objects or destroy existing recovery evidence.
- Revoke only created disposable credentials and close sessions after checking their pending approvals/delivery; do not remove an effect ledger needed for audit or re-execute a protected action to clean it.
- Verify no orphan test mail queue senders, native external side effects, private temporary files or leaked tokens. Restore approved sandbox baseline through public documented safe rollback—not an unapproved database overwrite.
- Record `CLEANUP_RESIDUE_COUNT=0` where actually observed; if external test-owned effects remain, list exact owner action and mark cleanup blocked.
- Preserve immutable/redacted evidence and actual source/contract/build hashes. Report aggregate findings to the EXISTING Grant Roadmap #37 / Work Packet #67 **once after the pass**, not mid-sweep.

### Mandatory final report fields

~~~text
PHASE=FULL_USER_E2E
EXECUTOR=CHATGPT_CHAT|OWNER_PERFORMED_WITH_CHATGPT_AUDIT
RUN_ID=
TEST_PROFILE=FULL_USER_E2E|TARGETED_USER_E2E|DISPOSABLE_PRODUCT_E2E|EXTERNAL_INTEGRATION_ACCEPTANCE|RELEASE_QUALIFICATION
DOCUMENT_CONTRACT_HEAD=
DOCUMENT_SHA256=
PRODUCT_SOURCE_HEAD=
INSTALLED_WEB_AND_API_MATCH=
PINNED_FOUNDATION_SOURCE=
CURRENT_SCHEMA_VERSION=
CORE_CONFIRMATION_HEAD=
RELEASE_PASS1_HEAD=
RELEASE_PASS2_HEAD=
QUALIFIED_HEAD=
INDEPENDENT_ACCOUNTS_MAILBOXES_AND_SESSIONS=
PERSONA_EXECUTOR=CHATGPT_CHAT|OWNER_SELECTED_TESTER
PRIMARY_USER_EVIDENCE_MODE=PERSONA_LED_PUBLIC_UX
USER_USE_CASE_COVERAGE=
SCRIPTED_USER_SCENARIO_EXECUTION_COUNT=
AUTOMATED_HARNESS_USER_SUBSTITUTION_COUNT=
AUDITOR_KNOWLEDGE_LEAK_COUNT=
REAL_SIGNED_IN_BROWSER_EVIDENCE=
REQUESTER_APPROVER_AND_UNRELATED_ROLES=
CLI_COMMANDS_EXECUTED_AND_VARIANTS=
PUBLIC_UI_AND_API_FEATURE_COVERAGE=
FIRST_TIME_ADMIN_SETUP_TO_REQUESTER_HANDOFF=PASS|FAIL|BLOCKED
CORE_SCENARIO_COUNTS=111
EXTERNAL_SCENARIO_COUNTS=11
SOURCE_VS_RUNTIME_MISMATCH_COUNT=
SYSTEM_MANAGEMENT_P0_GAPS_OPEN=
REAL_SMTP_INBOX_RECEIPT=
EMAIL_PIN_OTP_FRESH_MFA=
EXTERNAL_INTEGRATION_ACCEPTANCE=PASS|PARTIAL|FAIL|BLOCKED|NOT_RUN_BY_SCOPE
NATIVE_CONTROL_EFFECT_ONCE=PASS|FAIL|BLOCKED|NOT_RUN_BY_SCOPE
NATIVE_CONTROL_INDEPENDENT_READBACK=PASS|FAIL|BLOCKED|NOT_RUN_BY_SCOPE
REAL_STELLAR_RECEIVER_READBACK=PASS|FAIL|BLOCKED|NOT_RUN_BY_SCOPE
FUNCTIONAL_NEGATIVE_AND_RECOVERY=
CONCURRENT_SCENARIO_COVERAGE=
FUNCTION_UNDER_LOAD=
PERFORMANCE_NUMERIC_QUALIFICATION=PASS|FAIL|MEASURED_NOT_NUMERICALLY_QUALIFIED
ALL_MANDATORY_SCENARIOS_DISPOSITIONED=
SCENARIO_COUNTS_FROM_LEDGER=
UNRESOLVED_P0=
UNRESOLVED_P1=
UNRESOLVED_USER_BLOCKING_P2=
EVIDENCE_LEDGER_SCHEMA=
SUMMARY_DERIVED_FROM_LEDGER=
REPORT_CONSISTENCY=
CLEANUP_RESIDUE_COUNT=
CI_AND_PROVENANCE_AT_QUALIFIED_HEAD=
BLOCKED_SCENARIO_IDS_AND_REASONS=
FULL_USER_E2E=PASS|PARTIAL|FAIL|BLOCKED
RELEASE_QUALIFICATION=PASS|PARTIAL|FAIL|BLOCKED|NOT_RUN
RELEASE_AUTHORIZED=NO|EXPLICIT_OWNER_APPROVAL_REFERENCE
EVIDENCE_ROOT=
NEXT_ACTION=
~~~

**Minimal future execution order:** run the non-destructive feature/public-surface reconciliation first when appropriate; resolve legitimate independent Grant accounts/inboxes and disposable Grant integration state; run `Surface Reconciliation`; execute first-time administrator setup and requester/approver black-box persona journeys; continue all independent core scenarios to exhaustion; freeze findings; remediate only after the sweep; rerun affected scenarios; then run one brand-new exact-HEAD complete clean Full User E2E confirmation. Only release qualification repeats the complete confirmation twice. Run native Control/Stellar external acceptance separately when that integration claim is in scope and authorized. Owner visual/UAT and release authorization remain separate. **Do not execute these steps merely because this document has been authored.**

## 14. Relationship to CLI Feature/Scenario Reconciliation and release

These two contracts deliberately prove different things:

~~~text
CLI_FEATURE_SCENARIO_RECONCILIATION
= runtime non-destructive workflow-contract coherence
= every supported capability has a current, discoverable, role-correct public lifecycle
= first-time-user black-box discovery before source/auditor reconciliation

FULL_USER_E2E
= live persona-led Grant core product behavior on approved disposable/nonproduction state
= actual administrator setup + requester/approver create/hold/approve/deny/cancel/deliver/restore/recover flows
= real independent inbox evidence, Grant consume/replay/result semantics, concurrency and negative recovery
= does not self-claim native Control/Stellar acceptance

EXTERNAL_INTEGRATION_ACCEPTANCE
= separately authorized native DataRelay Control effect-once/readback + deployed Stellar receiver verification
= required only when qualifying those external integration claims
~~~

Neither substitutes for the other. On the same exact supported candidate:

~~~text
CLI_FEATURE_SCENARIO_RECONCILIATION=PASS
FULL_USER_E2E=PASS
=> PRODUCT_QUALITY_CLOSURE=PASS
=> NO_KNOWN_IN_SCOPE_PRODUCT_OR_WORKFLOW_DEFECTS=YES
~~~

`PRODUCT_QUALITY_CLOSURE=PASS` means the Grant core product/public workflow has no known in-scope actionable defect under these two contracts. It is **not** proof of native Control/Stellar integration and **not** a release declaration. Merge, tag, production deployment, destructive host changes, real external effects, external-integration claims, and owner acceptance remain separately governed.

## Appendix — planned P0-ET visual email editor checks (2026-10-14; NOT RUN)

The owner requested a researched roadmap for editable approval-mail wording
and button design. `docs/EMAIL_TEMPLATE_EDITOR_RESEARCH_20261014.md` §8
contains ET-T01–ET-T24 proposed acceptance checks covering same-render
HTML/text/preview, protected decisions/PIN, mode-correct guidance, draft/CAS/
publish/immutable snapshots, actual email-client rendering, offline/security
and legacy compatibility. Map these to A-009/A-010, E-001–E-013 and V-001–V-008
when their implementation exists; add explicit run-ledger rows then. This
appendix does not change the current 122-scenario combined registry (111 core + 11 external) or claim any test
executed. Real mail delivery, independent account/inbox/session evidence and
owner-gated native-effect gates still require their applicable prerequisites.
Foundation shared UI defects stay upstream.
