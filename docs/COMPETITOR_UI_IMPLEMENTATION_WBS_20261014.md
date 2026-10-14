# Grant 1.0 — mandatory competitor-UI implementation WBS

Owner directive: 2026-10-14. IMPLEMENTER=CHATGPT_CHAT. Repository: datarelay-labs/datarelay-grant. Existing Work Packet #67 and Draft PR #100 remain the only execution lane.

## 1. Exclusive priority and scope

PRIORITY=P0_COMPETITOR_UI_ONLY
EXCLUSIVE_SCOPE=GRANT_COMPETITOR_UI
ALLOW_UNRELATED_WORK=false
EXIT_GATE=ALL_MANDATORY_UI_ACCEPTANCE_PASS_AND_ZERO_UNMAPPED_ACCEPTED_REQUIREMENTS

This owner instruction supersedes older ET-1-first, assets-first, P0-SM-first and broad M1–M8 continuation instructions. Finish the existing canvas-first email-editor implementation first, then the remaining accepted competitor-derived Grant UI gaps in this WBS. Do not start unrelated backend features, Foundation development, infrastructure cleanup, optional enhancements or another competitor survey. Documentation, tests, build, ordinary Git/CI and development verification are allowed only when necessary to deliver this scope.

Preserve completed ET-1/ET-2 source; never rebuild them to satisfy an old handoff. Preserve all current worker edits, the original G12 RED diff and Inbox stash. Do not create a competing worktree or stage another worker's changes. Resume its exact first unfinished task. Read current code/evidence before selecting a task; an implemented and adequately evidenced task is reused, not implemented again.

If a task is blocked, retain its WBS row and evidence and execute the next dependency-ready task INSIDE this scope. A block never permits unrelated work, false completion, automatic scope reduction, alternate-tool circumvention or claiming every task is blocked. Retry a historic denial only through the original tool/target when current conditions legitimately permit; stop that operation on a repeated denial. When all remaining in-scope work is genuinely blocked, record the precise next action and stop without implying background work. Production, host/credential/permission changes, destructive actions, real SMTP activation, external execution, independent-human mailbox tests, merge and release retain their separate approval conditions. The priority lock does not grant those approvals.

Foundation owns common shell, controls, dialogs, theme and shared System Management. Grant owns approval-specific composition, schema, rendering and native adapters. Reuse accepted pinned Foundation components; no Foundation edits, forks or dependency upgrades in this work. Upstream dependency gaps remain explicitly open and do not become fake supported features.

## 2. Evidence basis and no-omission gate

S01: Existing docs/EMAIL_TEMPLATE_EDITOR_RESEARCH_20261014.md, its 20 product/project families C01–C20 and 33 recorded references R01–R33, Product Standard sections 10.10/10.11, and original ET-0–ET-7 roadmap. Already retrieved research content is the basis; no new public survey was performed here.
S02: Retained conversation artifact grant-email-editor-ui-reanalysis-20261014.md, sections 3–9: inventory, canvas, scope, variables, reset/history, recipient hierarchy, preview, publication and measured usability targets. All of those proposals are decomposed below; this WBS is a standalone execution contract rather than a link-only promise.
S03: Issue #37 audit comment 6159372744 and WP #67 audit comment 6159373603, including UI-01–UI-07 and the evidence failure analysis.
S04: Existing committed source checkpoint 69e4aa9560352363ff4cff438461f39329a98fd4: ET-1 cf3f9e2, ET-2 979ac58, form editor/live-preview/publication backend a991ad9, qualification 69e4aa9. These are historical source evidence, not proof that this WBS is accepted or deployed. New canvas/publication/inventory work is dirty/in progress at the first read of this update.

**Coverage update, not a completion claim (current continuation):** the original historical sources were normally retried with `Remote_Desktop_Commander.start_process` on the same dev-atlas worktree and read successfully. No alternate tool/host was used. `docs/COMPETITOR_UI_ORIGINAL_CROSSWALK_20261014.json` now retains the exact original ET-T01–ET-T24 and 121 Full User E2E row identities, wording, source lines/hashes and WBS links, plus the nine original UX gap rows and twelve structured findings. This is traceability, not execution. Historical narrative/S02/S03 atomization and current evidence attachment remain OPEN; do not claim zero omissions, a final atomic denominator or 100% implementation. The previous access-denial statement is historical and no longer a current read blocker.

### 2.1 Every previously surveyed email family has a disposition

