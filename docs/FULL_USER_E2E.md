# Grant R1 complete user acceptance contract

Read this whole document, `USER_SCENARIOS.md`, `SURFACE_RECONCILIATION.md`,
`INTEGRATION.md` and `OPERATIONS.md` before execution. CHATGPT_CHAT directly owns the
operator/requester/approver/unrelated-user personas under the execution profile.
Scripts, wrappers and browser drivers may assist interactions and capture evidence;
they must not replace a missing human journey, live integration, final readback or
independent observation with a generated PASS. An API fixture is not a real consumer.

## Required complete journey

Perform the two independent authenticated user passes and all administrative,
replacement, mobile/security and operational scenarios in `USER_SCENARIOS.md`.
Use an actual browser process with the built Foundation-backed product. Exercise
request creation, email navigation, hold, explicit approval, denied/cancelled/expired
requests, changes requiring a new request, consumer commitment and actual result.
Validate permissions and persisted observations, not just visible success messages.

Full R1 acceptance additionally requires the real DataRelay operation and the actual
Stellar request/receiver path described in the integration contract, plus real inbox
receipt. Unsupported or unavailable external configuration is a recorded blocker,
never a simulated PASS. Real customer/production actions require separate authority.
The local fixture-only browser suite is useful integration evidence, not this full
external acceptance result. No new Runner or credential-policy bypass is permitted.

## Finding closure and final confirmation

Record exact HEAD/tree/environment and gather the full finding set. Make minimal
fixes and converge the affected user journeys rather than restarting unrelated suites
after every patch. Once all actionable findings are dispositioned and targeted-clean,
freeze the candidate and run one NEW complete confirmation, including both personas,
normal task completion, result readback, operator recovery and offboarding/sign-out.
Any meaningful change invalidates the affected prior evidence and requires reconciliation.

Report what users actually did, what persisted, which external effects were verified
versus merely reported, every finding/closure, remaining blockers and evidence paths.
Capture screenshots/log hashes without credentials. Do not declare acceptance from
self-report or from the existence of a validator/schema. CI validates the evidence
contract; it does not stand in for direct persona ownership and actual system evidence.
Owner release acceptance/publication remains separate after quality closure.
