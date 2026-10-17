# Grant competitor-informed decision-workspace evidence (G-CI-1)

As of 2026-10-10. Scope: Jira Service Management Cloud (company-managed service
spaces) and Teleport Identity Governance 18.x (Enterprise unless stated).
Grant source inspection baseline: `datarelay-labs/datarelay-grant`,
`feat/grant-g10a-g0-integrated-candidate@9333b8f164c90d304c018358a09bf0479ad54407`.

This record reuses the Product Foundation PF-CI evidence classification, not a
new generic crawler. Vendor assertions below are official-document observations,
**not** a claim that ChatGPT logged in to, screenshotted or operated a vendor UI.
Grant assertions are tied to a specific local source path and tests, not to a
deployed customer installation. No proprietary implementation was copied.

## Evidence contract

- **DOCUMENTED**: exact first-party published manual; edition and use-case
  recorded, observed vendor runtime behavior **NOT VERIFIED**.
- **SOURCE_PRESENT**: actual Grant repo source/test path at recorded baseline;
  not necessarily mounted in its current browser entry route.
- **SOURCE_REPRODUCED**: a bounded source behavior failed a new deterministic
  regression before a narrow source correction; not genuine user acceptance.
- **NOT VERIFIED**: actual vendor/customer product UI, human mailbox receipt,
  CI or external business effects not independently observed.
- **DEFER/OUT OF SCOPE**: compelling competitor capability that does not belong
  in the accepted Grant 1.0 approval/execution-control boundary.

## First-party references, scope and confidence