| Source ID | Family | Adopted result / WBS mapping | Excluded or conditional part, retained explicitly |
| --- | --- | --- | --- |
| C01 | Jira Service Management | Presentation versus approval authority; clear decisions and details; U3.04–U3.06, U8.02 | Do not substitute reply-email or one-click approval for Grant verification/Confirm. |
| C02 | ServiceNow | Shared header/body/footer and event content; U2.04, U3.01, U6.01 | No user scripts or new workflow engine. |
| C03 | Power Automate approvals | Compact readable action message and client fallback; U3.01, U7.04 | Outlook actionable/AMP mail is not a universal dependency. |
| C04 | Pipefy | Friendly dynamic variables and filled preview data; U2.05, U4.03 | No arbitrary recipients/CC/BCC or raw HTML mode. |
| C05 | Kissflow | Event organization and policy-owned eligibility; U2.03, U3.05 | Style cannot enable actions prohibited by policy. |
| C06 | Beefree SDK | Protected blocks and bounded edit permissions; U1.05, U3.04, U6.02 | UI locks are not server authorization; no assumed offline vendor entitlement. |
| C07 | Unlayer | Dedicated approval component and one saved design; U1.03, U3.04 | No default vendor-hosted embed or second serialized HTML design. |
| C08 | Stripo Plugin | Selected-block settings; draft state separate from publication; U1.02, U5.01 | Autosave remains optional/private-draft only; no vendor data upload. |
| C09 | Mailchimp | Visual size, spacing, mobile controls and style reset; U2.02, U2.06, U3.02–U3.03 | No campaign segmentation, tracking pixels or conversion-oriented action bias. |
| C10 | Customer.io Design Studio | Canvas/inspector, reusable styles, review/publication; U1.01–U1.04, U5.02–U5.04 | Already-issued Grant snapshots never inherit a new published design. |
| C11 | SendGrid Dynamic Templates | Version list, tested active revision and recovery; U5.01, U5.06–U5.07 | Existing SMTP is retained; no delivery-provider migration. |
| C12 | Postmark | Shared layouts, typed inputs and HTML/text pairing; U3.01, U4.01, U4.07 | No replacement notification authority. |
| C13 | Novu | Event contexts and renderer/delivery separation; U2.03, U4.01, U4.06 | No second subscriber store or notification platform. |
| C14 | Knock | Shared layout versus event content and one model; U1.03, U2.04, U5.08 | No lossy code-to-visual conversion or competing edit modes. |
| C15 | Courier | Selected-block canvas, explicit saved/published state/history; U1.02, U5.01, U5.06 | Provider/routing administration remains outside the editor. |
| C16 | MJML | Reuse qualified pinned local renderer and reproducible output; U4.01, U7.01 | Not a visual editor or sanitizer; do not redo the completed selection. |
| C17 | React Email | Preserve completed renderer comparison and fallback rationale; U7.01 | Do not add a second runtime/render engine without a verified need. |
| C18 | EmailBuilder.js | Structured React/block-editor design reference; U1.01–U1.03 | Package adoption remains conditional on license/dependency/maintenance review, not mandatory embedding. |
| C19 | GrapesJS + MJML | Constrained component selection reference; U1.02, U1.05 | General-purpose style/code panels and alternate builder adoption are not required. |
| C20 | Mosaico | Template-defined editable boundaries; U3.04, U6.02 | No GPL code copy or assumed distribution entitlement. |

Observed competitor features are references, not a promise to copy every vendor feature. Accepted Grant adaptations are mandatory. Previously rejected alternatives and optional ET-7 features remain recorded under section 8; they are not silently converted into accepted work or erased.

### 2.2 Historical sources retained for mandatory reconciliation

| Legacy source | Known scope to retain | Closure mapping |
| --- | --- | --- |
| docs/GRANT_UI_UX_GAP_MATRIX.md | Original Grant gap IDs and B1–B5 disposition | U0.03, U8.01–U8.08, U9.01 |
| docs/UX_COMPETITOR_SCREEN_DECISIONS_20261011.md | Selected actual-screen patterns and P0-2 decisions | U0.03, U8.01–U8.08 |
| docs/UX_SCREEN_DESIGN_GRANT_20261010.md | Promised Grant screens and interaction designs | U0.03, U8.01–U8.08 |
| docs/UX_GUIDED_APPROVAL_WORKFLOWS_20261013.md | Novice Home, New Request, detail and admin setup | U8.01, U8.03, U8.05 |
| docs/COMPETITIVE_GCI_GRANT_20261010.md | G-CI-1–G-CI-5 approvals, notifications, history/admin adoption | U0.03, U8.02–U8.07 |
| docs/APPROVAL_COMPETITIVE_REVIEW.md | Approval policy/approver/group/mail-management commitments | U0.03, U8.02, U8.04 |
| docs/UX_COMPETITOR_RESEARCH_20261009.md | Earlier reusable workflow/UX decisions | U0.03, U8.01–U8.08 |
| docs/UX_INFORMATION_ARCHITECTURE.md | Product navigation and role/task information architecture | U8.01, U8.06–U8.08 |
| docs/UX_REA_KEYCLOAK_20261010.md | Existing permitted REA findings and shared/product boundary | U0.03, U8.07 |
| docs/GRANT_UI_UX_COMPETITOR_STUDY_20261010.json | Original structured comparison inventory | U0.03, U9.01 |
| Original ET-T01–ET-T24 and 121 Full User E2E IDs | Preserve exact IDs and wording; attach evidence, never renumber as new PASS | U0.03, U7.05, U9.01 |

The known earlier comparison set includes Windmill, Teleport, Jira Service Management, ServiceNow, StrongDM and Keycloak. Retain prior licensed/allowed REA evidence. Do not invent unobserved findings, assume all B1–B5 mappings, or repeat completed research. Expand this WBS with any additional accepted requirement found during U0.03; no missing row may be treated as out of scope by default.

## 3. Milestones and dependency order

| Milestone | Deliverable | First dependency / exit |
| --- | --- | --- |
| U0 | Canonical requirement coverage, priority and evidence ledger | Can run alongside existing UI work; full historical reconciliation must close before U9. |
| U1 | ET-3A canvas, outline and contextual inspector | Existing ET-1/2 reused; actual mounted interactions, not label/source-string tests. |
| U2 | ET-3B inventory, presets, copy, variables, scope and history | U1 state/selection; saved/reopened content and scope remain correct. |
| U3 | Recipient presentation and protected styling | U1/U2; required context, three decisions/details, readable mode-correct content. |
| U4 | ET-4 same-render preview, samples and actionable feedback | U1/U3; stale/invalid output cannot become current review proof; no preview effects. |
| U5 | ET-5 publication, impact, history, rollback and migration | U2/U4; entire UI/API journey and immutable snapshots, not API-only completion. |
| U6 | ET-2 assets and ET-4 reviewed test-mail remainder | Dependency-ready source work inside this scope; current denials respected; real effects separately gated. |
| U7 | Exact-candidate build, development UI, accessibility and mail acceptance | U1–U6 for final acceptance; affected tests run during each preceding unit. |
| U8 | Earlier accepted competitor-derived Grant UI gaps | Preserve verified existing implementation; close only real missing UI/evidence after email-editor work. |
| U9 | No-omission audit and exclusive-priority exit | Every mandatory row and mapped original case satisfied; no unknown or blocked item counted PASS. |

