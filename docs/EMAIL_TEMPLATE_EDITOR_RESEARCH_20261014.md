# Grant approval-email editor — comparative research and implementation decision

**Research date:** 2026-10-14. **Owner request:** survey competing email template products broadly and put the best-fit implementation direction into the Grant roadmap.
**Evidence baseline:** `datarelay-labs/datarelay-grant@e6fb3c0c2a2da64c3f475712a94481461a84ae93`, existing Draft PR #100. **Status:** RESEARCH_AND_ROADMAP_COMPLETE; IMPLEMENTATION_NOT_STARTED; NO_E2E_EXECUTED.
**Scope:** 20 product/project families, organized into approval workflows, visual/transactional editors, notification platforms and reusable open-source components. This is a bounded landscape survey, not a claim to have enumerated every vendor in existence.
**Evidence method:** official documentation, vendor-authored help/product material, public original repositories and their displayed licenses. No authenticated commercial-product trial, installed cross-client test, performance benchmark or comprehensive source/security audit was performed. Unknown deployment rights and behavior remain explicit PoC/procurement gates. Source references [R01]–[R33] are dated observations, not warranties.

## 1. Decision

Build **one Grant approval-email block editor** within the existing `Configuration → Notifications → Template Sets` workflow. Combine four ideas: constrained approval semantics, editable visual blocks, shared brand/layout revisions, and explicit draft/preview/publish governance. The editor must let an administrator change text, button size/color/spacing and layout without knowing HTML. It must not become a marketing campaign builder or a second authorization engine.

**Preferred technical direction:** a Grant-owned versioned JSON design schema, Foundation UI components for the authoring controls, and an offline/server-controlled renderer. Evaluate **MJML first** and **React Email as the renderer comparison/fallback** in ET-1. Do not select a package version without an immutable-source/license/dependency and output-compatibility check. A constrained editor does not require embedding an unrestricted website builder.

The visual editor may borrow the usability patterns of Mailchimp/Beefree, the reusable layouts of ServiceNow/Postmark/Knock, and the draft-to-publish model of Customer.io/SendGrid/Courier. These are design adaptations, not code copied from proprietary products. [R02] [R08] [R16] [R19] [R20] [R21] [R23] [R24]

**Not the default architecture:** externally hosted Beefree/Unlayer/Stripo runtimes, a full marketing/notification delivery platform, raw user-authored HTML/MJML/JS, or an unqualified email-builder fork. Commercial embedded editors remain viable alternatives if an explicit procurement/offline/security review later makes their tradeoff better; this research does not assert they are technically incapable of private deployment.

## 2. Verified Grant gap, before new implementation

Current first-party files at the baseline:
- `grant/mail_templates.py`: nine required events, an allowlist of nine substitution variables, subject/body text validation, existing snapshots, sender and brand names. The default requested body tells users to sign in even though the standard's default EMAIL_PIN decision does not require account login.
- `grant/decision_links.py::_message`: renders three unstyled HTML anchors with fixed Approve/Hold/Deny labels and the recipient PIN. It adds the decision UI separately from the general notification renderer and splits body text at a literal `Decision links (` string. It does not create the distinct styled View Details action required by Product Standard §10.5.
- `grant/transport.py::send_email`: already supports a plain-text body and an HTML MIME alternative. Retain that transport; do not add an external sending provider to solve presentation.
- `web/src/notifications.tsx`: existing nine-event text editor, variable discovery, saved-template preview/test review, branding name controls and delivery health. Preview shows subject/body in a `pre` element, not the final decision-email HTML. No button-size/color/radius design schema or visual authoring exists.
- Existing CAS/review/confirm, role checks, sealed recipient issuance, immutable request snapshots and bounded resend behavior are valuable foundations. Reuse them; do not reset or rewrite approval authority.

Therefore prior 'template editor implemented' means **text editing only**, not completion of this visual email editor. The current mail sample is a baseline, not a finished email design. ET is an explicit remaining M3/notification workstream; M4 security guarantees must remain intact.

## 3. Competitive landscape — observed features, transfer and rejection

Each row below distinguishes documented behavior from our design judgment. A blank or unverified capability is not evidence that a competitor lacks it.

### 3.1 Approval/workflow products — five families