| Source | Edition / relevant observed contract | Confidence |
| --- | --- | --- |
| [Jira — approval steps](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-approvals/) | **Jira Service Management Cloud company-managed**: Approvers or Approver groups fields and an approval step in a request workflow, with named approvers, configured groups or request-type/service-derived approvers. | DOCUMENTED; vendor login/UI NOT VERIFIED |
| [Jira — approval email security](https://support.atlassian.com/jira-service-management-cloud/docs/manage-settings-for-approval-by-email/) | **Jira Service Management Cloud company-managed**: administrators configure approval email behavior: direct approve/decline or link to request view. This does not document Grant's PIN/MFA equivalent. | DOCUMENTED; vendor email delivery NOT VERIFIED |
| [Teleport — Role Requests](https://goteleport.com/docs/identity-governance/access-requests/role-requests/) | **Teleport Identity Governance Enterprise 18.x**: role/resource request, reviewer Needs Review list, reason and access request review; approved role elevation remains separate from original request. | DOCUMENTED; Enterprise actual UI NOT VERIFIED |
| [Teleport — JIT request model](https://goteleport.com/docs/identity-governance/access-requests/) | **Enterprise 18.x**: configurable approval count, short-lived privileged elevation; Community Edition full web review is unavailable (CLI-only subset). | DOCUMENTED; no equivalence to Grant external execution |
| [Teleport — reviewer configuration](https://goteleport.com/docs/identity-governance/access-requests/access-request-configuration/) | **Enterprise 18.x**: reviewer role and request-reason constraints. | DOCUMENTED; vendor configuration NOT VERIFIED |
| [Teleport — email plugin](https://goteleport.com/docs/identity-governance/access-requests/plugins/email/) | **Enterprise Cloud**: email notification integration. Not proof of a Teleport loginless email decision/PIN control. | DOCUMENTED; vendor inbox NOT VERIFIED |

## Actual Grant parity — no duplicate implementation

| Operator need | Existing Grant source-backed behavior | Disposition / legacy roadmaps |
| --- | --- | --- |
| Policy rule, approval group, threshold, draft/test/active/disabled | `web/src/policies.tsx`, `web/src/approvers.tsx`, `grant/core.py`, `tests/test_multi_approval.py`: SINGLE, ANY_ONE, ALL, N_OF_M, SEQUENTIAL; versioning and safe snapshots. | **SOURCE_PRESENT**, no new workflow/group implementation. Under M3 (G1/G3/G4), fix only verified stale multi-admin lifecycle gaps. |
| Email approval choices and verification | `grant/decision_links.py`, `grant/decision_otp.py`, `web/src/email_decision_portal.tsx`, `web/src/email_decision_adapter.ts`: scoped answer links, PIN, optional same-mailbox OTP or fresh Grant TOTP, explicit final POST. | **SOURCE_PRESENT** backend/standalone presentation; complete integrated loginless Web route and independent mailbox E2E still **NOT VERIFIED** (M4/G10A). Never treat email GET as decision. |
| Needs-review queues and requester status | `web/src/request_inbox.tsx`, `grant/core.py`: server role filters/views, progress, awaiting/held/overdue, assignment and delegation, pagination. | **SOURCE_PRESENT**; do not copy a new ITSM queue. **SOURCE_REPRODUCED** P0 issue: browser-local date conversion shifts UTC created ranges and loses last-second fractions. Narrow M1 correction. |
| Reviewer vote and decision context | `grant/core.py::_project` already returns current seat-level decisions, reason and time; `web/src/request_evidence.tsx` originally only exposed a collapsed raw Request timeline. | **SOURCE_PRESENT** backend, **SOURCE_REPRODUCED** poor initial visibility. M1 adds read-only current seat summary. Holds can be overwritten, so it is NOT a complete chronological event ledger or verified-human identity; keep the original audit timeline. |
| Audit / policy history / execution result | `web/src/audit_explorer.tsx`, `web/src/request_evidence.tsx`, `grant/audit_evidence.py`: bounded role-authorized audit, policy version and reported execution. | **SOURCE_PRESENT**; G9 already implemented; real external execution readback **NOT VERIFIED**, M6. |
| Shared Login/Sidebar/Administration | `web/src/foundation.config.ts`, `web/src/administration.tsx`, pinned `web/foundation.lock.json`: shared Foundation Auth, ProductShell, canonical AdministrationHub. | **SOURCE_PRESENT**, current pin pf8.4. Two actual B2 `ADMIN_CAPABILITY_CONTRADICTION` member projections `core.users` and `grant.smtp.test` remain **OPEN**; prior Administration/app/styles/mobile/PR tool stops bind. M2. |
| Test mail, queue and recovery | `grant/core.py`, `grant/transport.py`, `docs/OPERATIONS.md`: message templates, delivery health, SMTP accepted-only semantics, source-backed pause guards. | **SOURCE_PRESENT**, B4/B5 source bug fixed; real recipient inbox / authorized credentials **NOT VERIFIED**. M3/M5. |

## Decision: priorities, not a new vendor clone

1. **P0 now / M1:** keep existing approval mode and inbox APIs; correct UTC
   calendar date filters and surface the current seat decisions with a clear
   approval-versus-execution evidence distinction. Tests must fail first, then
   pass, with no new business authorization or session path.
2. **P0 M2–M4:** safe Control-family Foundation role/UI parity (two proven
   member contradictions), G1/G2 stale administrator policy/template update
   safety, mounted G10A decision UI and real-person PIN/OTP/MFA acceptance.
   Already-developed logic is NEVER reimplemented.
3. **P0 M6–M8:** independently observed authorized Control/Stellar effects,
   actual same-HEAD two-person mailbox/browser flow and owner release. No
   mocked source results can be promoted to acceptance.
4. **P1 after P0 stability:** task labels, first-run guidance and other
   verified navigation clarity only where a directly operated user test
   shows a real deficiency. Do not import Jira arbitrary workflow editing,
   customer-choice-of-approver or Teleport role elevation into Grant.
5. **P2 / G-CI-5:** no REA or browser collector rerouting after prior platform
   denials. Existing licensed local/open-source Foundation tooling may be
   consulted by its owner under explicit legal/operational scope; no new
   proprietary reverse engineering, messenger or SSO roadmap expansion.

Security invariant: notification, email GET/HEAD, request creation and
approval do not perform an external effect. Current policy/assignee/action
fingerprint, per-seat one-use decision, independent step-up where configured,
durable consumer ledger and auditable readback remain the only accepted path.

Actual vendor login or product browser observations: **NONE IN THIS STUDY**.
Actual independent two-real-user Grant E2E and external consumer/receiver: **OPEN**.
