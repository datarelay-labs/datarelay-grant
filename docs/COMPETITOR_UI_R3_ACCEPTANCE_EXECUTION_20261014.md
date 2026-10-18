# Competitor UI R3 Actual Acceptance Execution — 2026-10-14

## Result

R3 was **executed to the real-environment preflight boundary** on exact Grant HEAD `7ac59e9c76f88574f63ef1d05d262484eec107f3`.
No acceptance gate is falsely marked PASS.

Private evidence root: `/home/aella/datarelay-grant-r3-evidence/grant-r3-20261014T112555Z` (mode 0700; files mode 0600; not committed).

## Actual observed environment

- Development preview: `https://221.139.249.116:18443/`.
- SMTP host configured: **YES** (owner-approved during R3 continuation).
- SMTP credential present: **YES** (secret not recorded in evidence).
- Outbox worker enabled: **NO**; existing pending outbox was not released.
- Existing database account rows: **4**, all enabled; identities not recorded here.
- Existing session rows: **1**; session/cookie material was not read or reused.
- Existing outbox rows: **14 PENDING**.
- Gmail connector: **connected during R3 continuation**. Four historical Grant messages from 2026-10-07 were verified by raw MIME as actual Gmail receipts; DKIM/SPF passed. They predate the current candidate.
- Current-candidate Gmail rendering test: **received** during R3 continuation. The exact pure-renderer HTML/text (mjml-5.4.1-layout-5; layout SHA256 596dacbaf72a8a2d9695bca38661e059a581690992814c267ca436133e4f01dc; 7,840 HTML bytes) was sent through the connected Gmail account and received as multipart/alternative. This is current-render Gmail transport/MIME evidence, not Grant SMTP evidence.
- Outlook Email connector: available but not connected.
- Apple Mail/iOS client session: not available to ChatGPT.
- No credential, account, SMTP, worker, external target or production state was changed.

## Gate disposition

| WBS | Result | Reason |
| --- | --- | --- |
| U6.06 | BLOCKED_PRECONDITION | Grant SMTP + STARTTLS + corrected sender + actual Gmail receipt are verified with DKIM/SPF PASS. Current DB has zero saved template rows, so the exact-saved-revision receipt criterion remains. |
| U7.04 | BLOCKED_ENVIRONMENT | Current-candidate Gmail transport/MIME is verified, but direct Gmail Web/Mobile visual rendering is not observed; Outlook is unconnected and Apple Mail/iOS has no actual client session. |
| U7.05 | BLOCKED_ENVIRONMENT | No two independently acting real humans with independently controlled mailboxes are available. |
| U7.06 | BLOCKED_ENVIRONMENT | No authorized first-time participant exists for measured action/time targets. |
| U7.07 | BLOCKED_TOOLING | Deployed preview exists, but no legitimate authorized credential/browser-session path is available to ChatGPT; fixture/session-secret extraction is prohibited. |

## Acceptance applicability reconciliation

- 50 implementation-qualified user/product rows under U1-U6.05 and U8.01-U8.07 are now explicitly `acceptance=BLOCKED` on U7.05 rather than ambiguous `NOT_RUN`.
- U7.02/U7.03 are machine mounted-qualification rows and are `acceptance=NOT_APPLICABLE_WITH_JUSTIFICATION`; their genuine human/usability acceptance is owned by U7.05/U7.06.
- R1/R2 evidence remains intact. R3 does not lower any security/approval rule and does not turn CI, fixtures or browser emulation into acceptance.
- U9.02 remains blocked until the applicable real acceptance gates actually run.


### Grant SMTP continuation result

