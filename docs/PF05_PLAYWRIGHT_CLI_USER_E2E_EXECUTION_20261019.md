# Grant PF05 — Direct CLI and Playwright User-Flow Execution

Execution date: 2026-10-19 (KST). Executor: CHATGPT_CHAT.
Original source baseline: b5db83f6ba36bba6e66fc94bcf4ed0ea8758600b.
Actual remediated HEAD and exact CI must be resolved from the final PR;
previously green CI does not qualify modified source.

## Contracts and denominators

These existing normative contracts were used, not replaced:
- docs/CLI_FEATURE_SCENARIO_RECONCILIATION.md: 24 GF features and 31 FCS scenarios.
- docs/FULL_USER_E2E_SCENARIOS.md: 111 mandatory core scenarios and
  11 separately owner-gated native Control/Stellar external scenarios.
- Companion contracts: FULL_USER_E2E, USER_SCENARIOS, SURFACE_RECONCILIATION,
  INTEGRATION, OPERATIONS and current repository engineering rules.

No disposable fixture, SMTP transport receipt or local Chromium PASS is
equivalent to an independently received approval email in a second mailbox.

## Direct public operator and browser actions

- Discovered all seven public grant CLI commands and their help directly:
  init, user-add, serve, check, backup, restore, recovery-resume. Five
  unknown-command, option or role probes rejected with exit code 2.
- Independently created and operated a new private loopback installation using
  the actual public CLI. Eighteen direct checks passed: protected fresh config,
  duplicate init refusal, missing DB health fail-closed, two new prompted
  disposable accounts, correct health, new private SQLite backup and integrity,
  duplicate backup refusal, restored NEW PAUSED database with cleared sessions,
  duplicate restore refusal, unacknowledged recovery-resume refusal, read-only
  restored health, loopback HTTP login, unauthorized admin API 401, clean service
  stop and original owned state preservation. No real SMTP or host side effects.
- With native Playwright CLI Chromium and real Grant login against independent
  disposable web/API/SQLite fixtures: direct Administrator setup/navigation,
  requester Review and Confirm of an approval request, separately authenticated
  approver Inbox and human Review/Confirm, saved requester approval readback,
  unrelated member admin-route denial and 14 role-scoped menu destinations.
  Grant-owned request UI at 390 and 320 px had no horizontal overflow.
- Existing complete disposable first-run admin configuration and unpublished
  template negative scenarios also passed, including template publication and
  Test→Activate steps. This does not prove real external email receipt.

## Evidence-backed fixes

| Finding | User-visible problem | Actual bounded correction |
| --- | --- | --- |
| PF05-UX-001 (P2) | Before the admin-user GET returned, the UI incorrectly said No accounts. A delayed-GET Playwright test reproduced RED. | Do not render AccountList or empty-directory truth until authoritative GET succeeds. |
| PF05-UX-002 (P2) | Failed admin-user GET looked like zero users and left no direct recovery action. | Display an unable-to-verify status, guard account creation and offer a real Retry account directory button; verify failed→successful retry in Chromium. |
| PF05-UX-003 (P3) | Failed/unavailable account action displayed Working even without active work. | Distinguish a disabled Form from busy work, including submit guard and disabled button state. |
| PF05-UX-004 (P3) | Already active policies still showed Set up your first approval workflow. | Change to Manage existing approval workflows for loaded active policies; preserve first-use copy for new installations. |
| PF05-TEST-001 (test isolation) | The real disposable MFA/TOTP enrollment changed the test admin identity; unrelated later login cases in the same DB could not use password-only login. | Run MFA on its own fresh disposable server/DB, preserve real MFA and login rate limits, and reconcile every discovered Playwright case exactly once. |

All product UI changes are Grant-owned. Foundation source/host security and
approval/mail semantics remain unchanged.

## Complete, conservatively classified scenario ledger

Private machine-readable output is retained under the ignored
.e2e/cli-audit-20261019T044902Z-1000-1388668/ path in the exact candidate:

- ledgers/features.tsv: all 24 GF features.
- ledgers/fcs-results.tsv: all 31 FCS rows. Three narrow CLI PASS,
  24 PARTIAL and four BLOCKED_ENVIRONMENT; never a full reconciliation PASS.
- full-user-ledger/scenario-results.tsv: all 111 core and 11 X rows.
  Core: 7 narrowly qualified safe direct CLI PASS; 31 PARTIAL; 72
  BLOCKED_ENVIRONMENT; 1 BLOCKED_OWNER_AUTHORIZATION. Separate X:
  11 BLOCKED_OWNER_AUTHORIZATION. No missing row is silently discarded.
- summary-ledgers.json is derived from the scenario rows, not a manually
  asserted FULL_USER_E2E PASS.
- operator/disposable-cli-results-r2.txt and discovery/cli-help.txt are
  actual public CLI receipts. Native browser PNG/JSON/log evidence and the
  deterministic red account-fetch test are under ignored .e2e/novice-browser-*
  directories.

The observed older HTTPS preview runs a different deployed HEAD from this
candidate, with its mail worker disabled. Current Gmail tool selection has
failed with an eligible linked-account identifier error even though two
separate OAuth links were observed in an earlier connected browser context.
An email recipient alias does not establish distinct inbox custody.

## Scope and remaining acceptance

DISPOSABLE_PRODUCT_E2E is supported by direct built-app/browser results, but
FULL_USER_E2E=BLOCKED_PREREQUISITES (not PASS): actual same-HEAD installed
nonproduction HTTPS/mail service, separate legitimate mailbox readback, and
the required real-email PIN/OTP/MFA delivery evidence remain unavailable.
External Control/Stellar X-profile effects need separate owner authorization.

No existing public preview, original G12 intentional dirty diff, Foundation
private package, customer mailbox, SMTP sender, native Control/Stellar target,
production installation or release was changed. Do not merge, tag, publish,
change security/credential/permission boundaries or claim owner acceptance.
Resume missing full-user scenarios only after their independent
installation/mailbox/owner prerequisites are verified, not by replaying a
fixture or weakening security.
