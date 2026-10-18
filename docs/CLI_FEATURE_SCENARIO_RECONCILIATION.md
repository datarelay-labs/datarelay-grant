# DataRelay Grant 1.0 — Feature ↔ Public Surface ↔ Operator Workflow Reconciliation

> **Role:** Canonical NON-DESTRUCTIVE feature ↔ public CLI/Web/API ↔ first-time operator workflow reconciliation contract for Grant (not the Full User E2E run). The filename stays stable for DRLink-family trigger compatibility even though Grant is Web-first.
> **Repository:** `datarelay-labs/datarelay-grant`; **path:** `docs/CLI_FEATURE_SCENARIO_RECONCILIATION.md`.
> **Companion:** `docs/FULL_USER_E2E_SCENARIOS.md`, `docs/FULL_USER_E2E.md`, `docs/USER_SCENARIOS.md`.
> **Baseline when drafted:** Grant Draft PR #100 at `e07e8864b14b7c30ae4c65ec2d563525ca05533d`; pin the *actual current* HEAD again at run time. Document content is not execution evidence.
> **Design reference:** Adapted from the current DRLink canonical contract resolved through `/home/aella/datarelay-link-current`: `datarelay-labs/datarelay-link/docs/CLI_FEATURE_SCENARIO_RECONCILIATION.md`, source HEAD `a26c6465730dc388590113aa1967191b109f75b2`, file SHA256 `dc9cc07fa685ee66e4bc23a70c4c479771a7e8811beaec390f0c9192e3fac558`. Preserve its test intent and persona/evidence discipline, not DRLink-specific Server/Agent commands.
> **Owner boundary:** Foundation shared UI is developed in the Foundation project. This audit records Foundation/Grant interface defects and sends them to the correct owner; it must not fork, redesign or implement Foundation UI in Grant.
> **Status:** NORMATIVE TEST CONTRACT / NOT EXECUTED ON THE CURRENT CANDIDATE. Release and Full User E2E remain separate.

## 1. Trigger, authority and success question

A request for "Grant CLI 기능 시나리오", "CLI 기능 시나리오 연계 테스트", "Feature CLI Scenario reconciliation" or this exact document is an instruction to **execute this audit** unless the user explicitly asks only to write/review a plan. An unqualified "Full User E2E" runs the companion document instead.

**Question:** Can a first-time Grant user/operator discover *every genuinely supported Grant capability*, choose the correct public CLI or Web/API route, understand the complete safe lifecycle, and recover from mistakes—without undocumented internal calls, hidden syntax, memorized implementation knowledge, false success messages, mismatched role permissions or misleading Foundation task badges?

The first audit is **read-only against any already-running Grant installation**. All state-changing command spellings, policy writes, credential issuance, mail sends, restores, owner-controlled Control/Stellar callbacks, and host security settings are **discovery/source/isolated-test evidence only**. This differs intentionally from Full User E2E, which requires explicitly designated disposable systems and real authorized actions.

Authority in descending order:
1. Current explicit owner instructions, actual repo `AGENTS.md` and `.engineering/project.yaml`.
2. `docs/PRODUCT_STANDARD.md` (product behavior) and `ROADMAP.md` (priority); `docs/FOUNDATION_SYSTEM_MANAGEMENT_PARITY_20261014.md` for open cross-product administration gaps.
3. Installed exact-HEAD first-party public CLI/help, UI, API contract, observed role behavior; original tested Grant source.
4. `docs/OPERATIONS.md`, `docs/INTEGRATION.md`, `docs/USER_SCENARIOS.md` and `docs/G11_EXTERNAL_ACCEPTANCE.md`.
5. Legacy/historical reports for comparison **only**, never current acceptance.

A feature intentionally operated through Web/API **does not require a fabricated CLI counterpart**. Mark `WEB_API_ONLY_JUSTIFIED` when this is supported by the product standard and is actually accessible. Conversely a CLI-only lifecycle action (e.g., local database restore) must not be called available in Web.

## 2. Run ownership, independence, exact candidate and safety

