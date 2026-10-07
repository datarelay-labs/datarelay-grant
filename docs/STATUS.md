# R1 implementation status

Updated: 2026-10-07. Canonical work coordination: GitHub Issue #33.
Status: development candidate; not production/GA or full R1 acceptance.
Exact candidate HEAD, PR/CI and terminal execution receipts belong in the live Work
Packet, rather than a self-referential commit hash in this file.

## Implemented candidate

- Exact unpublished Foundation SDK stage and public imports; real shell, login,
  MFA/recovery, account/session, health and audit adapters.
- One fixed approver per profile; immutable request/action, explicit decisions,
  hold, expiry, bounded reminders, cancel and linked replacement via UI/API.
- Source-scoped credentials; metadata/revocation and transactional current-authority
  checks. Integration credentials cannot make human decisions.
- Durable decision/outbox, actual HTTP/SMTP transport adapters, registered destinations,
  TLS validation, signed outcomes, retries/resends and separate execution reporting.
- Action-bound consume/replay protocol and non-executing Python integration client.
- Protected local state, new-path backup/restore, paused reconciliation and conservative
  invalidation of restored open requests. No blind replay of uncertain external work.
- Reproducible dependency/SDK setup, source+web candidate packaging, API examples,
  operator runbook and complete browser/external acceptance scenarios.

## Observed development evidence

The development checkout has executed 55 Python cases, 11 frontend adapter cases,
TypeScript checking/build, pinned Foundation stage hashing and five actual browser
journeys. Browser coverage includes two independent requester/approver passes, mobile
shared administration, UI cancellation/replacement, admin account/profile setup and
credential revocation. Final exact-HEAD reruns and CI are recorded in Issue #33.
Do not infer final qualification merely from these counts.

The browser harness uses disposable accounts, a temporary database and real LOOPBACK
SMTP/HTTP. Consumer execution/result is an identified fixture, not an actual DataRelay
operation. Screenshots and traces remain local; raw test credentials are not published.
A Starlette TestClient deprecation warning is observed; tests pass without suppressing it.

## Milestone disposition

| Milestone | Current disposition |
| --- | --- |
| M0 | Shared product baseline implemented; unsupported TLS/lifecycle UI mutations remain unavailable, with explicit CLI/operator boundaries |
| M1 | Approval/UI engine verified locally; real designated-inbox delivery not yet evidenced |
| M2 | Common API and transport contracts verified locally; deployment credentials/endpoints not configured |
| M3 | Consumer client/contract ready; actual existing DataRelay operation integration is NOT completed |
| M4 | Stellar payload/tenant/return contract and setup guide ready; actual Stellar request/receiver evidence is NOT completed |
| M5 | Local browser/recovery/build work implemented; final external integration and owner acceptance gates remain open |

## External prerequisites and remaining work

1. Identify the approved representative DataRelay product operation and its actual
   execution boundary/consumer development lane. Grant must not overwrite another
   product's concurrent work or claim the test consumer as that integration.
2. Use the approved SMTP installation configuration and designated recipient; verify
   real receipt. No passwords or private keys should be pasted into chat/issues.
3. Confirm deployed Stellar version, existing outgoing responder and actual supported
   webhook receiver with its tenant/auth contract. No permission change, new proxy,
   product upgrade or customer production experiment is implicitly authorized.
4. Validate the actual round trip and consumer effect on the frozen candidate, then
   perform the applicable release/acceptance steps. No tag/publication has been made.

These prerequisites do not invalidate the completed local implementation/tests,
but they prevent calling the entire R1 roadmap finished or the product ready for
unattended production use. Engineering System migration Issue #32 remains separate.