Implementation selection order is U1 -> U2 -> U3 -> U4 -> U5 -> U6 -> U7 -> U8 -> U9, subject to explicit row dependencies. U0 is coordination/coverage and must not repeatedly interrupt productive source work. The first source action is resume the in-progress ET-3A canvas work, not restart ET-1. When a row is already implemented, complete its missing verification rather than recreate it.

All paths below are implementation targets, not claims of a new file's existence. All V-U* identifiers are planned verification scenarios to map to actual executable tests. States start OPEN unless current exact evidence is attached; historical unit counts and dirty files do not automatically close a row.

## 4. Detailed WBS

### U0 — coverage and control

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U0.01 | Map every C01–C20 adaptation, S02 screen requirement and S03 UI-01–UI-07 to a WBS row. | This WBS + evidence ledger | None | V-U0.01: mechanically check all 20 IDs and 7 audit IDs, source references and row links; zero unassigned KNOWN accepted requirements. This is document coverage only. |
| U0.02 | Align ROADMAP, Product Standard reference, Issue37, WP67 and PR100 current priority/first action. | ROADMAP.md; docs/PRODUCT_STANDARD.md; GitHub bodies | None | V-U0.02: read back each saved body/current prefix; one P0_COMPETITOR_UI_ONLY priority, one current first unfinished dependency-ready action or exact external/blocker gate, old instructions explicitly historical, no new issue or approval expansion. |
| U0.03 | Reconcile every historical accepted requirement and original 24 ET checks into this ledger; retain 121 user-case identities. | Sources in section 2.2 | Current permitted original source access | V-U0.03: extract exact source IDs/sections, account for accepted/rejected/optional/upstream/previously verified items and assign every accepted item to WBS+test evidence; unmatched=0. CURRENTLY OPEN: original source retry succeeded and exact 24+121 IDs are mapped; remaining narrative/source/evidence reconciliation is not complete. |
| U0.04 | Preserve original source work, G12, stash and exact branch/HEAD ownership. | Existing worktree and PR100 | None | V-U0.04: non-owned bytes/index preserved; G12 SHA256 cd7252633d96b424aa4e8f24ae08a8660f9663828b5fdffc0285ce9a73e68d4f and stash 03cf0142b688baa17892e48785ff01803fa81c0e remain; only this unit's explicit paths staged. |
| U0.05 | Track source, interaction, dev-deploy and acceptance separately per task. | Evidence ledger; docs/STATUS.md reference | U0.01 | V-U0.05: every row has source/test/deploy/acceptance fields and blocker/dependency fields; incomplete evidence cannot produce PASS or 100%; no global completion inferred from unit counts. |

### U1 — selected-block authoring, ET-3A

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U1.01 | One filled email canvas, readable left outline, contextual right inspector and compact header/context bar. S01/S02, UI-01. | notifications.tsx; email_template_workbench.tsx; email-template-editor.css | Existing ET-1/2 | V-U1.01: enter the real Notifications editor; see one primary canvas/event selector, version/save controls and outline, not a long all-properties form or second competing editor. Desktop screenshot and mounted route assertions required. |
| U1.02 | Click heading/body/actions or keyboard outline to select/highlight the same block and show only relevant settings. | email_template_design_editor.tsx; email_canvas_projection.tsx | U1.01 | V-U1.02: pointer and keyboard select each block; assert selected IDs, focus, matching inspector and updated render after input; no form-only substitute and no string-presence-only PASS. |
| U1.03 | One structured draft and stable renderer-owned block IDs; preserve archived layout versions. | email_canvas_model.ts; email_design.ts; grant/email_design.py; grant/email_renderer.py | U1.01 | V-U1.03: canvas/inspector/save use one state; versioned block extension opt-in, old v1/v2 output hashes unchanged; mutate event/style then save/reopen and compare design plus render. |
| U1.04 | Safe edit-only canvas; exact-output preview remains isolated. | email_canvas_projection.tsx; notification_preview.tsx | U1.02 | V-U1.04: clicking any displayed decision/details only selects; assert zero navigation, decision/issuance/send calls and external resource fetch; hostile HTML cannot inject active nodes, handlers, forms or unsafe attributes. |
| U1.05 | Protected/optional block indicators, bounded Add content and explicit move controls only where schema allows. | Editor; schema and renderer | U1.03 | V-U1.05: add/reorder an allowed optional explanatory block; required request/action/verification blocks cannot be deleted, duplicated, hidden or moved after an unsafe hierarchy; direct invalid JSON rejected. No dead advertised control. |
| U1.06 | Narrow layout uses one canvas and contextual drawer with keyboard/focus parity. | email-template-editor.css; workbench | U1.02 | V-U1.06: at 390px open/select/edit/close drawer; focus returns correctly, Escape works when appropriate, no trapped focus, page-level overflow or clipped primary buttons; no dragging required. |
| U1.07 | Clear unsaved/saving/saved/error states; Back/Close cannot silently discard changes. | notifications.tsx; workbench | U1.03 | V-U1.07: dirty exit offers keep/discard; failed save retains content; ambiguous save requires reconciliation; reopen reflects server state, never false Saved; no automatic publish/send. |

