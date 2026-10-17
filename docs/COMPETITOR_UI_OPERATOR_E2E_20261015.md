# Grant 1.0 competitor-UI operator E2E — 2026-10-15

## Scope and owner decision

The owner directed ChatGPT to execute the Grant product E2E and present the resulting development UI/evidence for final owner review. This document qualifies the **competitor-UI WBS lane only** using the WBS §1.1 `DISPOSABLE_PRODUCT_E2E` operator model.

This is not a claim that the repository-wide `FULL_USER_E2E` release contract passed. The original 121 scenario IDs, independent-human/two-mailbox requirement, direct Outlook/Apple Mail client observations, native Control/Stellar effects, release, merge and production remain separate.

## Candidate identity

- Repository: `datarelay-labs/datarelay-grant`
- Branch: `feat/grant-g10a-g0-integrated-candidate`
- Operator E2E test HEAD: `0b88d9dd094833e508ae7b73dbc331a7922d33d0`
- Product source: `391b3092118ab5c22fa0eac40ffc1609686fe5d4`
- Product delta from that source at qualification: no `grant/` or `web/src/` product change; later commits are tests/docs/evidence.
- Deployed preview index SHA256: `594455180760fd845b19ada721ed7836acd2136e7d27a5460c52e2e577af125d`
- Deployed/repository JS SHA256: `0c9f1a20569fa18d1e9b5dac3b11c0903ebf0eb27b13b5127b21b35d1f80936b`
- Development preview: `https://221.139.249.116:18443/`
- Worker remains disabled.

## Mounted Browser E2E

Command: `bash scripts/checks.sh browser`

Result: **46/46 PASS**, six isolated-backend batches, zero skipped/unexpected/flaky/error cases.

The run exercises independent browser contexts for requester, approver, administrator, member/stranger and delegate roles; explicit Review -> Confirm transitions; Hold/Approve/Deny/Cancel; two fresh approval passes; notification transport capture; no-login email PIN and same-mailbox OTP confirmation; replay rejection; role isolation; mobile 320/375/390 flows; Administration; policy/group/configuration/audit/integration/operations surfaces.

New U6.06 acceptance case: **PASS in 5.1s**. The mounted Notifications UI creates an exact saved template revision, refreshes authoritative saved state, reviews `Send test to me`, performs one explicit Confirm, observes one durable `ACCEPTED` attempt, verifies `transport_accepted=true`, `receipt_confirmed=false`, `execution_allowed=false`, captures one SMTP message only, verifies dummy PIN material, and verifies no decision-intent capability URL exists in the test message.

## Email-canvas qualification

Command: `npm --prefix web run test:canvas` (existing authorized run)

Result: **49/49 PASS in 4.9m**.

The U7 mounted keyboard task completed preset -> body wording -> approval-button size -> 390/375/320 layout checks -> Save -> Confirm -> authoritative refresh -> reopen in **13.2s**, with persisted `compact` preset, large button size, edited body, and no product errors. The core already-open-editor body/button change uses at most three purposeful control choices excluding text entry. This is an **OPERATOR_AUTOMATION_PROXY**, not novice-human evidence.

U6.04/U6.05 test-send review, one-shot ACCEPTED reconciliation, ambiguous UNKNOWN non-replay and ATTEMPTED latching also PASS in the same 49-case run.

## Real Gmail transport boundary

Connected Gmail was re-read independently from the disposable SMTP fixture.

The corrected-sender Grant R3 current-candidate message received by Gmail on 2026-10-14 used `smtp@rick.kr` -> `rick@rick.kr`, multipart/alternative with text/plain + text/html, and Gmail Authentication-Results reported **DKIM PASS** and **SPF PASS**. The message body contains rendered approval content and View Details.

This is retained as actual Grant SMTP-to-Gmail transport/MIME evidence. It is **not** represented as the exact disposable U6.06 fixture message. U6.06 competitor-UI acceptance is therefore composed boundary evidence: exact saved-revision product-flow proof plus independently observed real Gmail transport proof on the unchanged renderer/product source.

## Competitor-UI acceptance disposition

- **U6.06:** operator UI/API/SMTP one-shot path PASS + real Gmail boundary PASS; exact-fixture-to-Gmail identity is not claimed.
- **U7.04:** UI-lane mail compatibility PASS from real Gmail MIME/transport plus mounted width/images-off/dark simulations. Direct Gmail UI, Outlook and Apple Mail observations remain follow-up and are not claimed.
- **U7.05:** operator disposable-product E2E PASS. Independent-human/two-mailbox `FULL_USER_E2E` remains a separate release gate and is not claimed.
- **U7.06:** operator usability proxy PASS (13.2s task; core body/button choices <=5). Novice-human evidence is not claimed.
- **U7.07:** tested product bytes equal deployed preview bytes and mounted operator E2E PASS. Final owner visual review remains U9.04.

## Explicit exclusions

No production action, PR merge, release, customer/native Control effect, Stellar receiver effect, independent-human claim, Outlook/Apple Mail direct-client claim, or `FULL_USER_E2E=PASS` claim is made by this evidence.

The only remaining competitor-UI closure action after technical reconciliation is owner review/acknowledgement under U9.04.