- **Executor:** ChatGPT acting as a first-time installation operator and a separately reasoned source auditor; both lanes documented. The acting operator uses public `grant --help`, command help, visible status/errors, and permitted read-only output before receiving internal source enumeration. A script that replays a fixed command list does not qualify as persona discovery. Scripts may audit file/coverage inventory *after* the public discovery evidence is frozen.
- **Audit vs test environment:** Don't change a live DB, user, approval policy, credential, sender, listener, reverse proxy, token, service, network or mailbox. No state-changing endpoint/CLI invocation as a probe, including `init`/`user-add`/`serve`/`restore`/`recovery-resume`. Even `backup` creates an artifact and is not run on the assigned live installation as part of this audit. Prove these paths through safe help and existing isolated deterministic tests. `check` only on an assigned authorized existing installation; it is deliberately read-only and cannot bootstrap a missing DB.
- **Safety denial:** Prior platform-denied fixture-password extraction or detailed authenticated browser DOM operations must not be retried or routed through a different tool/host. Use safely permitted public UI, actual independently authorized sessions, or mark `BLOCKED_TOOLING`.
- **Single active audit:** Reserve a unique private `e2e-reports/grant-cli-reconciliation-<UTC-RUN_ID>/` with mode 0700 and a coordination lock containing run ID, PID/owner, UTC, HEAD and document SHA256; don't replace a live lock. Keep evidence 0600 when sensitive. No lock acquisition merely to prepare this document.
- **Snapshot:** Record `RUN_ID`, `TEST_CONTRACT_HEAD`, `TEST_CONTRACT_SHA256`, `TEST_CONTRACT_DIRTY`, `PRODUCT_SOURCE_HEAD`, branch, worktree, pinned Foundation source/bundle, mounted Web build identity, API/CLI binary identity, `INSTALLED_HEAD_MATCH`, exact target, test persona, roles, existing read-only authority and blocked effects. Dirty G12 or other unrelated worktree state must be reported, preserved and excluded from staging/cleanup.
- If an installed runtime is stale/missing, classify `STALE_RUNTIME_CORRELATION_ONLY` / `BLOCKED_RUNTIME_UNAVAILABLE` and continue public parser, source, documentation and offline-test inventory. An unauthorized or uninstalled external Control/Stellar target is `EXTERNAL_GATE_PENDING`, not a successful integration.
- Run independent read-only lanes in parallel when they do not share TTY, private temp paths, mutable fixture or a risky test target. No redundant full CI/build/release work is part of this non-destructive audit.

## 3. Public CLI command inventory — zero invented commands

Discover directly from the actual candidate root `uv run --frozen grant --help` and individual `--help`. The currently implemented argparse interface (`grant/cli.py`) has **exactly seven subcommands**:

| CLI-ID | Public command family / accepted flags | Contract and role | Live audit action |
| --- | --- | --- | --- |
| CLI-00 | `grant [-h] [--config CONFIG] <command>` | Local installation command discovery; default config `.dev/config.json`; no remote CLI implied | Run `--help`, inspect flag scopes |
| CLI-01 | `init [--origin ORIGIN] [--dev]` | NEW private config with key; owner/operator, no users created and no existing-file overwrite | `--help` only; isolated init covered in Full E2E |
| CLI-02 | `user-add --username --email [--role admin|member]` | Local interactive secret handling; persists first user; no default account | `--help` only; never harvest fixture credentials |
| CLI-03 | `serve` | Existing installation ASGI listener bound to 127.0.0.1; TLS deployment proxy is separate | `--help`/source only; don't start an extra server |
| CLI-04 | `check` | Read-only existing DB/schema/recovery-pause/SMTP inspection; missing/old DB must fail closed | Existing authorized runtime read only if safe |
| CLI-05 | `backup --output NEW_PATH` | SQLite-consistent private new-path artifact; preserve key separately; no implicit upgrade | `--help` and isolated negative tests only |
| CLI-06 | `restore --input EXISTING_BACKUP --output NEW_DB` | NEW SQLite destination, sessions clear, delivery/consume paused, no overwrite | `--help` and isolated tests only |
| CLI-07 | `recovery-resume [--acknowledge-external-reconciliation]` | Explicit post-restore reconciliation acknowledgement; may invalidate open grants | `--help` and isolated evidence only |

CLI-00 is a global entry rather than an eighth subcommand. Audit **7/7 subcommand discoverability**, every listed public option and negative parser/exit-path variant. Do not silently assume Grant exposes DRLink's `show/set/unset/test` grammar or direct human-approval decisions through this local installation CLI.

Read-only example discovery:

~~~sh
uv run --frozen grant --help
uv run --frozen grant init --help
uv run --frozen grant user-add --help
uv run --frozen grant serve --help
uv run --frozen grant check --help
uv run --frozen grant backup --help
uv run --frozen grant restore --help
uv run --frozen grant recovery-resume --help
~~~