| ID | Product | Officially documented pattern | Adopt for Grant / do not inherit |
| --- | --- | --- | --- |
| C01 | Jira Service Management | Administrator chooses email approval behavior versus request-view navigation; an open Atlassian feature request discusses configurable decision labels and positions. [R01] [R32] | Keep decision security separate from presentation. Do not assume arbitrary label/position freedom is already provided by every JSM edition. Preserve Grant's stricter inert GET + PIN + final Confirm. |
| C02 | ServiceNow | Layouts centralize header/body/footer, brand imagery and styles; approval notification content can be configured using templates/flow/scripts. [R02] [R03] | Separate shared layout and event content. Do not expose ServiceNow-style scripting or import reply-email approval semantics into Grant. |
| C03 | Microsoft Power Automate approvals | Markdown formatting and actionable approvals are documented, with client-dependent support and HTML fallback. [R04] | Prioritize a small, clear approval message and explicit client matrix. Do not make Outlook Actionable Messages or AMP a universal requirement. |
| C04 | Pipefy | Visual email templates support dynamic fields, subject/content editing and preview; its docs describe HTML access and unsupported-HTML migration issues. [R05] [R06] | Add safe variable chips and useful sample data. Reject arbitrary recipient/CC/BCC controls and unrestricted HTML in Grant's approval design surface. |
| C05 | Kissflow | Process notification editing selects events/conditions/recipients then content/preview; email actions are configurable by workflow step. [R07] | Retain Grant's event-family organization and policy-owned actions. Content editing must not enable email authorization at a step where server policy forbids it. |

### 3.2 Visual editors and transactional-email services — seven families

| ID | Product | Officially documented pattern | Adopt for Grant / fit limitation |
| --- | --- | --- | --- |
| C06 | Beefree SDK | Role-based row/block locking, reusable saved rows and JSON/HTML services. Self-hosted saved rows concern storage integration, not proof of an entirely offline editor. [R08] [R09] | Protect approval/PIN/security blocks while allowing bounded styling. Reuse brand/layout blocks. Do not mistake editor UI locks for server-side validation or self-hosted row storage for air-gap qualification. |
| C07 | Unlayer | Custom tools have application-specific properties and render/export hooks; designs can be exported as JSON/HTML. The documented basic embed loads a vendor script. [R10] [R11] [R12] | A dedicated Approval Actions component and one canonical saved design are useful. A vendor-hosted embed is not the default in Grant's private/offline target; commercial rights and full runtime deployment need confirmation. |
| C08 | Stripo Plugin | JS APIs support host-app save/preview integration; documented extensions expose button text/color/radius/alignment and other controls; autosave can store changes in Stripo's database. [R13] [R14] [R15] | Select a block and edit its properties; keep autosave drafts distinct from publication. Self-host/offline entitlement was not established by these sources; do not upload approval data to a vendor service by default. |
| C09 | Mailchimp | Button blocks expose desktop/mobile alignment, size, padding and font controls; per-block styles can differ from global defaults. [R16] [R17] | Provide S/M/L button presets plus bounded numeric controls, mobile full-width/stacking and restore-defaults. Do not import campaign segmentation, tracking pixels or conversion optimization. |
| C10 | Customer.io Design Studio | Visual/code authoring, reusable components/global styles and localization; edits can be saved while linked-message publication remains a separate action. [R18] [R19] | One visible editor, reusable layout, safe Draft→Preview→Publish and affected-use preview. Unlike its documented publication behavior, never mutate already-issued Grant request/outbox snapshots. |
| C11 | Twilio SendGrid Dynamic Templates | Design/code template variants, sample-data personalization, template version list and activation are documented. [R20] | Versioned designs, a tested active revision and rollback-to-new-revision. Keep Grant's existing SMTP transport; no need to replace delivery to gain template features. |
| C12 | Postmark | Layouts wrap transactional templates with shared content/styles; template models support validation/rendering and staged reuse. [R21] | Brand/layout reuse across nine events, explicit typed inputs and HTML/plain-text pairing. SDK/API design is reference material, not a replacement notification authority. |

### 3.3 Notification platforms — three families

| ID | Product | Officially documented pattern | Adopt for Grant / fit limitation |
| --- | --- | --- | --- |
| C13 | Novu | Visual block, code and API email authoring; layouts and variable-driven personalization are documented. [R22] | Event preview context and renderer/delivery separation. Do not introduce a second notification workflow engine or subscriber store. |
| C14 | Knock | Visual email blocks/custom partials, shared layouts, template variables and translations; code-to-visual switching can lose code edits. [R23] | A stable structured design, common layout and locale-aware content. Avoid multiple incompatible editing modes or hidden lossy HTML→visual conversions. |
| C15 | Courier | Design Studio uses a canvas and selected-block settings; template APIs support drafts/publishing and versions. [R24] | Contextual properties, explicit saved-vs-published state and change history. Keep provider/routing/recipient administration outside the email editor. |

### 3.4 Open-source renderers/builders — five families

