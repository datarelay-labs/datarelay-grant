# Competitor UI R1 Deployment Reconciliation — 2026-10-14

## Result

- Scope: 52 WBS rows that already had source plus mounted-interaction evidence and were identified as R1 in the roadmap review.
- Result: **50 development deployment PASS + 2 NOT_APPLICABLE_WITH_JUSTIFICATION (U7.02, U7.03)**.
- Acceptance was intentionally unchanged: all 52 rows remain acceptance=NOT_RUN until their applicable real-user/mail-client acceptance is executed.
- U8.08 is excluded because retained S02 is still unavailable and its source/interaction reconciliation is incomplete.

## Deployment evidence basis

- Evidence reconciliation head: 93c74f88e0ce784cdb89cdf042d60f2c22c375e8.
- Product source: 4fe71b4b96c66ed80e7c67138c784e17b0714435. git diff --name-only 4fe71b4b96c66ed80e7c67138c784e17b0714435..93c74f88e0ce784cdb89cdf042d60f2c22c375e8 -- grant web/src mail-renderer returned no product-code paths.
- Development HTTPS preview: https://221.139.249.116:18443/.
- Running preview process imports grant, grant.email_renderer, grant.email_assets, and grant.email_publication directly from /home/aella/datarelay-grant-g10a-g0-integration-dev/grant/.
- Local public-bind readback: / and /login HTTP 200; protected /api/v1/admin/info HTTP 401 without credentials.
- Independent dev-drcontrol readback returned the same index, JavaScript and CSS bytes.
- Index SHA256: 13b82636ae478341a77ec3f8022bc898f34a9164ef059445ab749a5c78835a4e.
- JavaScript SHA256: 6b1a8de7c5c0af251b75aee79692c6029f3206e2548666e4557b51f3c3ea4f47.
- CSS SHA256: fdfe5b6538e38afec8a1a496ac1b9f27339b6ac11f9ad8b747564b6b7c648814.
- Worker remains disabled and SMTP remains unconfigured; no real mail or external business effect was performed.

## Applicability rule

- PASS: the WBS requirement targets Grant Web/backend product code included in the deployed candidate. Deployment PASS means the implementation is present in the running development candidate; it does not mean authenticated user acceptance or external effects passed.
- NOT_APPLICABLE_WITH_JUSTIFICATION: U7.02/U7.03 are qualification rows whose independent deployment provenance is owned by U7.07. Their mounted interaction evidence remains authoritative and is not re-labeled as deployed-user acceptance.

## 52-row reconciliation