The positional grammar for `--config` is global and must precede the command when used. If actual discovery changes, ledger the drift and inspect current source; **do not** copy a guessed syntax into a state-changing run. The `--help` probes do not write installation state.

## 4. Feature inventory and owner-disposition matrix

For each row, derive actual public Web/API/CLI coverage *independently*; don't count a label or import as working functionality. `IMPLEMENTED` means behavior supported by source/verified current read path, not production/user E2E PASS.

| Feature ID | User/operator feature | Canonical public surface | Expected disposition / current boundary |
| --- | --- | --- | --- |
| GF-001 | Installation initialization/key/origin | CLI-01, operator runbook | CLI_NATIVE; disposable Full E2E |
| GF-002 | Local account provisioning and roles | CLI-02; authorized System Management account UI | CLI+WEB_API; administrator ownership |
| GF-003 | Local serve and HTTPS/TLS boundary | CLI-03 + deployment runbook | CLI_NATIVE loopback; host TLS editing NOT_IMPLEMENTED |
| GF-004 | Schema/integrity/SMTP/pause health | CLI-04; admin System Health | CLI+WEB_API (different views) |
| GF-005 | Protected database backup/restore/resume | CLI-05/06/07, private operator procedure | CLI_NATIVE; privileged/owner-gated effects |
| GF-006 | Login, logout, own password, MFA, recovery, session revoke | Foundation-backed Auth UI + Grant `/auth/*` | WEB_API_ONLY_JUSTIFIED; no platform password policy editor |
| GF-007 | Home, request intake, status and action immutability | Web /requests/new, /requests/{id}, request API | WEB_API_ONLY_JUSTIFIED |
| GF-008 | Approval inbox assignment, current seats and groups | Web /approvals, /approvers, scoped APIs | WEB_API_ONLY_JUSTIFIED |
| GF-009 | Human Approve/Hold/Deny/Cancel, scoped Review→Confirm | Web Request Detail and server decisions | WEB_API_ONLY_JUSTIFIED; human cannot be replaced by CLI |
| GF-010 | Multiple approvers, quorum/sequence, delegation and reassignment | Approver groups, Delegations, Request Detail | WEB_API_ONLY_JUSTIFIED; server-selected seat truth |
| GF-011 | Collaborate, requested changes, linked replacement | Request Detail, /requests/new?replace, server API | WEB_API_ONLY_JUSTIFIED |
| GF-012 | Versioned policy Draft/Testing/Active/Disabled, 409 CAS | Approval policies and versioned API | WEB_API_ONLY_JUSTIFIED |
| GF-013 | Notification templates, branding, preview and delivery worklist | Notifications Web/API | WEB_API_ONLY_JUSTIFIED; transport != receipt |
| GF-014 | Issued email decision links/PIN/OTP/fresh MFA, expiration/replay | Public decision-intents + backend | WEB_API_ONLY_JUSTIFIED; unauth GET inert |
| GF-015 | Registered integrations, scoped credential issue/revoke and diagnostics | Integrations Web/API | WEB_API_ONLY_JUSTIFIED; no raw-secret disclosure |
| GF-016 | Approved external consume, replay, signed result and audit | Integration API, readback | WEB_API_ONLY_JUSTIFIED; real Control owner-gated |
| GF-017 | Stellar notification receiver correlation/feedback guard | signed integration route + external receiver | EXTERNAL_GATE_PENDING; fixture != Stellar product |
| GF-018 | Audit Explorer, bounded exports, history/evidence chain | Admin Web/API | WEB_API_ONLY_JUSTIFIED |
| GF-019 | Operational queues, health, exceptions, delivery retry | Admin Web/API; CLI-04 for local inspection | WEB_API_ONLY_JUSTIFIED / CLI read counterpart |
| GF-020 | Safe configuration export, preview and Draft-only import | System Management Backup & Import → Integrations diagnostics | WEB_API_ONLY_JUSTIFIED; distinct from DB restore |
| GF-021 | Foundation shared auth/sidebar/administration task presentation | pinned Foundation RC50 + Grant adapters | FOUNDATION_OWNED_COMMON_UI; consumer evidence only |
| GF-022 | System Management HTTPS, platform password policy, display timezone, network and retention tasks | System Management + Account & Security | MIXED_CURRENT_GRANT: Display timezone is persisted/supported; HTTPS/network are deployment read-only; platform password policy and retention remain unavailable; no fake Manage |
| GF-023 | Optional Foundation on-prem security Wheel/host enforcement | shared Wheel not installed in Grant | NOT_INSTALLED; separate Grant adapter/owner effect required |
| GF-024 | Actual user acceptance with independent requester/approver accounts, sessions and mailboxes | Full User E2E | NOT_CLI_AUDIT; cannot infer PASS from this read-only audit |

