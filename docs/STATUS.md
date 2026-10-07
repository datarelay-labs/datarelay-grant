# Grant 1.0 implementation status

Updated: 2026-10-07. G1/G2 coordination: GitHub Issue #38; baseline/external lane: Issue #33 / PR #34.
Status: Grant 1.0 development candidate, not production/GA or full 1.0 acceptance.
Exact HEAD, CI and execution receipts belong in the live Work Packet rather than
in a self-referential source commit.

## Product direction

The accepted target is now **Grant 1.0**, governed by `docs/PRODUCT_STANDARD.md` and
sequenced by `ROADMAP.md`. The current branch remains a development baseline, not a
claim that all 1.0 workstreams are implemented. Existing R1 evidence is retained as
historical/current baseline evidence and maps into the broader 1.0 roadmap.

## Implemented candidate

- Pinned unpublished Foundation SDK and public imports; real shell, login,
  MFA/recovery, accounts/sessions, health and audit adapters.
- Versioned approval policies with explicit Draft -> Testing -> Active -> Disabled
  lifecycle, clone/history, bounded deterministic selectors and shared runtime/preview
  resolution. Saving never makes a policy live; isolated tests cannot authorize execution.
- A coherent Notifications area with complete event template sets, explicit safe
  variables, rendered preview/test send, delivery health/retry visibility and system
  branding. Each request snapshots the exact policy version and notification content so
  later policy/template/branding changes apply only to new requests.
- One fixed approver per policy; immutable action, explicit approve/hold/deny,
  expiry, bounded reminders, cancellation and a linked replacement request.
- Source-scoped credentials, metadata/revocation and current-authority checks.
  An integration credential cannot make a human decision.
- Transactional decision/outbox, HTTP/SMTP delivery, registered endpoints, TLS,
  signatures, retry/resend and separate decision/delivery/execution states.
- Action-bound consume/replay and a non-executing Python integration client.
  Receipt, claim and result responses must match the submitted identifiers and
  action; ambiguous/oversized JSON and non-finite values fail closed.
- Protected local state, new-path backup/restore, paused reconciliation and
  conservative invalidation of restored approvals; no blind external replay.
- Locked dependency/SDK setup, source+compiled-web candidate packaging, independent
  archive/HEAD/file-hash verification, operator and external acceptance contracts.

## Observed development evidence

The current G1/G2 development tree passes 132 Python contract/lifecycle cases, 12
frontend adapter cases, static checks, typecheck/build, and five real browser journeys.
The browser administration journey exercises Notification template-set preview/test send
and Approval Policy Draft -> Testing -> isolated test -> Activate -> runtime preview ->
history. Final exact-HEAD confirmation and CI belong in active Work Packet #38.

Browser cases include two independently signed-in requester/approver passes,
mobile shared administration, cancellation/replacement, account creation,
notification-template/policy lifecycle administration and scoped credential revocation.
Screenshots were inspected. Browser tests use actual loopback SMTP/HTTP and disposable
accounts; the executor is explicitly a
fixture, not the real DataRelay consumer. Never promote these into external PASS.
Raw fixture credentials and trace archives remain private and untracked.
A Starlette TestClient deprecation warning is recorded without suppressing it.

## Milestone disposition

| Milestone | Disposition |
| --- | --- |
| M0 | Foundation/auth/admin baseline implemented and locally tested; unsupported lifecycle/TLS mutations stay unavailable |
| M1 | Core/UI plus versioned approval-policy and Notification administration tested; baseline Gmail STARTTLS/AUTH/submission and actual receipt at a distinct designated mailbox verified |
| M2 | API, strict consumer replies, durable transport and recovery tested on the development server |
| M3 | Consumer contract/client implemented; actual existing DataRelay operation NOT integrated/accepted |
| M4 | Stellar request/tenant/callback contract and guide implemented; actual Stellar receiver evidence missing |
| M5 | Browser/recovery/build verification available; actual integrations and owner acceptance still open |

## Real prerequisites, not development permission problems

1. The private Foundation web CI job requires an approved read-only dependency
   credential. The Grant repository has no repository Actions secrets at this
   observation. Host credentials are not exported or copied into Actions.
2. Read-only Control coordination reports its dev API intentionally stopped for
   preserved-database compatibility repair: datarelay-labs/datarelay-control#388,
   PR #389. Do not reset/redeploy that database or disturb its browser audit.
   Recheck the dependency and connect one actual operation at the product-owned
   execution boundary. Fixture execution is not M3 completion.
3. Stellar's deployed version, outgoing responder, actual supported webhook
   receiver and tenant/auth contract must be provided or located in the approved
   development environment. No production experiment or new relay is authorized.
4. Reconcile actual consumer/receiver evidence on the frozen candidate before
   full R1 acceptance. Publication, production and credential changes stay separate.

Remote dev-atlas execution, source editing, and authenticated GitHub coordination
are available. Engineering System migration #32 remains a separate workstream.
