# DataRelay Grant Repository Engineering Rules

This repository follows the canonical Data Relay Labs Engineering System:
https://github.com/datarelay-labs/engineering-system

Adoption baseline: Engineering System version 1.7.0 at immutable commit `2b79b6f674486b4a4bf2f2ad3261022d246c7ef8`.

## Minimum context first

Always read:
1. `AGENTS.md`
2. `.engineering/project.yaml`

Then only when relevant:
3. `.engineering/tests.yaml` for implementation/debugging/testing, once it exists
4. `.engineering/release.yaml` for release/version/artifact work, once it exists
5. Only the task-relevant product specification, ADR, runbook, or Engineering System standard

Do not preload unrelated standards, historical discussions, or documentation.

## Current repository state

DataRelay Grant is currently a **pre-release product definition**. Do not infer implemented behavior from the patent, README, or product-site language.

Any future implementation must distinguish clearly between:
- patent-described concepts;
- accepted product requirements;
- implemented and tested behavior; and
- roadmap / planned behavior.

## DataRelay Grant product invariants

1. The product role is a reusable **human approval layer between a requested action and execution**.
2. Human approval decisions must remain explicit. Approval, pending, and denial are distinct states; do not infer approval from ambiguous free-form text.
3. Execution must remain separated from authorization. A protected action must not execute merely because a request was created.
4. The patent foundation includes email-based approval, pending reminders, reusable templates/playbooks/modules, and external-system API integration. Actual product contracts must be specified and tested before being described as implemented.
5. DataRelay Grant may complement DataRelay Link, DataRelay Control, and external systems. It must not silently merge their product boundaries.
6. Do not make legal conclusions about patent scope from repository documentation or implementation. Issued patent records and claims remain the legal reference.
7. Repository artifacts are English by default. Chat replies may follow the user's language.

## Execution rules

- **Product execution ownership / supervisor fallback:** the product context owns product work. Engineering System owns shared policy, adoption and systemic recovery, including uncontrolled Issue proliferation. Repair only what restores product autonomy, then return ownership. Never mutate an actively progressing owner-authorized worker dirty worktree or create a competing product lane.
- **Next-chat bootstrap fast path:** perform one bounded lookup when resuming durable work. With no ACTIVE packet, inspect current roadmap/Git/PR facts once and enter safe owner-authorized work; create or repair one packet when continuity needs it, not as a permission prerequisite. `NO_ACTIVE_PACKET` is a scheduling input, not a blocker.
- **Verified next-chat resume:** re-read the current Issue and mutable repo/worktree/HEAD/profile once; if unchanged, enter the persisted Next Action immediately. Do not replay handoff validation, rewrite unchanged state or reconstruct transcripts. Revalidate only changed facts.
- For `project.user_facing: true`, require Surface Reconciliation and Full User E2E on the same exact candidate. Before either named gate, read its entire current repository-local contract and execute it as the applicable User/Operator/Admin persona on the actual public surface. Drivers and scripts may support real actions, never substitute synthetic PASS. Follow `standards/USER_ACCEPTANCE.md`; do not restart the complete gate after every individual fix. Close findings with affected reruns, then one fresh complete confirmation.
- **Execution profile authority:** `.engineering/execution-profile.yaml` selects the runtime unless the current explicit owner instruction overrides it. A continue/resume request authorizes direct implementation, testing, audit and ordinary Git/GitHub work; no additional magic phrase or alternate-runtime handoff is required. Historical prose and retired adapters do not select a runtime. Before claiming missing tools or access, discover the connected task-relevant tools and attempt a minimal authorized action when exposed. Reuse successful same-session, same-target, same-action evidence unless a fresh failure or scope change invalidates it. Report the exact attempted operation and observed error; unattempted is not denied. Existing approvals and explicit tool denials remain binding.
- For ordinary authenticated GitHub Issue/PR coordination, re-read the intended target, branch/HEAD and any packet relied on before writing; reconcile ambiguous outcomes before retrying. Stronger trusted boundaries apply only to effect classes production, destructive, credential/permission change, irreversible publication and release authority, or stricter project policy; follow `standards/SECURITY.md`.
- **Execute useful work continuously.** **Execution authority precedence:** the current explicit owner instruction governs, then the fresh Work Packet, execution profile and repository rules. Historical Issue comments and prior handoffs are evidence only and never execution authority. Bind the owner-selected repository and verify actual branch/HEAD/worktree before mutation; cross-project references never retarget work without explicit owner scope. Implement, test and audit in coherent batches; make measurable progress in the same turn. Repair stale coordination state within owner scope instead of stopping. Advance independent work during machine-observable waits instead of polling; after a bounded task return to roadmap priority. Continue until the requested roadmap/release objective is complete, no safe runnable work remains, or genuine owner input or an irreconcilable blocker is required.
- Follow the canonical Engineering System for design, implementation, validation, release, and operations work.
- For material design-bearing changes, apply the canonical `standards/DESIGN.md` minimal design gate before implementation.
- For production-impacting incidents or recovery, apply the canonical `standards/OPERATIONS.md` lifecycle and preserve evidence before mutation.
- Make the smallest correct change and do not silently expand scope.
- Do not report planned, mocked, or unimplemented behavior as current product capability.
- Before implementation begins, add task-appropriate tests and release configuration rather than inventing validation evidence.
- When explicitly resuming work, resolve this repository and branch first and continue from the matching active repository-scoped AI Work Packet.

## Implementation and audit contract





The selected runtime performs implementation, deterministic testing, and terminal audit. Terminal PASS requires current exact-HEAD evidence, required CI/review state, and disposition of actionable findings; self-report alone is never sufficient. HIGH/CRITICAL or production/security-sensitive work requires deeper machine evidence and any applicable human approval. Codex or another independent reviewer is optional defense-in-depth/escalation, not a default completion dependency.