For each GF row record public discovery, required role, CLI ID or justified Web/API-only designation, UI path, API authority, read/list/preview actions, write/confirm/recovery stages, audit receipt, known unavailable controls and linked scenario ID(s). Every supported Web/API-only feature must have a discoverable user workflow; treating missing CLI as a defect only when a CLI is actually promised.

## 5. Per-feature reconciliation procedure

1. **Public black-box lane first:** assign a concrete first-time-user mission and start from `grant --help` or the first-party task navigation. Record *what the user actually discovers*, next action, confusing labels, unavailable tasks, stale/help-only/hidden paths, and recovery wording. Do not preload endpoint names, exact syntax, source-derived navigation, or expected results.
2. **Freeze user evidence before internals:** once the user has either completed the discoverable workflow or reached a genuine dead end, preserve that evidence. A script, source grep, API catalog, or test oracle may not repair the acting user's path retroactively.
3. **Independent auditor after the relevant black-box evidence is frozen:** enumerate `grant/cli.py` argparse subcommands, current route declarations in `grant/identity_routes.py`, `grant/admin.py`, `grant/domain_routes.py` and mounted `web/src`. Compare actual capabilities against Product Standard and documented effects. Never feed source-derived answers back into an in-progress user lane.
4. **Reconcile lifecycle:** DISCOVER → PRECONDITIONS → READ/INSPECT → REVIEW/CONFIRM (if supported) → SERVER-SCOPED READBACK → FAILURE/CONFLICT/REVOKE → RECOVER/OFFBOARD. Mutation-bearing stages are *audited*, not executed on a shared runtime.
5. **Negative check:** unknown/duplicate/legacy syntax; missing required options; wrong role and tenant/approver; malformed data; stale update; ambiguous POST; no linked recovery; duplicate email decision; unsupported setting greyed out. Use isolated deterministic tests when a mutation is necessary to prove rejection.
6. **Cross-surface state truth:** distinguish `policy DRAFT` from `ACTIVE`, `HOLD` from `APPROVED`, `mail transport accepted` from mailbox receipt, `approve` from external consume, `REPORTED_SUCCEEDED` from independently verified execution, and `restore PAUSED` from authorized resume.
7. **Documentation:** verify CLI help, `docs/OPERATIONS.md`, `docs/PRODUCT_STANDARD.md`, `docs/USER_SCENARIOS.md`, `docs/G11_EXTERNAL_ACCEPTANCE.md`, shared Foundation consumer lock docs and page wording. Unimplemented features must have a truthful "Unavailable/owner-managed" explanation, not green supported badges.
8. **Classification:** `FEATURE_WITH_PUBLIC_WORKFLOW`, `WEB_API_ONLY_JUSTIFIED`, `CLI_NO_JUSTIFICATION`, `CLI_ORPHAN`, `DISCOVERY_GAP`, `ROLE_AUTHORITY_DRIFT`, `STATE_SEMANTICS_DRIFT`, `UNSAFE_NEXT_ACTION`, `PROCEDURE_OR_DOC_DRIFT`, `CLI_PARSER_VARIANT_DRIFT`, `EXTERNAL_GATE_PENDING`, `NOT_INSTALLED`. No row can be left without a reason and evidence.

## 6. Mandatory scenario register — FCS (non-destructive audit)

Every applicable FCS has a **FIRST_TIME_OPERATOR** observation and a separate **AUDITOR_RECONCILIATION** observation. For a not-yet-implemented feature, the operator must discover the honest public unavailability/recovery path and the auditor classifies `PRODUCT_GAP_OPEN`; never invent runtime PASS from source existence. No actual approval or credential issuance occurs here.