| ID | Project / current license evidence | Documented capability | Decision |
| --- | --- | --- | --- |
| C16 | MJML — repository displays MIT | Semantic components compile to responsive email HTML; local Node/CLI and structured JSON are documented; compiler validation/includes controls are available. [R25] [R26] | **Preferred renderer PoC.** This is not a visual editor. Compile only Grant-generated component trees, with a pinned offline runtime and real email-client tests; MJML itself is not a sanitizer or universal compatibility proof. |
| C17 | React Email — MIT | React/TypeScript email components; server render and plain-text utility. [R27] [R28] | **Renderer comparison/fallback.** Strong fit with React code skills; not a complete business-user visual editor and not a reason to require Resend sending. No user-provided JSX execution. |
| C18 | EmailBuilder.js — MIT | Extendable block-based React editor and JSON/HTML output, with self-hosting described by the author. [R29] | **UI/reference PoC only until validated.** Test maintenance cadence, dependency/security posture, protected custom blocks, keyboard/mobile and Outlook output before adoption. Do not infer maintained/abandoned status from stars or a fork's claims. |
| C19 | GrapesJS core + MJML plugin — BSD-3-Clause shown by original projects | Custom component framework and a specific MJML newsletter plugin; core is distinct from the commercial Studio SDK. [R30] [R31] | Optional constrained-canvas PoC if custom controls become too costly. Full style/code panels are excessive for first-time approvers and must not bypass Grant schema guards. |
| C20 | Mosaico — GPL-3.0 shown by original repository | Template definitions determine editable content/styles. [R33] | Adopt the *constrained-template* idea. Not the default embedded code dependency; GPL obligations/alternative commercial terms need a separate distribution review. No code copied. |

**Landscape conclusion (our assessment, not benchmark data):** Grant benefits most from combining approval-specific locked components, the visual controls of dedicated email editors, and transactional versioning. None of the surveyed products can be assumed to preserve Grant's per-seat/PIN/security model merely by embedding its editor.

## 4. Best-fit product design — one editor, not competing editing modes

**Proposed authoring path:** Notifications → Template Sets → select an event → choose a preset → edit content or selected block properties → inspect desktop/mobile/text preview → save draft → review and publish. The current list, nine-event navigation, administrator role checks and Delivery Health remain. There is no separate campaign builder, wizard/code-mode split or unrestricted HTML source tab.

Desktop layout: a compact event/block list on the left, email canvas in the center, selected-block properties on the right. On smaller screens the same information becomes one canvas with a contextual property drawer. The first screen starts with a usable sample, not a blank canvas or a long form. Add undo/redo, restore selected style/default preset, clear unsaved/saved/published status and a stable preview loading/error state. These are proposed acceptance requirements, not implemented features.

### 4.1 Editable content and style

| Area | Administrator can change | Must remain product-controlled |
| --- | --- | --- |
| Subject / preheader | Bounded subject, optional preheader, approved variable chips | Header injection prevention, safe-variable allowlist, correct event context |
| Heading / explanation | Text, emphasis, lists and paragraph alignment using limited rich-text marks | Escaping; no raw HTML, arbitrary links, scripts or template code |
| Brand / logo / footer | Brand name, approved uploaded raster asset, readable footer and approved colors | Sender mailbox/domain authority, private asset validation, mandatory security notice |
| Request summary | Presentation order of optional safe metadata; readable field styles | Mandatory title/action/target/reference/deadline context; no arbitrary request parameters or hidden secrets |
| Decision controls | Size preset, bounded font/padding/gap/radius/color; horizontal or mobile stacked/full-width layout | Stable server action IDs and canonical localized Approve/Hold/Deny names; no URL editing, action rebinding, deletion or duplicate action blocks |
| Button wording | Canonical localized action plus a bounded optional descriptive suffix; example: `Approve · scheduled change` | Canonical action stays visible; a denial cannot be renamed solely `Approve`. Do not claim arbitrary prose can be automatically proven semantically safe |
| View Details | Readable secondary-action styling and localized caption | Navigation/read-only semantics, not a fourth decision outcome; URL derived by server from current access contract |
| PIN / verification instructions | Bounded typography/background compatible with the selected preset | Correct EMAIL_PIN / PLUS_OTP / PLUS_MFA message, dummy-only preview, non-removable verification/confirmation explanation |

Start with **three polished presets: Standard, Compact and High visibility**. All remain accessible; Compact reduces noncritical whitespace rather than hiding required context or shrinking controls below the product minimum. Proposed button minimum-height presets are **44 / 48 / 56 CSS px**, with constrained adjustments and mobile full-width behavior. These values are product design targets to verify in ET-3/ET-6, not a claim of standards certification or guaranteed email-client rendering. Reject unreadable foreground/background combinations and invisible/hide/overflow styles server-side; color must never be the only cue for an action.