### U2 — inventory, content, presets and history, ET-3B

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U2.01 | Email Templates inventory: real thumbnail, published/draft state, authoritative policy usage/drill-down, update metadata, obvious Edit draft; history/duplicate secondary. | notifications.tsx; email_template_inventory.tsx; existing inventory API | U1.01 | V-U2.01: populate rows from API; compare displayed versions/counts/metadata to response; unknown values are not zero or invented; duplicate creates an unpublished independent draft; route and reopen work. |
| U2.02 | Standard/Compact/High visibility actual-render thumbnails and filled new-template start; no wizard. | Inventory; editor; email_canvas_model.ts | U1.03 | V-U2.02: choose each thumbnail, verify distinct expected styles/render; switching preset preserves all subject/body/headings/footer/locale/suffixes and bindings; new template opens usable sample without publishing. |
| U2.03 | All nine events with human labels; event-scoped subject, supported preheader, heading and bounded safe body formatting. | Editor; email_design.py/ts; renderer | U1.03 | V-U2.03: edit requested, switch through all nine events and return; changed fields persist only at intended event; every exposed field renders and survives save/reopen; preheader requires a minimal versioned schema path, not an ignored control. |
| U2.04 | Visible This event / All events in this template set / Controlled by approval policy scope. | Editor; renderer; publication impact | U2.03 | V-U2.04: event edit affects one event, shared style/footer affects intended set, policy-only controls are not editable; verify before/after outputs across events and scope labels at point of change. |
| U2.05 | Searchable safe variables with human label/example/description and token secondary; insert into active compatible field at selection. | email_canvas_model.ts; content inputs | U2.03 | V-U2.05: select text in subject/body/supported heading, search and insert allowlisted variable, assert exact cursor/value and length limits; invalid/unknown variable blocked server-side; optional fallback cannot hide mandatory context. |
| U2.06 | Reset appearance is scope-specific and preserves wording/locale; Restore wording shows event/language and confirms replacement. | email_canvas_model.ts; editor | U2.02–U2.04 | V-U2.06: modify every content field and style then reset selected appearance; only allowed style keys change; cancel wording restore is no-op; confirm replaces selected event only, never saves/publishes. |
| U2.07 | Whole-draft undo/redo and template-isolated history. | email_canvas_model.ts; workbench | U1.03 | V-U2.07: alternate copy/style/preset/variable changes then undo/redo exact snapshots; new branch invalidates redo; switching template cannot import previous history; persistence uses current snapshot only. |
| U2.08 | Explicit EN/KO copy and locale fallback without silent translation or browser-locale send changes. | Editor; renderer; default-copy API | U2.03 | V-U2.08: exercise both languages and all nine events; long copy and absent optional values remain valid; custom wording never overwritten by locale/preset/reset; restore locale wording is an explicit reviewed edit. |

### U3 — recipient hierarchy and protected styling

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U3.01 | Brand, event/status, title, short explanation, required action/target/reference/deadline context, three decisions, separate details and verification notice in that order. | grant/email_renderer.py; versioned layouts; summary model | U1.03, U2.03 | V-U3.01: golden outputs and actual rendered screenshots verify hierarchy and required fields across presets; optional metadata may reorder only within a bounded summary region; Compact never hides required context or security notice. |
| U3.02 | Visual S/M/L controls, bounded body/button font, horizontal/vertical padding, gap, radius and desktop/mobile layout. | Editor; email_design.py/ts; renderer | U2.02 | V-U3.02: values change actual render and persist; S/M/L target minimum heights 44/48/56 CSS px; bounds reject invalid dimensions, no clipped labels at 320/375/390px; three decisions remain comparably usable. Real-client metrics are U7.04. |
| U3.03 | Curated readable palette and custom allowed brand/body/background/action colors, contrast feedback; advanced controls collapsed. | Editor; style validator; renderer | U3.02 | V-U3.03: valid palette persists; insufficient text contrast and invisible/overflow/hide styles rejected by server even through crafted JSON; decision meaning is visible in text, not color only; outgoing mail colors do not alter app/Foundation theme. |
| U3.04 | Locked action identity/URLs, canonical localized Approve/Hold/Deny plus bounded optional suffix; distinct styled View Details. | Design validator; renderer; editor | U1.04, U2.08 | V-U3.04: remove/duplicate/rebind/replace-canonical-label attempts fail; suffix cannot inject URLs/variables/bidi control; details navigates only through its separate legitimate read-only boundary in real mail, never votes. |
| U3.05 | Eligible requested/reminder messages alone expose active decisions; terminal/result messages do not. | Existing decision eligibility; renderer | U3.04 | V-U3.05: all nine events with eligible/ineligible/revoked/expired seats; exact expected action count and semantics in HTML/text; old design snapshot never overrides current revocation. |
| U3.06 | Correct EMAIL_PIN / EMAIL_PIN_PLUS_OTP / EMAIL_PIN_PLUS_MFA instructions and mandatory final Confirm. | Renderer; protected verification block | U3.04 | V-U3.06: all three modes show policy-correct guidance; base EMAIL_PIN does not require false login; same-email PIN/OTP is not called MFA; style cannot hide instructions, weaken verification or imply approval itself executes an action. |
| U3.07 | Safe subject/preheader/body formatting, emphasis/lists/alignment and clear variable error limits. | Server schema; renderer; content editor | U2.03, U2.05 | V-U3.07: bounded long EN/KO and malformed Unicode/markup tested; header injection, scripts, arbitrary HTML/CSS/JS, unsafe links/includes/template code fail safely; accepted formatting is identical in editor preview and delivered renderer. |