| ID | User/operator mission (discover from public surface) | Exact reconciliation and negative oracle |
| --- | --- | --- |
| FCS-001 | First local install: "How do I start Grant safely?" | Discover `init`, config/origin/dev semantics, key/0600, no default user, no overwrite; source/tests establish isolation |
| FCS-002 | "Create administrator and a member" | Discover `user-add`, role enum, hidden password/confirmation; prove credential stays out of logs, wrong-role refusal from isolated tests |
| FCS-003 | "Run/stop the service" | Discover `serve`, loopback-only listener, TLS reverse proxy obligation, stop/restart; verify no advertised undocumented network apply command |
| FCS-004 | "Find current install health" | Discover `check` and system health, allowed existing DB read; inspect missing DB, unsupported schema, recovery marker/SMTP distinctions |
| FCS-005 | "Take a private backup safely" | Discover `backup --output`, trusted NEW output, SQLite snapshot/no implicit migration, private key handling; no live artifact creation |
| FCS-006 | "Restore without changing existing state" | Discover `restore --input --output`, refused collision/symlink/missing marker/invalid DB, paused delivery and cleared sessions; isolated test proof only |
| FCS-007 | "Resume only after reconciliation" | Discover `recovery-resume --acknowledge-external-reconciliation`, irreversibility and request invalidation; no live resume |
| FCS-008 | "Do admin commands make approval decisions?" | Verify no invented approval CLI; trace Requester→Approver signed-in Web Review→Confirm, server authorization and audit |
| FCS-009 | "Use normal sign-in, change own password or enable MFA" | Verify login/MFA/sessions and recovery in existing security UI, independent per-account scope, no imaginary global password-policy editor |
| FCS-010 | "Submit an approval request" | Discover Home/New Request, active policy choice, exact action/target/reason, separate Review and Confirm and immutable server receipt |
| FCS-011 | "Find work assigned to me" | Discover Inbox, current seat/deadline/quorum, assigned-only overdue, filtering, correct missing/empty/partial loading states |
| FCS-012 | "Approve, hold or deny a request" | Discover current-seat permission and human Review→Confirm; unrelated user, pending state, double POST/ambiguous receipt protection |
| FCS-013 | "Request information, amend, replace or cancel" | Discover comment/change request and linked replacement; previous action does not transfer authorization |
| FCS-014 | "Delegate an approval" | Discover delegation membership/window/revocation, no cross-tenant/self-approval, stale reassign/escalate role restrictions |
| FCS-015 | "Create and activate a safe policy" | Discover Draft→Testing→Active→Disabled, clone/versions, stale 409 CAS, no automatic activation on save |
| FCS-016 | "Configure an approval group" | Discover enabled members/order/quorum/SEQUENTIAL, Review→Confirm and atomic version guard |
| FCS-017 | "Customize notifications" | Discover complete required template events, rendered preview, branding, administrator test-send and immutable saved snapshot |
| FCS-018 | "Choose PIN/OTP/MFA verification" | Verify one emailed issued-intent GET is inert, recipient identity, exact decision, current verification floor, expired/replay controls |
| FCS-019 | "Register external integration, issue scoped credential" | Discover existing account/admin prerequisites, separate producer/executor/observer scopes, one-time secret disclosure, revocation and metadata |
| FCS-020 | "Test receiver connectivity" | Verify diagnostic test POST is separately reviewed and does not authorize a request or mean external business action succeeded |
| FCS-021 | "Understand an approved outcome" | Distinguish approval grant, consume once/replay, receipt and separately reported effect; identify real Control/independent ledger requirement |
| FCS-022 | "Find audit trail and privacy-safe export" | Discover actor/scope filters, bounded event search and request chain, unauthorized data denial, exported count consistency |
| FCS-023 | "Recover failed/unknown notifications" | Discover Operations delivery-failed queue, resend Review→Confirm, stable ID, no automatic duplicate or false mailbox receipt |
| FCS-024 | "Export/import configuration" | System Management Backup & Import → `/integrations?view=diagnostics`; exact-query parser, schema v1 metadata dry-run vs v2 Draft-only import, no DB restore |
| FCS-025 | "Manage supported system settings" | Nine Control-reference task labels vs Grant real permissions; Display timezone has Grant-native authenticated user/default persistence while HTTPS/network stay deployment-read-only and platform password policy/retention remain unavailable; Foundation-owned visual issues routed upstream |
| FCS-026 | "Find real external Control/Stellar status" | Confirm mock ledger/fixture is not native Control execution or Stellar ingestion; missing external readback plainly blocked |
| FCS-027 | "Use help, recover from an invalid operation" | All seven `grant` subcommands/flags, wrong placement, missing flags, help/errors/nonzero exit; no traceback/secrets/internal-only advice |
| FCS-028 | "Use the product with a restricted identity" | Anonymous, member, approver, admin and integration token visibility vs action matrices; UI controls and API deny in agreement |
| FCS-029 | "Identify current candidate/version" | Git HEAD, private Foundation lock, deployed Web assets, current SQLite schema v15, CLI/check and docs consistent; stale runtime correlation only |
| FCS-030 | "Finish a clean operator shift" | Audit-owned file/process cleanup, retain legitimate installation and durable evidence, final findings/owner routing, zero runtime mutation |
| FCS-031 | "Configure Grant from a blank administrator perspective, then hand it to a requester" | Discover and validate the canonical setup order: Accounts → Approver groups → Integrations → Notification templates → Draft policy → Test → Activate; then verify Requester sees only the published request type and read-only assigned approval plan, not unrestricted admin routing controls |