Maintain nine events: requested, reminder, approved, denied, expired, cancelled, execution_succeeded, execution_failed, execution_unknown. Active decision controls appear only when the server says the event and recipient seat are eligible. Terminal/result messages do not retain actionable approval controls. Support English/Korean text initially with explicit locale/fallback and long-content samples, not a silently changing language inferred from browser locale at send time.

### 4.2 Live preview and test email

- **Draft live preview** renders in an isolated frame using the same versioned renderer as final delivery, with synthetic request data, dummy PIN, invalid/non-actionable links and a visible Sample label. It must not create decision issuances, save a draft, queue mail, start OTP or make approval API calls.
- Show desktop and 320/375/390px views, HTML and meaningful plain text, plus presets for long Korean text, missing optional values and each verification mode/event. Display validation errors beside affected blocks, including oversized content or absent required information.
- A browser simulation is not proof of Gmail/Outlook/Apple Mail fidelity. Label it layout preview, and retain a separate actual-client qualification gate.
- **Test send** remains a distinct administrator action tied to an exact saved draft revision and current preview digest. Review → Confirm sends one non-authorizing sample to the administrator's approved own mailbox using existing transport; an ambiguous result stays latched for reconciliation. No arbitrary recipients/CC/BCC and no active real approval URLs/PINs in test content.
- Show `transport accepted` separately from independently observed inbox receipt. Editing any input invalidates the previous preview/test review. Preview caches must never contain real recipient tokens, credentials or private message bodies accessible across roles.

### 4.3 Draft, publish, impact and rollback

Borrow saved-versus-published separation, but apply stricter Grant snapshot rules than a marketing campaign. [R19] [R20] [R24]

1. Editing/saving creates a **draft revision**. Autosave, if added, only saves a private draft; it cannot change the active revision or send a message.
2. Publishing checks role, expected revision/CAS, renderer/schema version, required event/blocks, preview digest and approved asset references. Show which policies use the template, who changed it, and a before/after preview.
3. Store immutable template, shared layout, locale, renderer contract and asset revisions in the request's mail snapshot. **Only future requests** select the newly published revision. Existing request snapshots, queued messages and reminder/reissue rendering do not silently inherit a new layout.
4. Reminder/reissue preserves the request's design snapshot but still obeys current revocation, seat eligibility, token generation and verification-floor enforcement. Snapshot preservation never overrides security revocation.
5. Rollback means publish a **new revision derived from an older design**; do not mutate audit history or rewrite already-issued messages. Migration of existing text-only sets is lossless, opt-in and reversible; legacy issued mail remains readable/reproducible.
6. A template publication is a presentation change, not policy activation, a recipient change, human approval or permission to execute an external operation.

## 5. Architecture and adoption tradeoffs

### 5.1 Recommended pipeline

`Grant design JSON → server schema/style/asset validation → protected component composition → pinned local renderer → subject + HTML + plain text → existing sealed outbox/SMTP`

A versioned design document contains only approved layout/block/style/content references: schema_version, renderer_contract_version, locale, shared_layout_revision, event content, safe-variable references, approved asset IDs and allowed style tokens. The public saved design **never contains** real decision URLs, PINs, OTPs, cookies, recipient addresses, arbitrary network locations, executable code or credential material.

Preview and real message rendering take the same validated design and context interface. In preview/test context only a dummy security model is accepted. Only the server's real issuance pathway supplies recipient-specific action URLs and PIN material immediately before sealing the outbox payload. Golden tests must prove identical layout/style/content under identical synthetic input; expected differences such as genuine issued tokens and real request data are explicitly classified, not ignored as arbitrary drift.

Replace the brittle body `.split('Decision links (')` extraction with structured content composition. Distinguish the three bound decisions from nondeciding View Details. The latter must use an already-authorized detail route, or an explicitly designed read-only capability; **never repurpose an approval token to disclose unauthenticated request details**. Opening any decision link continues to require the existing verification and final Confirm before a vote.

### 5.2 Rendering engine decision gate

