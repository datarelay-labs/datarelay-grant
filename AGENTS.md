# DataRelay Grant Repository Engineering Rules

This repository follows the canonical Data Relay Labs Engineering System:
https://github.com/datarelay-labs/engineering-system

Adoption baseline: Engineering System version 1.6.0 at immutable commit `673c3b339a0765657214d40a22400a04ed54425b`.

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

- Follow the canonical Engineering System for design, implementation, validation, release, and operations work.
- Make the smallest correct change and do not silently expand scope.
- Do not report planned, mocked, or unimplemented behavior as current product capability.
- Before implementation begins, add task-appropriate tests and release configuration rather than inventing validation evidence.
- When explicitly resuming work, resolve this repository and branch first and continue from the matching active repository-scoped AI Work Packet.