The scenario register is **31/31 indexed cases**. Additional current supported commands, variants, features or roles discovered at execution time must be added as indexed rows with unique IDs instead of silently reducing the denominator. A superseded or inapplicable scenario requires `NOT_APPLICABLE` with explicit product-standard evidence.

### Required deeper walkthroughs (public first; no live mutation)

**FCS-001 → FCS-007, installation lifecycle:** First-time operator starts with `grant --help`, identifies `--config` as a global option, walks each documented subcommand `--help`, explains when to use a NEW config/database/backup path, verifies `check` does not create storage, and identifies required irreversible recovery acknowledgment. In a shared installation stop *before* commands that create/start/restore/write; auditor links actual `tests/test_lifecycle.py`, `tests/test_b5_cli_recovery_diagnostics.py`, `tests/test_database_initial_private.py`, `tests/test_restore_recovery_pause_integrity.py` and relevant negative tests.

**FCS-010 → FCS-018, approval human authority:** The operator starts from visible Web navigation and infers requester, approver and admin pathways. Audit the exact action shown before any confirmation, selected approval seat, policy version and tenant scope, role-specific deadline/overdue, and email verification requirements. A clicked "Approve" before final Confirm is *not* committed. There must be no CLI/bypass that silently creates a human decision or promotes an MFA/notification test to a grant.

**FCS-019 → FCS-026, integrations versus observed effects:** An integration credential is not an approver identity; successful HTTP callback response is not execution. Compare source contracts `/api/v1/requests/{id}/consume`, `/result` and related webhook events with the separate native Control/Stellar evidence requirements. No actual sending, consuming or callback to an owner-controlled destination occurs during this audit. Core Full User E2E verifies Grant's disposable consume/replay/result boundary; real Control/Stellar effects belong to the separate External Integration Acceptance profile in `docs/FULL_USER_E2E_SCENARIOS.md` and `docs/G11_EXTERNAL_ACCEPTANCE.md`.

**FCS-024/FCS-025, System Management parity:** Reconcile screen task labels, supported/read-only/unavailable badges, actual Grant route and backend authority. Report the current P0-SM product gap rather than claiming that shared Foundation RC50 implements missing host policy. Record evidence of existing Draft import and safe export separately from a private DB backup and recovery.

**FCS-031, first-time administrator onboarding:** This is the primary Grant-specific coherence scenario. Starting only from the signed-in task navigation, an administrator must be able to discover the required setup order without reading source or an internal runbook: Accounts → Approver groups → Integrations → Notification templates → Draft policy → Test → Activate. A requester must then see the published request type and its fixed approval plan, while ordinary request creation must not expose unrestricted administrator routing/template/verification controls.

## 7. Cross-surface coverage and contradictions