| Option | Why considered | Main cost/risk | Disposition |
| --- | --- | --- | --- |
| Grant constrained editor + local MJML | Email-specific layout/button primitives; explicit generated structure; independent of a sending provider | A pinned local Node renderer must be packaged alongside the Python server; generated HTML and Outlook behavior still need testing | Preferred ET-1 PoC, not yet installed [R25] [R26] |
| Grant constrained editor + React Email | Typed components and HTML/plain-text utility fit existing React skills | Does not provide the business-user editor; no user JSX execution, cross-client rendering still requires evidence | Same-input renderer comparison and fallback [R27] [R28] |
| EmailBuilder.js as constrained authoring base | Existing React block model and export/JSON implementation | Extension/locking, long-term maintenance, licensing of all dependencies, accessibility and actual-client output must pass review | Optional ET-1 UI probe, not preselected [R29] |
| GrapesJS + MJML plugin | Mature configurable component approach and MJML block tooling | General-purpose panels, two toolkits, runtime/export shape and protected-block enforcement add complexity | Alternative only when measured authoring needs justify it [R30] [R31] |
| Embedded commercial editor | Rich existing UX, locking, integration APIs | Vendor dependency, deployment/license terms, supply chain, data flow, long-term package/export ownership and total cost need a written review | Not default; no blanket claim that private deployment is impossible [R08]–[R15] |
| Mosaico-derived authoring | Constrained template metadata pattern | GPL distribution obligations and exact integration scope require separate review | Pattern reference; no adoption/copy at this stage [R33] |

The PoC uses identical synthetic templates: requested/reminder for all three verification modes, long Korean text, images off, narrow viewport, large buttons, and a terminal-result message. Compare protected block enforcement, deterministic output, accessibility, HTML/text parity, offline build/runtime, maintenance/license/dependencies, measured resource bounds and real-client results. Do not rank with fabricated throughput, star counts or untested compatibility percentages.

A third-party renderer is not a security sanitizer. The application must reject raw includes, custom components/code, arbitrary MJML/HTML/CSS/JS/JSX, protocol-bearing user links, unsupported variables and external data-fetch behavior. Invoke a pinned isolated renderer without shell interpolation of user content, arbitrary file access or outbound network. Enforce input size/depth/node limits, time/memory/output limits and bounded error messages. Validate renderer-specific include-disable flags against the exact selected version; no unverified flag assumption becomes a guard.

### 5.3 Existing system reuse and owner boundary

- Grant: template design schema, protected approval/action/PIN components, structured renderer adapter, CAS/publication/snapshot API, issued-message integration, migration, preview and test-send safety, nine events and policy assignment.
- Foundation: reusable generic property panels, rich-text/variable-chip/color-input primitives, dialogs, accessibility and common shell styling. Reuse what exists; request missing genuinely shared components upstream. Do not fork common System Management or recreate Foundation generic UI in Grant.
- Existing Python SMTP/outbox and actor authority remain; no new delivery SaaS, subscriber database or alternate workflow engine. Packages may be built/staged offline and a local renderer can be distributed in the candidate only after the dependency gate passes.
- Mail-safe visual tokens may map approved Foundation brand colors but must compile to email-safe inline/table markup as appropriate. Do not import the web application's whole CSS bundle or assume web CSS behaves identically in email.
- Logo/assets: authenticated upload of bounded safe raster types, content-addressed immutable versions, MIME/dimension/size checks, no arbitrary remote fetch. Decide CID versus approved HTTPS asset hosting through compatibility/security tests; preview uses only approved local assets. Never embed secrets/tracking data in URLs or pixels.

## 6. Mandatory approval and privacy invariants

The protected action block is **system-owned in both UI and server validation**. Its IDs, action binding, required canonical labels, existence, uniqueness, readable presentation, PIN/floor notice and minimum request context cannot be altered through draft JSON, imports, styling tricks or a compromised editor client. Optional explanatory prose remains administrator-controlled and auditable; no claim is made that a text classifier can prove all prose nondeceptive.

Retain inert GET/prefetch behavior, per-seat/action/issuance binding, explicit final Confirm, revocation and expiration, same-email PIN not MFA, fresh MFA when required, and immutable external execution separation. A user choosing a larger green button does not authorize a grant, relax policy or change the selected outcome. Security statements are generated from the actual verification mode, not an editable fixed sentence saying all users must log in.

Browser preview is sandboxed with restrictive CSP and without scripts, forms, top-level navigation, same-origin credentials or clickable live approval links. Display unsaved synthetic input without contacting vendors; no analytics pixels or click-tracking wrapper on decision URLs. Plain-text fallback lists the exact safe action names and URLs for real issued mail and invalid links for sample mail. Access/audit exports must never expose actual decision tokens, PIN/OTP values, raw templates containing secrets, private keys or SMTP credentials.

## 7. Implementation roadmap — P0-ET

**Current delivery:** ET-0 complete (research + decision + roadmap). **ET-1 through ET-6 are not implemented or accepted by this document.** ET-7 is optional future expansion. The sequence replaces the misleading assumption that text-only templates have completed the visual-email requirement; it does not remove P0-SM or the existing E2E backlog. Foundation common UI work remains in its own project.