### U4 — useful same-render live preview, ET-4

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U4.01 | One canonical structured subject/HTML/text render contract for preview, test and real-message composition; reuse ET-1. | grant/email_renderer.py; decision_links.py; transport.py; preview API | Existing ET-1, U3 | V-U4.01: identical synthetic design/context yields same expected content/style semantics through all paths; classify only intended issuance differences; no brittle literal body split; golden output/version reproduction passes. |
| U4.02 | Retain last valid preview during refresh, visibly stale, with ordered requests and cleanup. | email_live_preview.tsx; email_preview_model.ts | U1.03, U4.01 | V-U4.02: delay/out-of-order response/unmount/edit tests prove old responses never win; previous image remains while Updating is visible; stale/error result cannot count as current test/publish review. |
| U4.03 | Synthetic normal/long EN/long KO/missing-optional samples, nine events and three verification modes. | Preview sample panel and readonly API | U2.03, U4.01 | V-U4.03: select each sample and compare expected values/required context; only fake request data, invalid URLs and dummy PIN appear; sample switching changes no stored template, issuance or live request. |
| U4.04 | Actionable block-linked errors and recovery rather than technical numbers or fake readiness score. | Preview validation UI; inspector | U1.02, U4.02 | V-U4.04: induce contrast/length/missing-required errors; click message to focus exact block/input, fix and re-render; stale error clears only on correct response; publication remains blocked until valid. |
| U4.05 | Desktop and 320/375/390px layout views; meaningful HTML/plain-text tabs; image-off/dark-mode simulations clearly labeled. | notification_preview.tsx; workbench | U4.01 | V-U4.05: same current revision in each view; required content/actions readable without clipping; text fallback usable; simulations never display Gmail/Outlook acceptance PASS. |
| U4.06 | Draft preview is read-only and inert; no vendor service, credential disclosure or approval/delivery effects. | Preview API; isolated canvas/frame | U1.04, U4.01 | V-U4.06: database and request interception show zero save/issuance/outbox/OTP/decision writes; no real PIN/token/recipient or remote asset fetch; role isolation, resource limits and error redaction verified. |
| U4.07 | Diagnostics holds renderer/layout identity, HTML bytes, protected-action counts and exact-output inspection. | Preview Diagnostics panel | U4.01 | V-U4.07: diagnostics collapsed by default; data matches actual server output and current generation; source inspection cannot edit or execute HTML and cannot expose real secrets. |
| U4.08 | Unsaved/saved-preview distinction and one normal editing preview workflow. | Workbench; existing saved preview/test area | U4.02, U5.01 | V-U4.08: user sees current draft centrally; saved test/review names exact revision; edits invalidate evidence; no two unlabeled previews disagree about what will save, publish or send. |

### U5 — full draft/publication lifecycle, ET-5

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U5.01 | Published revision versus saved/unsaved draft clearly displayed; Save draft never activates a version. | notifications.tsx; inventory; revision APIs | U2.01, U2.07 | V-U5.01: edit/save/reopen shows accurate server revision state; published pointer and existing mail unchanged after save; loading/error/unknown states cannot claim a version. |
| U5.02 | Review & publish displays before/after rendered mail, changed copy/styles/events and blocking errors. | email_publication_review.tsx; comparison API | U4.01–U4.04, U5.01 | V-U5.02: real mounted review shows server-bound current published/draft comparison and actual field/event diff; initial publication handles no previous version; empty/stale/invalid review cannot confirm. |
| U5.03 | Authoritative policy impact, affected events and future-request-only warning. | Publication impact API/UI | U5.02 | V-U5.03: reconcile displayed policy IDs/counts and affected events with authoritative response; concurrent policy impact change invalidates review; zero usage shown only after successful read. |
| U5.04 | Role/CAS/current actor/review digest binding and explicit Confirm; safe conflict recovery. | grant/email_publication.py; publication UI | U5.02–U5.03 | V-U5.04: current authorized confirm creates one publication; edit/branding/version/actor/impact changes reject stale proof; unauthorized calls fail; conflict offers preserve/reload, never silently overwrites; no automatic send/policy activation/execution. |
| U5.05 | Immutable template/layout/renderer/locale/asset snapshot for requests, queued mail, reminders and reissues. | Publication/core/snapshot/renderer | U5.04 | V-U5.05: publish new design then compare pre-existing request/outbox bytes/hashes unchanged; new requests choose new version; reminders retain original design while current security revocation/floor still applies. |
| U5.06 | Discoverable version history with truthful editor/time/version metadata and view-only historical preview. | Publication history API/UI | U5.04 | V-U5.06: history/order/content matches immutable records; preview older revision is inert and read-only; only permitted roles see controls; no fabricated editor/time. |
| U5.07 | Rollback restores an older design by creating a NEW draft/revision and reviewed publication. | History/rollback UI/API | U5.06 | V-U5.07: select old design, review delta/impact and confirm; monotonically new revision created; all historical rows and old request snapshots unchanged; stale or repeated confirmation reconciled without duplicate publication. |
| U5.08 | Lossless opt-in legacy text migration and shared-layout revision governance. | Legacy migration UI/API; renderer | U2.03–U2.08, U5.04 | V-U5.08: migration preview preserves all nine subjects/bodies and locale; cancel leaves old set unchanged; save remains draft; publish affects future requests only; old layout outputs reproduce. |