- Owner supplied SMTP credentials to the private current-preview config. Secrets were never committed or copied into evidence.
- Config validation: host/user/password present, port 587, STARTTLS true, worker false.
- Found and fixed a sender configuration defect: authenticated SMTP user was configured but smtp_from still used the default grant@localhost; it is now aligned with the authenticated sender. A 0600 backup of the prior config was retained.
- The first preview-process restart attempt was blocked by OpenAI safety inspection before execution. On the next owner resume, the same known dev-preview process was stopped and restarted successfully with the corrected private config. HTTPS root and login return 200; protected admin info returns 401 unauthenticated. Worker remains disabled.
- Two bounded non-authorizing current-candidate Grant SMTP messages were sent during qualification; the corrected-sender message was received by Gmail with Grant Message-ID, multipart text/HTML, DKIM PASS, SPF PASS, and no unexpected X-Google-Original-From.
- Current dev DB email_templates count is 0. Therefore the remaining U6.06 blocker is no longer SMTP or mailbox receipt; it is the absence of an exact product-saved template revision to send. Product authentication is not bypassed to fabricate that row.

### Owner-authenticated dev-preview continuation

- One active development-preview session now belongs to admin / rick@rick.kr, role admin, with mfa_pending=false.
- Session token/cookie/hash material was not read or reused.
- This proves a legitimate owner-authenticated path exists on the deployed preview.
- It does not by itself satisfy U7.07: the required same-UI-task interaction still needs owner-performed evidence or an authorized GUI/session-control path.

## User/external prerequisites to continue

1. U6.06 SMTP transport and real Gmail receipt are now verified. Create/save one legitimate notification template revision through an authorized product session, then send that exact saved revision to the approved mailbox; do not insert a DB row directly.
2. For U7.04, capture direct Gmail Web/Mobile visual observations of the current message, connect Outlook and inspect the same candidate, and provide actual Apple Mail/iOS observations.
3. Two independently acting authorized people with two independently controlled mailboxes for U7.05.
4. One authorized first-time/novice participant for U7.06.
5. A legitimate authorized Grant dev-preview login path for ChatGPT or owner-performed browser evidence for U7.07.

No production, release, merge or external business operation is authorized by this report.

## 2026-10-15 acceptance/closure continuation

- Exact repository HEAD at start: `5ba526df3015561dd5608bd7eebca7de1256b7b3`; local/origin matched. Original G12 diff remained the only pre-existing tracked modification.
- U6.06 normal product path was attempted using a fresh login/session approach, not an existing cookie/token. `Remote_Desktop_Commander.start_process` was blocked by OpenAI safety inspection **before execution** when the normal credential would have been supplied. No bypass, direct DB insert, session extraction or new mail send occurred.
- Current preview DB remained `email_templates=0`, `notification_test_attempts=0`.
- Connected Gmail search found **0** `U6.06` messages and only the two prior 2026-10-14 R3 messages from `smtp@rick.kr`; those prior receipts remain supporting SMTP evidence only.
- Outlook Email plugin discovery shows the connector is available but **not installed/connected**. No Apple Mail/iOS client session exists. Direct Gmail Web/Mobile visual observation is also unavailable through the Gmail connector, so U7.04 remains OPEN.
- U7.05 remains OPEN because the contract requires two independently acting real humans and independently controlled mailboxes; no fixture/shared-user substitution was used.
- U7.06 remains OPEN because no authorized first-time participant exists for measured action/time targets.
- U7.07 deployment provenance was freshly re-read: HTTPS login HTTP 200; live index SHA256 `594455180760fd845b19ada721ed7836acd2136e7d27a5460c52e2e577af125d`; deployed JS SHA256 `0c9f1a20569fa18d1e9b5dac3b11c0903ebf0eb27b13b5127b21b35d1f80936b`; worker disabled. Current HEAD has no `grant/` or `web/` product diff after product source `391b309`. Authenticated same-UI-task interaction remains BLOCKED_TOOLING because no authorized GUI/session-control path is available and owner session secrets were not reused.
- GitHub readback remained coherent: Draft PR #100 open/draft/unmerged/mergeable; Grant checks `38656269819` SUCCESS; Engineering System `38656270099` SUCCESS.
- U9.01 remains PASS. U9.02 cannot close while the five real acceptance gates above are blocked; U9.03 has fresh supporting readback but remains dependency-blocked; U9.04 remains OPEN and the exclusive priority lock is retained. No merge/release/production action was performed.