| Phase | Priority / dependency | Deliverable | Completion evidence / boundary |
| --- | --- | --- | --- |
| ET-0 | Current request | 20-family official-source comparison, design decision, implementation/test matrix and canonical roadmap | This document + Product Standard/ROADMAP/STATUS + existing Issue/Work Packet/PR readback; documentation validation only |
| ET-1 | P0; FIRST NEXT IMPLEMENTATION | Reproduce current sample/preview gap with synthetic input; compare pinned local MJML and React Email output. Select renderer with recorded license/offline/extension evidence; implement shared structured render contract, four usable actions and correct mode-specific instructions without changing approval authority | RED→GREEN tests for content/HTML/text equality, missing View Details, no literal-string truncation, default EMAIL_PIN guidance and inert sample; recorded renderer decision, no vendor runtime call or real send |
| ET-2 | P0; ET-1 contract | Versioned JSON design schema, protected block/style validator, shared-layout revision, draft storage/API and renderer/assets/locale snapshot; retain old text fields and issued snapshots | Server rejects crafted/rebound/hidden protected controls; CAS/409 and resource bounds; old request/outbox hashes unchanged in migration fixture; no new live role/permission |
| ET-3 | P0; ET-2 | Single approval-email editor, three presets, editable heading/body/logo/summary, safe variables, button S/M/L and bounded size/color/gap/radius, undo/reset and mobile properties | First-time administrator can edit a supplied sample without HTML; current Foundation primitives reused, new generic controls delivered upstream; style changes survive save/reopen and protected actions cannot be removed/rebound |
| ET-4 | P0; ET-1–3 | Shared-renderer live preview for unsaved synthetic draft, desktop/mobile/HTML/text variants, validation report and saved-revision self-only test-send review | Preview writes zero issuance/outbox rows and has no functional secret; same-render golden contract; edit invalidates review; test sends use dummy actions/PIN and one-shot existing transport; no real send during source-only qualification |
| ET-5 | P1 implementation; REQUIRED before production use; ET-2–4 | Publish/impact review, draft/published history, rollback as new revision, nine-event consistency, English/Korean content/fallback, opt-in text migration and archived-version reproduction | Publication affects future requests only; request/reminder/reissue snapshots are stable subject to current security revocation; no active-policy change, no automatic mail, no overwritten audit history |
| ET-6 | P0 release acceptance; ET-1–5 | Security/regression and actual email-client matrix, permitted signed-in editor journey, approved mailbox/approval E2E and existing exact-candidate user gates | Gmail web/mobile, Outlook classic/new/web, Apple Mail/iOS; long text/images-off/dark mode/320–390px; real inbox and independent user evidence when authorized. Browser preview or test logs alone cannot establish Full User E2E PASS |
| ET-7 | P2 OPTIONAL; after accepted ET-6 | Additional approved presets/layout regions, locale packs, reusable content library, optional AI-assisted copy suggestions with data controls | No change to authority blocks, no live secret data to external AI by default; not required to call core ET-1–6 complete |

**Next execution command semantics:** when the owner subsequently requests Grant continuation, start ET-1 from the new ACTIVE Work Packet: inspect only current candidate/source/test state, create bounded RED cases and a renderer proof using fake inputs, record choice, then ET-2 onward. Do not repeat the 20-product desk survey or start Foundation implementation. This turn only stores the plan. No implementation, preview deployment, email delivery, independent human E2E or release is performed here.

Work units should be coherent commits: renderer contract, schema/API, authoring UI, preview/test workflow, publishing/migration, qualification. Reuse existing PR #100 and Work Packet #67 rather than multiplying tracking issues. Run affected tests per change, consolidate full CI at meaningful boundaries and do not repeatedly trigger unrelated suites. Existing original G12 changes and Inbox stash are preserved throughout.

## 8. Acceptance matrix to add to the existing test plans

The following **24 planned acceptance checks** extend the scope of the already-authored CLI feature reconciliation and Full User E2E documents. They are not executed tests, not additions silently counted as PASS, and not a replacement for the existing 121-scenario user acceptance matrix. At ET implementation time map each case to concrete unit/API/browser/mail-client evidence and the relevant existing U/A/E/V scenarios.

