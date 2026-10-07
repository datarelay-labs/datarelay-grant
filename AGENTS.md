# DataRelay Grant Repository Engineering Rules

This repository follows the canonical Data Relay Labs Engineering System:
https://github.com/datarelay-labs/engineering-system

Adoption baseline: Engineering System version 1.7.0 at immutable commit `72abaec3ffa4f2e7519ee8067f4b8795acd506ad`.

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

DataRelay Grant is currently a **pre-release development candidate**. Do not infer implemented behavior from the patent, README, product-site language, roadmap, or unmerged design; only current code plus deterministic evidence establishes implemented behavior.

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

- **Execution profile authority:** provider/runtime selection is data in `.engineering/execution-profile.yaml`. A Work Packet is runnable only when its `EXECUTION_PROFILE` and `EXECUTION_PROFILE_REVISION` match that managed profile; legacy packet compatibility is defined only by the profile. Provider/runtime names in prose, historical comments, adapter text, or memory never grant authority. A repository-level continue/resume that resolves to one runnable packet bound to the selected profile authorizes the selected runtime to continue implementation directly; do not require an additional magic phrase or alternate-runtime handoff. Use ordinary authenticated Git/GitHub operations for normal repository work and reserve stronger trusted boundaries for effect classes classified by the execution profile or a stricter project policy.
- For ordinary authenticated GitHub Issue/PR coordination, freshly re-read the authoritative Work Packet and subject branch/HEAD immediately before the write and reject stale intent, branch, or subject state. Do not require `worker_adapter.py` or the trusted signer for those normal coordination writes. Use `python3 tools/worker_adapter.py evaluate --request-json <facts.json>` only for an effect explicitly classified by this system or a stricter project policy as a high-risk external write (for example production, destructive, credential/permission-boundary, irreversible-publication, or equivalent). For those high-risk effects proceed only on `APPLIED`; `STALE_WORKER` authorizes no write and ambiguous outcomes must be reconciled before retry.
- **Execute useful work continuously.** **Execution authority precedence:** the current explicit owner instruction for this workstream governs first, then the freshly read current ACTIVE Work Packet body, then current repository rules. Historical Issue comments, prior handoffs, chat history/memory, old Work Packet versions, and retired adapter text are evidence only and never execution authority. When the current packet is bound to the selected execution profile, do not probe, restore, wait for, or launch any alternate or retired implementation adapter. Before any implementation starts or resumes, bind the target repository once from the owner's current explicit project/repository context, then require a fresh authoritative Work Packet read and `python3 tools/context_epoch.py packet-lint --expect-target-repo <bound-owner/repo>` PASS using that same bound repository. A `TARGET_REPO_SCOPE_MISMATCH` or other BLOCK makes the packet non-runnable and forbids implementation/session launch. Cross-project handoffs, dependencies, Issue references, Atlas results, and waiting-work scheduling remain read-only context and never replace the bound target; only a new explicit owner project/repository switch may rebind it. Implement in coherent small/medium batches, validate locally with the cheapest relevant tests, and keep going while a safe authorized next action exists. Use fast CI for quick integration feedback when useful; reserve full qualification/release CI for a stable candidate. If a workstream is waiting on machine-observable CI/review/deploy or another external condition, record/yield that wait and return to repository-level scheduling; switch to the highest-priority dependency-eligible independent ACTIVE Work Packet/worktree when safe instead of polling or stopping. For a repository-level continue/resume with no branch/workstream named, choose the single trusted runnable packet marked as the current implementation lane (for example QUEUE_STATE=IMPLEMENTATION/IMPLEMENTING); yielded/waiting/deferred predecessor packets must not compete with it. When a successor starts while predecessor integration/qualification is intentionally deferred, pause/yield the predecessor instead of leaving multiple equivalent ACTIVE implementation candidates. The single-matching-ACTIVE-packet rule selects one packet for the current branch/workstream; it does not serialize unrelated repository work behind a waiting packet. Once one runnable packet is selected and authorized, a progress/status message alone is not execution: make measurable progress in the same turn and continue until a real stop condition. Once material research/discovery has resolved the design direction and the owner accepts or says to proceed/continue, first persist the accepted result in the smallest appropriate canonical spec/ADR/roadmap/contract and synchronize the Work Packet, then continue directly into implementation and deterministic validation without asking for another generic implementation confirmation; Atlas may retain derived rationale but is never the canonical execution authority. Measurable progress may be reproduction, bounded investigation that resolves a material uncertainty, deterministic validation, repository mutation, or an authorized external state transition; do not force a code/config mutation when investigation or validation is the correct next action. Stop only for a real owner decision/credential, an irreconcilable blocker, or a status-only request. A completed bounded Work Packet ends that workstream, not a repository-level continue/resume request: immediately return to roadmap/portfolio scheduling and continue the next dependency-eligible runnable workstream. For a repository-level continue request, keep this loop active until the roadmap/release objective is complete, no dependency-eligible runnable work remains, or a genuine stop condition requires owner input. Do not return control merely because one PR, packet, test phase, or bounded outcome completed.
- Follow the canonical Engineering System for design, implementation, validation, release, and operations work.
- For material design-bearing changes, apply the canonical `standards/DESIGN.md` minimal design gate before implementation.
- For production-impacting incidents or recovery, apply the canonical `standards/OPERATIONS.md` lifecycle and preserve evidence before mutation.
- Make the smallest correct change and do not silently expand scope.
- Do not report planned, mocked, or unimplemented behavior as current product capability.
- Before implementation begins, add task-appropriate tests and release configuration rather than inventing validation evidence.
- When explicitly resuming work, resolve this repository and branch first and continue from the matching active repository-scoped AI Work Packet.

## ChatGPT implementation and audit contract

ChatGPT Chat is the default implementer for this repository when the authenticated active Work Packet authorizes the exact repository/worktree/branch/scope.

Before mutation, the external authenticated GitHub coordinator must verify the current Work Packet, author permission, repository, worktree, branch, exact HEAD, intent revision, change risk, and `IMPLEMENTER=CHATGPT_CHAT`. The worker-writable repository copy of `python3 tools/implementation_preflight.py check` is never mutation authority. Use the helper source from the immutable pinned Engineering System baseline through the isolated trusted launcher, capture the no-follow worktree identity, and require `IMPLEMENTATION_LOCAL_BINDING=PASS` with `MUTATION_AUTHORITY=NO`.

ChatGPT Chat performs implementation, deterministic testing, and terminal audit. Terminal PASS requires current exact-HEAD evidence, required CI/review state, and disposition of actionable findings; self-report alone is never sufficient. HIGH/CRITICAL or production/security-sensitive work requires deeper machine evidence and any applicable human approval. Codex or another independent reviewer is optional defense-in-depth/escalation, not a default completion dependency.