| WBS | Dev deployment | Requirement |
| --- | --- | --- |
| U1.01 | PASS | One filled email canvas, readable left outline, contextual right inspector and compact header/context bar. S01/S02, UI-01. |
| U1.02 | PASS | Click heading/body/actions or keyboard outline to select/highlight the same block and show only relevant settings. |
| U1.03 | PASS | One structured draft and stable renderer-owned block IDs; preserve archived layout versions. |
| U1.04 | PASS | Safe edit-only canvas; exact-output preview remains isolated. |
| U1.05 | PASS | Protected/optional block indicators, bounded Add content and explicit move controls only where schema allows. |
| U1.06 | PASS | Narrow layout uses one canvas and contextual drawer with keyboard/focus parity. |
| U1.07 | PASS | Clear unsaved/saving/saved/error states; Back/Close cannot silently discard changes. |
| U2.01 | PASS | Email Templates inventory: real thumbnail, published/draft state, authoritative policy usage/drill-down, update metadata, obvious Edit draft; history/duplicate secondary. |
| U2.02 | PASS | Standard/Compact/High visibility actual-render thumbnails and filled new-template start; no wizard. |
| U2.03 | PASS | All nine events with human labels; event-scoped subject, supported preheader, heading and bounded safe body formatting. |
| U2.04 | PASS | Visible This event / All events in this template set / Controlled by approval policy scope. |
| U2.05 | PASS | Searchable safe variables with human label/example/description and token secondary; insert into active compatible field at selection. |
| U2.06 | PASS | Reset appearance is scope-specific and preserves wording/locale; Restore wording shows event/language and confirms replacement. |
| U2.07 | PASS | Whole-draft undo/redo and template-isolated history. |
| U2.08 | PASS | Explicit EN/KO copy and locale fallback without silent translation or browser-locale send changes. |
| U3.01 | PASS | Brand, event/status, title, short explanation, required action/target/reference/deadline context, three decisions, separate details and verification notice in that order. |
| U3.02 | PASS | Visual S/M/L controls, bounded body/button font, horizontal/vertical padding, gap, radius and desktop/mobile layout. |
| U3.03 | PASS | Curated readable palette and custom allowed brand/body/background/action colors, contrast feedback; advanced controls collapsed. |
| U3.04 | PASS | Locked action identity/URLs, canonical localized Approve/Hold/Deny plus bounded optional suffix; distinct styled View Details. |
| U3.05 | PASS | Eligible requested/reminder messages alone expose active decisions; terminal/result messages do not. |
| U3.06 | PASS | Correct EMAIL_PIN / EMAIL_PIN_PLUS_OTP / EMAIL_PIN_PLUS_MFA instructions and mandatory final Confirm. |
| U3.07 | PASS | Safe subject/preheader/body formatting, emphasis/lists/alignment and clear variable error limits. |
| U4.01 | PASS | One canonical structured subject/HTML/text render contract for preview, test and real-message composition; reuse ET-1. |
| U4.02 | PASS | Retain last valid preview during refresh, visibly stale, with ordered requests and cleanup. |
| U4.03 | PASS | Synthetic normal/long EN/long KO/missing-optional samples, nine events and three verification modes. |
| U4.04 | PASS | Actionable block-linked errors and recovery rather than technical numbers or fake readiness score. |
| U4.05 | PASS | Desktop and 320/375/390px layout views; meaningful HTML/plain-text tabs; image-off/dark-mode simulations clearly labeled. |
| U4.06 | PASS | Draft preview is read-only and inert; no vendor service, credential disclosure or approval/delivery effects. |
| U4.07 | PASS | Diagnostics holds renderer/layout identity, HTML bytes, protected-action counts and exact-output inspection. |
| U4.08 | PASS | Unsaved/saved-preview distinction and one normal editing preview workflow. |
| U5.01 | PASS | Published revision versus saved/unsaved draft clearly displayed; Save draft never activates a version. |
| U5.02 | PASS | Review & publish displays before/after rendered mail, changed copy/styles/events and blocking errors. |
| U5.03 | PASS | Authoritative policy impact, affected events and future-request-only warning. |
| U5.04 | PASS | Role/CAS/current actor/review digest binding and explicit Confirm; safe conflict recovery. |
| U5.05 | PASS | Immutable template/layout/renderer/locale/asset snapshot for requests, queued mail, reminders and reissues. |
| U5.06 | PASS | Discoverable version history with truthful editor/time/version metadata and view-only historical preview. |
| U5.07 | PASS | Rollback restores an older design by creating a NEW draft/revision and reviewed publication. |
| U5.08 | PASS | Lossless opt-in legacy text migration and shared-layout revision governance. |
| U6.01 | PASS | Polished text-brand and footer with editable name/wording/styles; sender mailbox authority remains separate. |
| U6.02 | PASS | Bounded safe raster logo upload, validation and immutable content-addressed assets; reject arbitrary remote URL/SVG/script. |
| U6.03 | PASS | Qualified asset delivery/CID and images-off fallback with immutable snapshot binding. |
| U6.04 | PASS | Send test to me reviews the exact saved draft, current preview digest, approved own mailbox and inert content. |
| U6.05 | PASS | Explicit one-shot test Confirm, transport-accepted versus inbox-received status, ambiguous-result reconciliation. |
| U7.02 | N/A — U7.07 owns deployment provenance | Mounted end-to-end editor task: preset -> body select/edit -> actions select/size/color -> mobile -> save -> reopen. |
| U7.03 | N/A — U7.07 owns deployment provenance | Keyboard, focus, touch/narrow layout, contrast and error recovery on mounted screens. |
| U8.01 | PASS | Novice Home and task navigation make requester/approver/admin next actions obvious; no text wall or false zero/loading state. |
| U8.02 | PASS | B1 approval Inbox/workspace, assigned review-next, request preview/deadline/status and distinct decisions. |
| U8.03 | PASS | Guided New Request and Request Detail information hierarchy, readable progress and clear review/confirm path. |
| U8.04 | PASS | Approval policy and approver/group management with usable draft/review/activation and notification-template assignment. |
| U8.05 | PASS | Administrator first-run workflow and notification/delivery operations use clear next actions and honest state. |
| U8.06 | PASS | Approval history, audit/timeline and operational/integration detail remain discoverable and evidence-based. |
| U8.07 | PASS | Foundation ownership and actual Grant System Management availability/routing remain truthful. |

## Explicit exclusions

- No acceptance gate was advanced by R1.
- No credential, role, permission, SMTP, external system, production, merge or release action was performed.
- U0.01/U0.03/U8.08 remain blocked on retained S02.
- U6.06 and U7.04–U7.07 retain their explicit real-environment/persona acceptance blockers.
- U9 remains dependent on those unresolved gates.