Required explicit checks per applicable feature:
- **Discoverability:** first screen/help/search, action label, keyboard path, role hint, actionable next step; no hidden operator syntax required.
- **Terminology:** Request vs policy vs execution grant vs result; Approval vs "notification delivered"; DataRelay product vs Stellar source; Backup SQLite vs portable Draft policy bundle.
- **State machine:** `AWAITING/HELD/APPROVED/DENIED/EXPIRED/CANCELLED`, `DRAFT/TESTING/ACTIVE/DISABLED`, outbox `QUEUED/DELIVERED/FAILED`, `REPORTED_SUCCEEDED/REPORTED_FAILED/UNKNOWN`, recovery `PAUSED`. Server state beats CSS badge or browser-local clock.
- **Roles:** Anonymous public intent GET cannot decide; requester cannot impersonate approver; unrelated member cannot discover someone else's request; admin functions are server guarded; integration token cannot make a human decision.
- **Security:** No tenant/identity/role ambiguity, invalid paths, hidden legacy aliases, unreviewed destructive steps, overclaimed TLS/retention/MFA, raw PINs or secrets in evidence; no fallback to a weaker verification floor.
- **Failure guidance:** 401/403/404/409/422 and unsafe/ambiguous timeouts return meaningful recovery, not "already approved"/"already sent"/"retry automatically" unless product receipt is authoritative.
- **Presentation:** desktop/390px responsive first screen task visibility, loading vs verified empty states, action focus, disabled/hide semantics. Shared Foundation visual defects routed to Foundation, Grant-specific backend/adapter defects to Grant.
- **Execution/provenance:** source package hash, PR candidate, installed build, actual sender/receiver, enabled workers and real human sessions are distinct facts.

## 8. Evidence directory, ledgers and invariant counters

One unique private run directory:

~~~text
e2e-reports/grant-cli-reconciliation-<UTC-RUN_ID>/
  run.env                         # nonsecret identities, contract/hash/installed match
  coordination.lock
  discovery/cli-help.txt
  discovery/public-ui.txt
  discovery/api-capability-surface.txt
  discovery/install-version.txt
  ledgers/features.tsv
  ledgers/commands.tsv
  ledgers/feature-command-scenarios.tsv
  ledgers/fcs-results.tsv
  ledgers/findings.tsv
  ledgers/coverage.tsv
  operator/first-time-*.txt
  auditor/reconciliation-*.txt
  scenarios/FCS-001.txt ... FCS-031.txt
  cleanup/audit-owned-processes.txt
  summary.txt
~~~

Minimum schemas (TSV must be escaped/encoded, not ambiguous pasted multiline):
- `features.tsv`: `FEATURE_ID, FEATURE, AUTHORITY, IMPLEMENTATION_STATUS, ROLE, CLI_ID, WEB_ROUTE, API_ROUTE, EXTERNAL_GATE, SCENARIO_IDS, RESULT, EVIDENCE`.
- `commands.tsv`: `CLI_ID, SUBCOMMAND, FLAG_SET, HELP_DISCOVERED, MUTATION_POSSIBLE, RUNTIME_READ_ALLOWED, PRODUCT_FEATURE, NEGATIVE_COVERAGE, RESULT, EVIDENCE`.
- `feature-command-scenarios.tsv`: `FEATURE_ID, CLI_ID_OR_WEB_API_JUSTIFICATION, WORKFLOW_STEPS, SCENARIO_IDS, DISPOSITION, EVIDENCE`.
- `fcs-results.tsv`: `SCENARIO_ID, APPLICABLE, FIRST_TIME_OPERATOR_RESULT, AUDITOR_RESULT, FINAL_RESULT, BLOCK_REASON, EVIDENCE`.
- `findings.tsv`: `FINDING_ID, SEVERITY, USER_BLOCKING, STATUS, CLASSIFICATION, FEATURE_ID, SURFACE, REPRODUCER, OWNER, EVIDENCE`.
- `coverage.tsv`: `METRIC, NUMERATOR, DENOMINATOR, PERCENT, EVIDENCE`.

Compute counts *from ledger rows* rather than writing an independent manual PASS: `PUBLIC_CLI_SUBCOMMANDS=7`, `PUBLIC_CLI_SUBCOMMANDS_DISCOVERED`, `CLI_GLOBAL_AND_SUBCOMMAND_FLAGS_COVERED`, `SUPPORTED_FEATURES_WITH_DISPOSITION`, `UNJUSTIFIED_CLI_GAPS`, `UNJUSTIFIED_WEB_ONLY_GAPS`, `UNAVAILABLE_MISREPRESENTED_AS_SUPPORTED`, `FCS_APPLICABLE`/`PASS`/`FAIL`/`BLOCKED`, `FIRST_TIME_OPERATOR_FEATURE_COVERAGE`, `FIRST_TIME_OPERATOR_FCS_COVERAGE`, `AUDITOR_KNOWLEDGE_LEAK_COUNT`, `DOC_COMMAND_DRIFT`, `ROLE_SCOPE_DRIFT`, `WORKFLOW_DEAD_ENDS`, `EVIDENCE_SUMMARY_MISMATCH_COUNT`, `RUNTIME_MUTATION_ATTEMPT_COUNT` and `CLEANUP_RESIDUE_COUNT`.