### U6 — assets and reviewed test email: required, not silently deferred

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U6.01 | Polished text-brand and footer with editable name/wording/styles; sender mailbox authority remains separate. | Branding/editor/rendering | U2.04, U3.01 | V-U6.01: brand/footer render and persist; mandatory notice and required sender boundary cannot be removed; text-only preset remains complete when no logo is selected. |
| U6.02 | Bounded safe raster logo upload, validation and immutable content-addressed assets; reject arbitrary remote URL/SVG/script. | Proposed grant/email_assets.py; upload API; editor | U6.01; current normal tool authorization | V-U6.02: accepted raster dimensions/size/MIME normalize as specified; malformed/polyglot/oversized/unauthorized input rejected; no remote fetch; authorized preview only; original blocked batch must not be bypassed. |
| U6.03 | Qualified asset delivery/CID and images-off fallback with immutable snapshot binding. | Renderer; MIME transport; asset references | U6.02, U5.05 | V-U6.03: exact attachment/content ID and saved asset hash verified using synthetic mail; old request logo unchanged after replacement; images-off preserves brand/context; actual client acceptance recorded in U7.04. |
| U6.04 | Send test to me reviews the exact saved draft, current preview digest, approved own mailbox and inert content. | Existing test-send review/UI and API; retained .dev/et4-review-pending patch | U4.08, U5.01; current normal tool authorization | V-U6.04: compare retained patch with current source before applying; edit/unsaved/revision/digest mismatch invalidates review; no arbitrary recipient/CC/BCC; sample cannot authorize. Synthetic tests first; no live send from this roadmap update. |
| U6.05 | Explicit one-shot test Confirm, transport-accepted versus inbox-received status, ambiguous-result reconciliation. | Test-send guard; existing transport/UI | U6.04 | V-U6.05: duplicate-click/retry/timeout tests produce no duplicate unreviewed mail; ambiguous result remains latched until reconciled; transport acceptance never masquerades as actual inbox receipt; both failed and successful outcomes retain safe UI. |
| U6.06 | Separately authorized actual self-test receipt with no real approval capability. | Approved mailbox and delivery surface | U6.03–U6.05; explicit effect approval/environment | V-U6.06: exact saved revision and message observed in authorized inbox, dummy actions/PIN confirmed nonauthorizing; record receipt separately from transport and client layout. Missing approval/environment stays OPEN, not synthetic PASS. |

### U7 — exact-candidate validation and visible delivery

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U7.01 | Affected regression/build, pinned renderer/license/offline evidence and legacy reproduction remain valid. | Existing renderer ADR/build evidence; affected tests; native CI | Changed U1–U6 source | V-U7.01: record exact commit, actual command, exit and artifact; affected regressions and required CI pass without rerunning completed renderer selection; lock/license/integrity and old output hashes verified; no unsupported dependency or Foundation pin change. |
| U7.02 | Mounted end-to-end editor task: preset -> body select/edit -> actions select/size/color -> mobile -> save -> reopen. | Real Notifications route and test backend contracts | U1–U5 | V-U7.02: actual UI events and persisted readback at same candidate demonstrate all steps; screenshots desktop/390px plus request/response assertions; helper/SSR/source-string checks alone fail this gate. Synthetic backend tests are labeled, not actual user acceptance. |
| U7.03 | Keyboard, focus, touch/narrow layout, contrast and error recovery on mounted screens. | Editor/inventory/review components | U7.02 | V-U7.03: complete task by keyboard without drag; clear accessible names, logical focus, no trap/overflow/clipped primary action at 390px; all rendered labels/context usable at 320/375/390; automation findings plus manual evidence, no unearned standards certification. |
| U7.04 | Actual Gmail web/mobile, Outlook classic/new/web and Apple Mail/iOS client matrix. | Approved real mailbox/client environment | U3–U6; required approval/client access | V-U7.04: record exact client/version/OS/configuration and same message revision; normal/long EN-KO/dark/images-off/narrow/large-button/terminal cases readable and correct; every supported matrix cell PASS, unavailable cell explicitly OPEN. Browser emulation is not client PASS. |
| U7.05 | Actual authorized administrator and independent-user/mailbox acceptance under the existing full contract. | Existing Surface Reconciliation and Full User E2E contracts | U1–U6; full contract read through permitted original access; approved actors | V-U7.05: read current complete contract before running; same exact candidate, real authorized personas, actual persisted UI outcomes and independently operated mailboxes where required; preserve all original 121 IDs. No fixture-secret workaround, mock-as-user PASS or implicit execution/approval. |
| U7.06 | Measured novice usability targets, not estimated improvement claims. | Approved first-use user task recording | U7.02; authorized participant | V-U7.06: from already-open editor body wording+button size require <=5 purposeful UI actions excluding text keystrokes; first-time admin preset/personalize/mobile/save <=180 seconds excluding SMTP latency; record participant/task/timestamps/action definition/errors. No passing estimate in lieu of observation. |
| U7.07 | Development UI serves the tested source/build; keep deployment versus acceptance separate. | Existing isolated dev preview and build provenance | Coherent tested commit; existing permitted development deployment conditions | V-U7.07: record source HEAD, build hash, deployed asset hash and actual GET/readback; screenshot the real candidate, validate same UI task, preserve dev state/rollback and disabled unapproved live effects. Config inspection alone is not deployment/browser proof. |

### U8 — preserve and finish earlier competitor-derived Grant UI commitments

