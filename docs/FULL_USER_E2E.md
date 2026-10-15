# Grant R1 complete user acceptance contract

**Canonical detailed execution matrix (2026-10-14):**
`docs/FULL_USER_E2E_SCENARIOS.md`. Read and execute that complete
role-indexed User/Admin/Email/CLI/Recovery/Concurrency/Performance contract
for Grant core product quality **in addition** to this original top-level acceptance contract and
`docs/USER_SCENARIOS.md`. The non-destructive, separate
`docs/CLI_FEATURE_SCENARIO_RECONCILIATION.md` must not be mislabeled as
actual-user E2E. Writing the two scenario documents does not execute or pass
any E2E scenario. Foundation common UI remains Foundation-project owned.

Read this whole document, `USER_SCENARIOS.md`, `SURFACE_RECONCILIATION.md`,
`INTEGRATION.md` and `OPERATIONS.md` before execution. CHATGPT_CHAT directly owns the
operator/requester/approver/unrelated-user personas under the execution profile.
Scripts, wrappers and browser drivers may assist interactions and capture evidence;
they must not replace a missing persona journey, durable readback or independent
mailbox observation with a generated PASS. An API fixture is supporting evidence, not
the acting user.

## Required complete journey

Perform the complete authenticated administrator/requester/approver journeys and all
replacement, mobile/security and operational scenarios in `USER_SCENARIOS.md`.
Use an actual browser process with the built Foundation-backed product. Exercise the
first-time administrator setup chain, request creation, email navigation, hold, explicit
approval, denied/cancelled/expired requests, changes requiring a new request, Grant
consumer commitment/replay and reported result.
Validate permissions and persisted observations, not just visible success messages.

Core Full User E2E requires real designated mailbox receipt because email approval is
part of Grant's product behavior. Real DataRelay Control execution and deployed Stellar
receiver verification are **separate External Integration Acceptance** under
`docs/G11_EXTERNAL_ACCEPTANCE.md`; they do not block Grant's core product-quality loop.
When a release or deployment claims those native integrations, that separate profile
must PASS rather than being replaced by a fixture. Real customer/production actions
still require separate authority. No new Runner or credential-policy bypass is permitted.

## Finding closure and final confirmation

Record exact HEAD/tree/environment and gather the full finding set. Make minimal
fixes and converge the affected user journeys rather than restarting unrelated suites
after every patch. Once all actionable findings are dispositioned and targeted-clean,
freeze the candidate and run one NEW complete clean confirmation, including all core
personas, normal task completion, result readback, operator recovery and offboarding/sign-out.
Any meaningful change invalidates the affected prior evidence and requires reconciliation.
Release qualification, not ordinary Full User E2E, repeats this complete confirmation
twice on the same exact HEAD.

Report what users actually did, what persisted, which external effects were verified
versus merely reported, every finding/closure, remaining blockers and evidence paths.
Capture screenshots/log hashes without credentials. Do not declare acceptance from
self-report or from the existence of a validator/schema. CI validates the evidence
contract; it does not stand in for direct persona ownership and actual system evidence.
Owner release acceptance/publication remains separate after quality closure.