All 31 FCS IDs and all 24 GF feature IDs must appear exactly once in their own canonical ledger; FCS rows may reference multiple GF IDs. All seven CLI subcommands and every *current* supported public option must appear. This audit tests Grant's actual public CLI/Web/API surfaces and first-time operator discoverability only.

Never retain passwords, PIN/OTP/TOTP values, cookies, auth headers, full emailed capability URLs, API keys, private config/key, token issuance output, actual encrypted DB, private backup content, screenshots of secrets or plaintext mail. Save redacted source identities, request IDs and SHA256 of eligible nonsecret artifacts only.

## 9. Finding severity, completion and offboarding

- **P0:** unauthorized human approval/execution; policy/MFA bypass; secret disclosure; destructive/unreviewed restore; double-effect/tenant leak. Blocks.
- **P1:** an advertised supported workflow is broken, wrong role can manage, critical missing CLI variant, untruthful execution evidence, invalid recovery. Blocks.
- **P2:** real novice task dead end, ambiguous unsupported badge, incorrect CLI/help/next-step wording, misleading loading/empty state, material keyboard/mobile gap. User-blocking P2 blocks.
- **P3:** non-blocking wording/polish with explicit disposition.

Results: `PASS`, `FAIL`, `PARTIAL`, `BLOCKED_ENVIRONMENT`, `BLOCKED_TOOLING`, `STALE_RUNTIME_CORRELATION_ONLY`, `NOT_APPLICABLE`. A blocked mandatory scenario is not PASS. Product or test limitations found before completion are not quietly turned into "test unsupported" exceptions.

**CLI feature reconciliation PASS** only when every applicable GF/FCS row has first-time-operator and auditor evidence; first-time operator feature/FCS coverage is 100%; all seven command families and flags are discoverable and correctly documented; Web/API-only features are justified; the operator can complete or truthfully stop the supported lifecycle using only public guidance; no unjustified hidden/duplicate path, major terminology/permission/state drift or unresolved P0/P1/user-blocking P2 remains; summary counters exactly match ledgers; runtime mutation attempts = 0; audit-owned residue = 0. A **release-qualified** reconciliation additionally needs committed clean contract, exact installed candidate, authorized full runtime and the independent Full User E2E gate. Otherwise label `AUDIT_COMPLETE_WITH_OPEN_PRODUCT_GAPS` or `BLOCKED`, not release PASS.

**Run discipline:** Accumulate all defects first; continue independent scenarios; freeze findings; only afterwards implement fixes as bounded tasks in the relevant owner repo (Foundation common UI vs Grant adapters). Recheck affected scenarios and do one final complete confirmation when release rules require it. The audit must not mutate the product to "repair" evidence mid-pass.

**Offboarding:** Stop only audit-owned discovery/TTY processes, remove only audit-owned transient files, verify original installation/cookies/passwords/users/policy/DB/listeners untouched, preserve evidence, unlock only the current audit. Final GitHub summary on the existing Grant Work Packet #67/Roadmap #37 is written **once after exhaustion**, with source/contract SHA, tested surface identity, all counters, findings, withheld gates and next action. Never falsely claim a chat/CI-generated ledger proves real user acceptance.

## 10. Companion relationship and precise next action

- This document is a **non-destructive consistency audit** that should normally run before state-changing Full User E2E. It does **not** run an actual `grant init`, user creation, approval, delivery, restore, consume, or native Control/Stellar result.
- `docs/FULL_USER_E2E_SCENARIOS.md` owns genuine disposable CLI/Browser/API/mail core Grant execution, independent requester/approver accounts/mailboxes, negative paths, replay/concurrency/load and final evidence. Its separate External Integration Acceptance profile owns real Control/Stellar effects when authorized.
- `docs/FULL_USER_E2E.md`, `docs/USER_SCENARIOS.md`, `docs/SURFACE_RECONCILIATION.md` and `docs/INTEGRATION.md` remain existing mandatory user-acceptance contracts; this plan does not downgrade them.

**When actually requested to run:** resolve current Git head/contract SHA once, verify the available read-only surface/tooling, execute first-time-user public discovery without manuals/source/test answers, freeze that black-box evidence before source enumeration, reconcile all GF/FCS rows, classify true capability gaps, preserve a complete ledger, exhaust independent checks, then report once. Do **not** start this run solely because the document was written.