| Check | Acceptance criterion |
| --- | --- |
| ET-T01 | Same validated synthetic design/context produces matching subject, HTML and plain-text semantics in preview, test and real-message renderer; final decision/PIN layout is included |
| ET-T02 | EMAIL_PIN, PLUS_OTP and PLUS_MFA display the correct instruction and factor explanation; no default false login requirement or same-email OTP called MFA |
| ET-T03 | Preview/test context cannot mint or persist real token/PIN issuance, queue unreviewed mail or call a decision API; all sample actions are inert |
| ET-T04 | Three decision actions and distinct View Details are present and readable when eligible; View Details is nondeciding and follows its own approved access boundary |
| ET-T05 | Server rejects raw JSON attempts to remove, duplicate, hide, relabel-only, rebind or inject a URL into protected approval controls |
| ET-T06 | Text/variable/asset/style injection, raw HTML/JS, script URLs, unsafe paste and malformed Unicode/markup fail safely without execution or secret leakage |
| ET-T07 | Long Korean/English subject/body, newlines, missing variables, malformed syntax, max-size and depth limits yield bounded actionable errors |
| ET-T08 | All nine events have consistent required content; terminal/result events cannot retain active decision actions |
| ET-T09 | Concurrent admin save/publish uses current CAS and preview hash; stale change receives 409/review-required without silent overwrite |
| ET-T10 | Publishing a template/layout/locale/asset revision changes only future requests; old request, queued mail and reminder/reissue design snapshots remain stable |
| ET-T11 | Rollback publishes a new immutable revision with history and policy-impact review; does not rewrite sent messages or activate policies |
| ET-T12 | Test send is bound to exact saved draft and approved own admin mailbox; duplicate clicks/ambiguous SMTP replies cannot automatically send twice |
| ET-T13 | Save, publish, preview sample data, asset use and test-send endpoints enforce current Grant actor scope; unrelated/member access denied |
| ET-T14 | Pinned renderer cannot read arbitrary files/includes, execute custom code, fetch arbitrary URLs or exhaust unbounded CPU/memory/output |
| ET-T15 | Logo/asset validation and preview isolation prevent remote tracking/fetch and cross-origin credential/token disclosure; referenced old assets remain versioned |
| ET-T16 | HTML-disabled mail retains exact decision names, verification instructions and safe URLs in meaningful plain text |
| ET-T17 | Approved received samples render correctly in Gmail web and Gmail mobile with exact selected client versions recorded |
| ET-T18 | Approved received samples verified separately in classic Outlook desktop, new Outlook and Outlook web; one is not evidence for another |
| ET-T19 | Approved received samples verified in Apple Mail/macOS and iOS Mail, recording actual client/OS versions |
| ET-T20 | Dark mode, images blocked, large fonts and plain-text rendering preserve required action/PIN/context visibility; no color-only meaning |
| ET-T21 | 320/375/390px mail preview and editor keyboard/touch flows preserve layout, protected labels, focus, minimum product target dimensions and no horizontal clipping |
| ET-T22 | Existing required real-user/mail approval gates pass on one candidate with independent actors and evidence; denied browser/credential methods are not rerouted |
| ET-T23 | Legacy text templates and restore/export/import schema behavior remain compatible in isolated fixtures; migration cannot reissue or invalidate existing approvals silently |
| ET-T24 | Renderer/editor source pins, dependency licenses/notices/SBOM and network-disabled install/runtime tests are recorded; resource budgets are measured, not claimed |

Mail-client support means the **actually tested versions and intended mail path**, not an unqualified promise of compatibility with every future client. No numeric performance, standards-compliance or mailbox-delivery PASS is claimed by authoring this document. Required missing mail clients, real mailboxes or authority remain explicit qualification prerequisites.

## 9. What this request does and does not complete

Completed by this workstream: comparative research, best-fit design, P0-ET roadmap, explicit security/product boundaries and 24 acceptance criteria stored in the repo and existing tracking. Not completed: renderer PoC, schema/storage migration, visual editor, new preview API, template publish workflow, real test mail, installed email-client screenshots, browser/user acceptance, merge or release.

The research is sufficient to start a bounded ET-1 decision/prototype. It is not a commercial vendor entitlement review or a license/legal opinion. Before adopting any library, capture the exact commit/version and transitive license/security evidence; before any new commercial/remote editor, verify entitlement, offline/runtime behavior, export ownership, data residency, telemetry and total cost with the vendor. These checks do not justify putting actual approval content or credentials into a trial account.

## 10. Official source register (accessed 2026-10-14)

Use the numbered references for the precise claims in §3. Feature editions, licensing and product APIs can change; recheck them when committing to a dependency. Proprietary sources are design references only, with no proprietary source code copied.