These rows retain the known prior product-wide requirements. They are not an assertion that the historical documents were fully reread or that existing source must be rebuilt. U0.03 attaches every exact legacy ID; add rows for any additional accepted behavior. Foundation common code and unrelated native-execution work remain outside this lane.

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U8.01 | Novice Home and task navigation make requester/approver/admin next actions obvious; no text wall or false zero/loading state. | home_getting_started.tsx; role/task routes | Email-editor units; existing source reuse | V-U8.01: actual authorized personas reach correct task from Home; loading/error/empty/permission states truthful; no unauthorized control/false success; preserve existing implementation and fix only observed gaps. |
| U8.02 | B1 approval Inbox/workspace, assigned review-next, request preview/deadline/status and distinct decisions. | request_inbox.tsx; actual approval routes/API | U8.01; inherited policy authority | V-U8.02: queue/selection/detail/deadline and next eligible assigned request match server; stale/ineligible/self/closed cases cannot decide; explicit review/final Confirm unchanged; filters/actions/mobile and original B1 cases mapped and pass. |
| U8.03 | Guided New Request and Request Detail information hierarchy, readable progress and clear review/confirm path. | requests.tsx; request_workflow_guide.tsx; request_detail_overview.tsx | U8.01 | V-U8.03: first-time user completes policy/title/target/reason and review; advanced JSON stays optional; detail separates human/transport/external-execution state; failures unknown/loading not misreported as completed effects. |
| U8.04 | Approval policy and approver/group management with usable draft/review/activation and notification-template assignment. | policies.tsx; existing policy/approver API | U5; actual legacy contract reconciliation | V-U8.04: create/edit/reopen policy and groups through mounted UI, existing validation and role/CAS gates preserved; assigned templates/policy state match backend; no policy/security semantic change merely for presentation. |
| U8.05 | Administrator first-run workflow and notification/delivery operations use clear next actions and honest state. | admin_first_run_setup.tsx; Notifications Delivery Health | U8.01, U6 | V-U8.05: register connection -> choose approvers -> draft policy -> test/activate guidance resolves real routes; API incomplete state is Checking/error not zero; delivery accepted/received/executed remain separate. |
| U8.06 | Approval history, audit/timeline and operational/integration detail remain discoverable and evidence-based. | Existing history/audit/operations/integrations surfaces | U8.02–U8.05; mapped original requirements | V-U8.06: current source and actual route show required ordering, status, drill-down and detail; values match server; no token/PIN/secret disclosure or mock native effect reported as verified; only genuine missing UI is implemented. |
| U8.07 | Foundation ownership and actual Grant System Management availability/routing remain truthful. | Existing Foundation consumer composition and native capability adapters | Current upstream accepted package and Grant authority | V-U8.07: no Foundation common changes; supported/read-only/unavailable states match real Grant destinations; missing upstream common ACL/MFA/admin features are dependency records, not locally reimplemented or marked supported. No privileged host change from this WBS. |
| U8.08 | Remaining B2–B5/G-CI/P0-2/REA-derived accepted UI items and cross-screen mobile consistency receive exact coverage. | Original gap/screen/decision documents and actual mounted components | U0.03, U8.01–U8.07 | V-U8.08: reconcile each original ID, outcome, implementation and exact test evidence; implement any unmatched accepted behavior in explicit child WBS rows; no invented B2–B5 mapping, blanket historic completion or repeated accepted work. |

### U9 — final no-omission and completion gate

| WBS | Required result / source | Target | Depends on | Verification and binary PASS condition |
| --- | --- | --- | --- | --- |
| U9.01 | Zero unmapped accepted requirements across all retained sources and original checks. | WBS + legacy crosswalk + evidence ledger | U0.03, U8.08 | V-U9.01: two-way source->WBS->test->commit and WBS->source audit; accepted items all mapped, no silent deletion or new optional classification, exact original ET-T01–24 and 121-case registry accounted for. Original source access succeeded; remaining narrative mappings and complete test/commit evidence prevent claiming this today. |
| U9.02 | Every mandatory behavior has required source, mounted interaction, development and applicable real acceptance evidence. | Evidence ledger | U1–U8 | V-U9.02: all applicable gates PASS at same source/build or explicitly proven unchanged scope; no open blocker/unrun required cell, no actual-client claim from synthetic test; owner-approved not-applicable decisions retained with rationale. |
| U9.03 | ROADMAP/WP/PR/STATUS and deployed version are coherent and report actual remaining work. | Canonical repo/GitHub records | U9.01–U9.02 | V-U9.03: fresh readback of exact branch/HEAD/PR/CI/dev hashes; no contradictory current priority or stale first action; historical records explicitly labeled; user sees real screens/results rather than only test totals. |
| U9.04 | Exit the exclusive UI lane only after final required acceptance; do not merge/release automatically. | Roadmap decision and owner report | U9.01–U9.03 | V-U9.04: all mandatory scope accepted and zero unmatched requirements, with owner acknowledgement recorded where required; only then remove priority lock. Production/merge/release still require separate permission. |

## 5. Evidence model and how PASS is decided

Each WBS row is mandatory except the explicitly retained optional ideas in section 8. Attach `source_id/section`, `test_id`, actual test path/command, source commit, build hash, event/persona/sample, actual/expected result, timestamp and artifact reference. Never attach credentials, live tokens/PINs or private message content. A planned V-U* scenario ID is not an executed test.

Track four independent evidence fields: `source`, `interaction`, `dev_deployment`, `acceptance`. States are NOT_RUN, IN_PROGRESS, PASS, FAIL, BLOCKED, or NOT_APPLICABLE_WITH_JUSTIFICATION. NOT_APPLICABLE is legitimate only where the gate truly does not apply, for example document coverage does not need a mailbox. It cannot waive a required UI/mail-client behavior. Any mandatory feature change, removal or deferral requires a new explicit owner decision and preserved rationale.

Row PASS requires all of its specified checks plus all applicable evidence fields. Milestone PASS requires every mandatory child row. Overall PASS requires U9 and zero unmatched accepted requirements. A skipped/unavailable actual-client or authenticated-user test remains incomplete. An API/helper/SSR test may prove a lower layer, not the mounted user journey. A screenshot without interactions and persisted readback does not establish functional PASS. A green CI run without requirement coverage is insufficient.