[R01]: https://support.atlassian.com/jira-service-management-cloud/docs/manage-settings-for-approval-by-email/ "Atlassian — manage approval by email/chat settings"
[R02]: https://www.servicenow.com/docs/r/platform-administration/email-layouts.html "ServiceNow — reusable email layouts"
[R03]: https://www.servicenow.com/docs/r/source-to-pay-operations/sourcing-and-procurement-operations/approval-email-notifications-template.html "ServiceNow — approval notification templates"
[R04]: https://learn.microsoft.com/en-us/power-automate/approvals-markdown-support "Microsoft — approval Markdown and client support"
[R05]: https://help.pipefy.com/en/articles/4378163-create-edit-and-send-email-templates "Pipefy — create/edit/send templates"
[R06]: https://help.pipefy.com/en/articles/4365765-what-to-do-when-an-email-template-contains-unsupported-html-code "Pipefy — unsupported HTML in templates"
[R07]: https://community.kissflow.com/t/g9y68h6/process-notifications "Kissflow Product Documentation — process notifications"
[R08]: https://docs.beefree.io/end-user-guide/team-collaboration/content-locking "Beefree — content locking"
[R09]: https://docs.beefree.io/beefree-sdk/rows/storage/self-hosted-saved-rows "Beefree — self-hosted saved rows"
[R10]: https://docs.unlayer.com/builder/tools/custom "Unlayer — custom tools"
[R11]: https://docs.unlayer.com/builder/latest/export-html "Unlayer — HTML export"
[R12]: https://docs.unlayer.com/start/frameworks/vanilla-js "Unlayer — basic embed and vendor-hosted script"
[R13]: https://support.stripo.email/en/articles/3726123-plugin-js-api-functions "Stripo — plugin JavaScript API"
[R14]: https://stripo.email/releases?page=5&type=plugin "Stripo — plugin extension/control release notes"
[R15]: https://plugin.stripo.email/editor-configuration/autosaving "Stripo — autosave data flow"
[R16]: https://mailchimp.com/help/use-button-content-blocks-new-builder/ "Mailchimp — button block size/style and mobile controls"
[R17]: https://mailchimp.com/help/design-an-email-new-builder/ "Mailchimp — global and block styles"
[R18]: https://docs.customer.io/messaging/design-studio/overview/ "Customer.io — Design Studio"
[R19]: https://docs.customer.io/messaging/design-studio/emails/linked/publish-changes/ "Customer.io — saved edits versus published linked messages"
[R20]: https://www.twilio.com/docs/sendgrid/ui/sending-email/how-to-send-an-email-with-dynamic-templates "SendGrid — dynamic templates, versions and activation"
[R21]: https://postmarkapp.com/support/article/1172-using-postmark-layouts "Postmark — layouts, previews and reuse"
[R22]: https://docs.novu.co/platform/integrations/email/writing-email-template "Novu — email template authoring"
[R23]: https://docs.knock.app/template-editor/email-templates "Knock — email editor and switching modes"
[R24]: https://www.courier.com/docs/design/templates/design-studio "Courier — Design Studio"
[R25]: https://documentation.mjml.io/ "MJML — semantic components, rendering and local compiler"
[R26]: https://github.com/mjmlio/mjml "MJML original repository and displayed MIT license"
[R27]: https://react.email/docs/utilities/render "React Email — HTML and plain-text rendering utilities"
[R28]: https://github.com/resend/react-email "React Email original repository and displayed MIT license"
[R29]: https://github.com/usewaypoint/email-builder-js "EmailBuilder.js original repository and displayed MIT license"
[R30]: https://github.com/GrapesJS/grapesjs "GrapesJS core original repository and displayed BSD-3-Clause license"
[R31]: https://github.com/GrapesJS/mjml "GrapesJS MJML plugin original repository and displayed BSD-3-Clause license"
[R32]: https://jira.atlassian.com/browse/JSDCLOUD-11054 "Atlassian feature request — approval button labels and positioning; not a released-capability claim"
[R33]: https://github.com/voidlabs/mosaico "Mosaico original repository and displayed GPL-3.0 license"

Additional official details supporting the corresponding family: Kissflow [email actions](https://community.kissflow.com/t/h7h9qtx/email-actions); Beefree [saved rows](https://docs.beefree.io/beefree-sdk/rows/reusable-content/create/save) and [export](https://docs.beefree.io/beefree-sdk/apis/content-services-api/export); Postmark [template API](https://postmarkapp.com/developer/api/templates-api); Knock [layouts](https://docs.knock.app/integrations/email/layouts) and [translations](https://docs.knock.app/template-editor/translations); Courier [draft/publish template API](https://www.courier.com/docs/design/templates/api); GrapesJS [component customization](https://grapesjs.com/docs/modules/Components.html). These are supplementary source pages, not additional product families in the 20-family count.