Report progress as separate counts: known-source mapping coverage, source-complete tasks, interaction-qualified tasks, development-visible tasks and accepted mandatory tasks. Do not estimate effort percentage from test count. Until U0.03 is closed, the total accepted historical requirement denominator is UNKNOWN; this initial WBS row count is a registered work inventory, not proof of complete historical coverage. Existing source contributions are retained even if acceptance is unrun; zero new acceptance records does not mean zero implementation.

On each coherent implementation unit: show the missing behavior with an affected RED test, implement the smallest complete UI/API change, run affected GREEN tests and build as relevant, commit/push only owned paths, verify actual exact-HEAD native CI at meaningful boundaries and record the evidence. Do not repeat the entire suite after every cosmetic change. Continue the next in-scope dependency-ready row after progress reports. Existing worker source must be reviewed with its current owner lane before adopting/testing/committing; no duplicate lane.

## 6. Original acceptance and audit crosswalk

| Original identity | Mandatory destination |
| --- | --- |
| UI-01 selected canvas/inspector | U1.01–U1.06, U7.02–U7.03 |
| UI-02 presets/reset/history | U2.02, U2.06–U2.07 |
| UI-03 variables and scope | U2.03–U2.05 |
| UI-04 preview feedback | U4.01–U4.08 |
| UI-05 publication/history | U5.01–U5.08 |
| UI-06 entry/inventory | U2.01–U2.02, U5.01 |
| UI-07 actual candidate proof | U7.01–U7.07, U9.02–U9.03 |
| ET-T01 same render contract | U4.01, U7.01 |
| ET-T02 correct verification-mode copy | U3.06 |
| ET-T03 inert preview/test | U1.04, U4.06, U6.04–U6.06 |
| ET-T04 decisions and nondeciding details | U3.04–U3.05 |
| ET-T05 protected JSON tampering rejected | U1.05, U3.03–U3.04 |
| ET-T06 injection and malformed input | U1.04, U3.07, U6.02 |
| ET-T07–ET-T24 exact existing wording | Preserve unchanged; U0.03 must assign each individual check after permitted source reconciliation. Do not guess the wording or count this placeholder as mapped PASS. |
| Existing 121 Full User E2E IDs | Preserve registry and dispositions; U7.05 and U9.01 attach original case mapping without counting new V-U scenarios as those tests. |

S02 promise coverage: inventory/name/thumbnail/usage/history/duplicate -> U2.01; one filled start and three presets -> U2.02; header/context/outline/canvas/inspector -> U1.01–U1.02; bounded add/move -> U1.05; pointer/keyboard/narrow drawer -> U1.02/U1.06; one state/inert canvas -> U1.03–U1.04; nine events/preheader/headings/formatting -> U2.03; scope -> U2.04; variables -> U2.05; reset/restore/history -> U2.06–U2.07; locale -> U2.08; recipient hierarchy and action parity -> U3.01–U3.07; sample/error/stale/diagnostics/same preview -> U4.01–U4.08; before-after/impact/CAS/history/rollback/migration -> U5.01–U5.08; text-brand/logo/CID/self-test -> U6.01–U6.06; client/mobile/keyboard/provenance/usability -> U7.01–U7.07. Constrained inline text editing is optional after the required inspector-field editing works; there is no additional raw-HTML editor.

## 7. Current disposition and immediate source action

The current committed source baseline at the first read for this update was 69e4aa9560352363ff4cff438461f39329a98fd4, Draft PR100 open/unmerged on feat/grant-g10a-g0-integrated-candidate. Canvas/layout/history/preview/publication/inventory files are already in progress in the existing worktree. No implementation acceptance is inferred from their existence. This documentation update must not stage, overwrite or reset them.

During this documentation update the existing source lane advanced to commit 3c12a120d8bed86349c84cb75969fba55324d5f2 (canvas-first authoring and reviewed publication). This is an observed source commit, not acceptance imported by this documentation unit. Immediate source action: continue the first unfinished U1–U9 requirement or evidence gate at the actual current HEAD. Reuse the now-committed canvas/publication/inventory implementation and any remaining worker edits; do not restart completed ET-3A work. The active worker must consult this WBS before marking ET-3 or later complete. Source state reported by an older packet is not authority over newer actual Git/CI facts.

The repeated blocked original document-read operation affects U0.03/historical completeness, not all repository/GitHub access. Prior asset, reviewed-send and publication UI denials remain exact-target records, not permanent blanket blocks; source files now present still require real verification. No live SMTP/worker, account, credential, production, merge or release change is authorized by the creation of this plan.

## 8. Preserved optional ideas and explicit non-adoptions

ET-7 additional layouts/locales, reusable content library, AI-assisted wording, private-draft autosave and constrained inline text editing beyond inspector editing remain OPTIONAL_RETAINED, not required for core completion and not permission to work on them before this lane closes. No accepted required item may be moved here silently. Optional AI may not transmit live secrets/approval contents or alter authority.

Not adopted: arbitrary HTML/MJML/JS/JSX execution, unrestricted CSS/URLs/recipients, marketing campaigns/tracking, hidden/biased decision controls, vendor-hosted editor/data upload by default, a second workflow/delivery engine, copying unlicensed code, recreating Foundation, replacing SMTP to gain styling, or treating screenshots/CI as user acceptance. Preserve recorded package comparisons and REA license boundaries without repeating research.

### Documentation-validation delivery note

The registered WBS structure and five negative evidence/closure cases were tested successfully by a local prototype. Its static check reported six fixable style findings; a subsequent original-tool code-fix request was platform-blocked before execution. The prototype tools/validate_competitor_ui_wbs.py is retained uncommitted and is NOT part of the documentation delivery. No alternate tool was used to apply the denied code edit. The WBS and evidence ledger remain the saved acceptance contract; do not claim an installed automated completion gate.
