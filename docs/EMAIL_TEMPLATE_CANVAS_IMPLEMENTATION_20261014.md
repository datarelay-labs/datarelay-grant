# Canvas-first approval email editor — implementation checkpoint

Date: 2026-10-14. Owner accepted the UI reanalysis with "Proceed".
Implementation baseline: `69e4aa9560352363ff4cff438461f39329a98fd4`, existing
Grant Draft PR #100, same dev-atlas worktree and branch. This is source and
synthetic component qualification, not production or actual-user acceptance.

## Implemented refinement

| Area | Current behavior |
| --- | --- |
| Inventory | On-screen lazy synthetic thumbnails, published and saved-draft revisions, authoritative active-policy counts, Edit draft; no blank-canvas requirement |
| ET-3A | One event selector, keyboard block outline, central server-rendered mail projection, contextual inspector; narrow screens use a closable property panel |
| ET-3B | Same-render preset thumbnails; friendly variable labels/examples with cursor insertion; complete-draft undo/redo; style resets preserve wording/locale; per-event headings in layout v3 |
| ET-4 UX | Last valid preview remains visible but stale; generation-bound currency; long EN/KO/missing-reason samples; contrast/heading errors link to the relevant block; diagnostics are collapsed; save/publication require current validation |
| ET-5 UI | Reviewed before/after approval-request preview, changed events/shared fields, authoritative active-policy impact, reason plus explicit confirmation, version history and rollback-as-new-revision |

Application controls and theme tokens reuse the pinned Foundation package. No
Foundation shared source, dependency pin, common shell or authentication settings
were changed. Brand management remains the existing Notifications Branding task;
logo upload remains unavailable rather than pretending a placeholder is an asset.

## Rendering, safety and state

- New immutable layout v3 adds renderer-owned block identity and event-specific
  headings. Legacy designs explicitly opt in as an unsaved draft. v1/v2 bytes and
  all archived output expectations remain unchanged; all three JSON shells are
  included byte-for-byte in the wheel. Runtime sending still needs no Node process.
- The canvas projects the same synthetic server HTML into allowlisted inert React
  elements. It never mounts raw HTML, follows links, copies resource/event
  attributes or issues a decision. The isolated Layout preview remains separate.
  Active/resource elements are rejected before iframe parsing; CSP and empty
  sandbox remain defense in depth. This is not an email-client fidelity claim.
- Actions, required request context, recipient/security semantics, actual URLs,
  PIN/OTP/MFA and final Confirm remain server-controlled. Terminal events do not
  gain approval actions. No existing request/outbox snapshot is rewritten.
- Publication reads current saved state before posting and binds the server's
  exact review proof. A changed editor/source invalidates review. An ambiguous
  attempted POST latches until an explicit current-state reconciliation establishes
  a newer saved revision; it is never automatically retried.
- Inventory policy counts are computed from active profile versions in one
  grouped read, not inferred from names or fabricated from cached UI state.

## Qualification

- Web: **725 unit tests passed**, TypeScript and Vite build passed. Vite's existing
  large-chunk advisory remains advisory, not a failed build or acceptance result.
- Python: **58 affected renderer/design/preview/publication/localization tests**
  passed, plus the distinct **1 inventory policy-count test**. These are 59
  non-overlapping targeted tests, not the full repository suite.
- Chromium: **7/7 synthetic browser component/integration cases passed**: direct
  selection and style changes, cursor variables/history/event scope, stale-result
  handling, active-resource rejection, keyboard/390px fit, actual Notifications
  composition with reviewed draft save, and explicit publication review/confirm.
  A final affected Notifications rerun covers the save-validation readiness guard.
- Ruff passed. Pinned MJML compilation reproduced v1/v2/v3. Wheel inclusion passed.
  Exact pushed-HEAD native CI is recorded separately in Issues #37/#67.

The browser harness mounts real Grant components and the real pure Python mail
renderer, with synthetic intercepted API requests. It accesses no real account,
credential fixture, live DB, decision issuance, SMTP endpoint or real recipient.
It is **not** Surface Reconciliation, Full User E2E, Gmail/Outlook acceptance or a
claim that the deployed development preview contains this source.

Run component qualification after normal dependency setup:

```sh
npm --prefix web run test:canvas
```

On dev-atlas the existing user-space Playwright runtime libraries were reused via
`LD_LIBRARY_PATH`; no system installation or host permission change was made.
The initial missing-library launch failure, selector-label failures, narrow-grid
overflow and blocked-resource attempt observation were fixed and rerun, not hidden.

## Remaining work and safety records

Next: reconcile the preserved stricter ET-4 reviewed-test-send source and its UI
against this new editor, normally retrying the original authorized source/test
operation rather than treating its historical denial as permanent. Logo/CID is a
separate incomplete asset workstream. Actual mail-client and approved independent
user/mailbox acceptance remain unexecuted; no deployment, merge or release.

The historical ET-5 publication-UI denial no longer describes current capability:
normal source work under the current owner instruction succeeded and synthetic
qualification passed. A separate combined old-log/status read in this continuation
was platform-blocked and was not rerouted. Independent source work and new test
runs succeeded. Preserve the original G12 dirty file and Inbox stash unchanged.

## U1.05 / U1.07 bounded continuation design (planned contract, not a PASS)

Goal: add optional explanatory blocks with real selection/move/remove/persistence,
then prevent unreviewed loss of an edited draft. Non-goals: Foundation changes,
new approval authority, arbitrary HTML/CSS/URLs, mail sending or publication.
A new immutable shared layout revision 4 adds at most three server-allowlisted
`content_1`..`content_3` IDs, with bounded safe wording in `optional_content`.
They exist only between `message` and `request_context`; the protected sequence
and identities are immutable. Optional wording/order is explicitly set-wide.
The schema requires a bijection between optional IDs and wording; old revisions
reject the extension, and v1/v2/v3 artifacts and existing outputs stay unchanged.
No database migration or automatic upgrade/publication. Existing designs opt in
only when Add content is chosen, as an unsaved draft. Undo/redo covers additions,
removals and order. Renderer, canvas, inspector and saved design share the IDs.
U1.07 intercepts editor Back/section exit plus page unload when dirty, asks Keep
editing or explicit Discard, never saves/publishes implicitly. Saving/ambiguous
outcome keeps existing reconciliation guards. Failed saves retain local content.
Qualification: RED-first schema/renderer tampering tests, mounted synthetic UI
Add/edit/move/remove/save/reopen and dirty-exit/failure cases, affected regressions,
compiler reproduction and exact-HEAD CI. Deployment/user/mail acceptance remains
separate and must not be inferred from these tests.


### U1.07 implementation checkpoint / U1.05 current denial

U1.07 now asks Keep editing / Discard for dirty Back and Notifications section
exits, retains focus/Escape recovery, and registers dirty page-unload protection.
An unresolved save cannot be abandoned through those controls. Explicit refresh
updates the saved baseline without overwriting differing local wording. A lost
response whose write actually committed reconciles to the same saved draft.
Existing one-shot save/CAS/Review->Confirm and no-publish/no-mail semantics remain.
This checkpoint qualifies these entry points, not all application-shell history
navigation or actual authenticated client acceptance.

U1.05 remains BLOCKED, NOT IMPLEMENTED. RED-first Python: three positive cases
failed with expected unsupported revision/optional-content errors, 13 negative
cases already rejected; two Web model tests failed with missing helpers. The
normal Remote_Desktop_Commander.start_process source-write batch on dev-atlas
(worktree unchanged) was denied before execution with:
`요청의 보안 상태를 결정하지 못해 이 도구 요청은 OpenAI에 의해 차단되었습니다.`
Denied targets: grant/email_design.py, grant/email_renderer.py,
mail-renderer/build.mjs, web/src/email_design.ts, email_canvas_model.ts and
email_template_workbench.tsx. Readback showed none changed. No alternative tool
or reformulated optional-content write was attempted. Pending tests are preserved
under .dev/u1-05-blocked/; RED logs .dev/u1-05-{python,web}-red.txt. They are not
shipped or counted as passing tests. Old layout artifacts remain unchanged.


Verification for the U1.07 source checkpoint: `npm --prefix web run test:canvas --
draft-exit.spec.ts notifications.spec.ts` executed six Chromium cases (five new,
one existing), all PASS. The retained JSON is .dev/u1-07-browser-results.json;
log .dev/u1-07-browser-final.txt; dirty-exit screenshot .dev/u1-07-dirty-exit.png.
Affected save/preview/initial-readiness/publication units: 20/20 PASS
(.dev/u1-07-units.txt). TypeScript and production Vite build PASS
(.dev/u1-07-build.txt). Scoped diff hygiene PASS; global worktree diff hygiene is
intentionally not clean because the preserved original G12 test contains its
existing trailing blank line. No G12 edit or stash mutation was made.


U1.07 app-navigation extension was also blocked before source execution by
Remote_Desktop_Commander.start_process on dev-atlas. Exact response:
`요청의 보안 상태를 결정하지 못해 이 도구 요청은 OpenAI에 의해 차단되었습니다.`
Targets: new web/src/grant_navigation.ts, Grant-owned app.tsx and the navigation
extension in notifications.tsx. Readback confirmed these writes did not occur;
8490ce0 remains the implemented Back/sections/unload/reconciliation checkpoint.
Pending router harness/tests are retained in .dev/u1-07-navigation-blocked/;
RED log .dev/u1-07-navigation-red.txt is a missing-module/entry-point result,
not a successfully exercised navigation scenario. No bypass/reformulated router
source operation was attempted. Browser-history/app-shell dirty exit remains open.

### U2.01 inventory completion design

Add real duplicate-to-new-draft, saved update metadata and an administrator-only
read-only paged policy-usage drill-down. Reuse the existing Review->Confirm create
path; duplication copies all event wording and design without the source ID,
publication pointer or policy bindings. A legacy text copy explicitly uses the
unchanged v1 renderer in a new unpublished design draft, preserving original
source and wording; no automatic activation, publication, email or execution.
The new usage GET reads count and exact active policy version records in one
read-only transaction, has bounded paging and truthful error/loading states.
Foundation, renderer schemas/artifacts, existing authority and server CAS remain
unchanged. Acceptance: API role/paging/identity/no-write checks, model deep-copy/
name-limit/legacy cases and mounted duplicate/save/reopen/usage interactions.


U2.01 duplicate/usage extension is NOT IMPLEMENTED: the normal
Remote_Desktop_Commander.start_process source batch on dev-atlas returned
`요청의 보안 상태를 결정하지 못해 이 도구 요청은 OpenAI에 의해 차단되었습니다.`
Targets: grant/email_inventory.py, grant/domain_routes.py,
web/src/email_template_inventory.tsx and the duplicate callback in notifications.tsx.
Readback showed no product-source mutation. Pending API/model/browser tests and
their synthetic transport extension are preserved in .dev/u2-01-blocked/;
active fixture restored to its exact already-committed bytes. RED evidence:
usage GET returned 404, two missing-duplicate-helper tests failed. No bypass or
reformulated source request. Existing inventory remains; new duplicate, usage
drill-down and update-metadata behavior is still required. Independent U2.02+
current implementation verification continues without another competitor survey.


### U2 retained authoring behavior — missing interaction qualification

Five new actual-Notifications component browser scenarios now have supporting
PASS evidence: preset/reset preserving edited subject/body/headings/footer/
locale/suffix; independent nine-event editing and save/reopen; searchable
human variable insertion/caret and maximum-length rejection; explicit Korean
wording restore/cancel scoped to one event; whole-copy/style undo/redo, redo
branch invalidation and template-isolated history. Transport is synthetic,
while preview and defaults call the existing original Python renderer; no
real person, account, mail, policy publication or external effect was used.
First test-authoring run: one restore case PASS, four cases could not reach
their intended assertion because protected buttons include Protected in their
accessible name and a boolean disclosure-open attribute was misread. These
were test-harness errors, NOT product REDs. The corrected selectors and
preview observer (excluding independent preset-thumbnail requests) yielded
4/4 remaining scenarios PASS with no product-source change.
Evidence: .dev/u2-authoring-coverage-initial-harness.txt and
.dev/u2-authoring-results-initial-harness.json (original run);
.dev/u2-authoring-corrected.txt and .dev/u2-authoring-corrected-results.json
(four corrected cases). Tests: web/tests/canvas/authoring-contract.spec.ts.

This does not close U2.03: event preheaders are still missing. U2.01 duplicate,
policy usage and saved update metadata remain blocked/unimplemented. These
synthetic checks cannot complete deployed or actual-user acceptance cells.

### Original no-omission crosswalk and validator recovery

The exact prior historical read was normally retried on dev-atlas and succeeded;
it is no longer a current access blocker. The new original crosswalk preserves
24 exact ET checks, 121 original real-user/operator scenario identities and
wording, 9 original UX gap rows and 12 structured study findings with source
line/hash and WBS links. None is counted as executed acceptance. Remaining
narrative/S02/S03 reconciliation and fresh test/commit linkage stay OPEN.
The original tools/validate_competitor_ui_wbs.py hygiene edit was also normally
retried and succeeded, retaining its original bytes privately in .dev.
Ruff PASS; 11/11 new anti-omission/false-acceptance tests PASS; its five negative
self-checks PASS and --require-complete deliberately remains rejecting OPEN
product completion. No completed competitor research or REA was repeated.

### U2.03 remaining event preheader design (independent of blocked optional content)

Add a short event-specific inbox summary, not a new movable content block.
Use a new immutable MJML layout revision 4 and per-event `event_preheaders`
(maximum nine known events, 200 characters, allowlisted variables, no newline,
control characters or unescaped markup). Revisions 1/2/3 retain exact artifacts
and output; their nonempty preheader extension is rejected. Revision 4 keeps
the seven protected blocks exactly unchanged. The hidden recipient summary
is exposed visibly beside Subject in the editor, selectable through Subject
settings; the inert canvas omits only the compiler-owned metadata element.
Editing this field explicitly opts that unsaved draft into the new version;
Save draft and publication continue using the existing reviewed boundaries.
Empty values mean no optional summary. No implicit translation, approval
identity/URL/policy change, optional-block retry, email send, Foundation edit or
application-navigation change is included. A later optional-content revision
must rebase its preserved pending design/tests rather than overwrite revision 4.

U2.03 event-preheader implementation qualified: layout 4 is now generated by the
pinned local MJML compiler; v1/v2/v3 hashes remain exact. Preheaders are escaped,
one-line, event-scoped metadata with 200-character source/2048-character rendered
bounds. The visible Subject summary shows the actual expanded preheader while
compiler-owned hidden metadata is omitted from the selectable message canvas.
Current-field variable insertion received an additional browser RED->GREEN fix:
a focused preheader is now updated without modifying the subject. Full snapshot
undo and normal reviewed draft save/publication semantics are retained.

Results: 12 new preheader Python cases plus affected renderer/schema/publication/
preview/legacy reproduction cases = 86/86 PASS; new and affected focused Web
units 9/9 PASS; full existing+new Web suite 727/727 PASS (96 files); two dedicated
Chromium preheader scenarios PASS. TypeScript/Vite and scoped Ruff PASS. Local
`build.mjs --check` reproduces all four artifacts. A locally built wheel contains
byte-identical v1/v2/v3/v4 assets; v4 SHA256 is
b6f460c4bb88150866e5e9977649023e7f6070fe16fee835a72e577dd3847274.
Evidence .dev/u2-03-preheader-{python,web,web-full,build,package}.txt and
.dev/u2-03-preheader-browser-results.json; original new-field variable RED log
.dev/u2-03-preheader-variable-red.txt. No actual mail-client/user acceptance or
development-preview deployment is claimed. U1.05's preserved, never-applied
optional-content proposal must use a later layout revision; it cannot overwrite
this revision 4 artifact.

### U3.01 / U3.03 recipient hierarchy and bounded color design

New immutable layout 5 adds an uneditable localized event-status caption and
orders new recipient mail as brand -> status/title -> explanation -> required
request context -> Approve/Hold/Deny -> separate View Details -> verification
instructions/PIN -> mandatory footer. Plain text follows the same order. No
eligibility, verification, decision identity/URL or confirmation rule changes.
Old v1/v2/v3/v4 artifacts and outputs remain reproducible; previously saved
versions never opt in silently. New templates use the current layout; explicit
appearance/canvas upgrade is an unsaved edit on an existing template.

A strict `palette` contains only mail page/content backgrounds and body/brand
text colors. Curated Light/Warm/Dark schemes plus collapsed custom controls
provide contrast feedback. Both body and brand text require >=4.5:1 against
the content background, enforced again by the server; existing action-white
contrast gates remain. Old layout revisions reject a non-default palette rather
than ignore it. Palette reset is separate and preserves wording, event maps,
locale, action styles and bindings. App/Foundation themes are not changed.
Editing a preheader must retain layout 5 rather than downgrade it to layout 4.
Qualification: schema/model tampering, all nine events in EN/KO, protected order,
legacy artifact hashes, mounted apply/custom/recover/reset/save/reopen and
preheader non-downgrade. Real-client dark-mode acceptance remains NOT_RUN.


U3 current scoped checkpoint: layout 5 source, palette/server constraints,
TypeScript and Ruff are implemented/passing locally. Forty current presentation
and preheader Python cases PASS, including all nine events in EN/KO; eight
palette/preheader/canvas model units PASS. One actual-Notifications desktop
palette/status/order/edit/save/reopen case PASS with screenshot
.dev/u3-dark-palette-desktop.png, inspected directly. The second, mobile test
failed before exercising its intended scenario because it did not open the
mobile property inspector. This is an incomplete test setup, not evidence of a
product defect or mobile PASS. A normal corrective batch (open the inspector
in that test; compact palette button presentation) was blocked before execution
by Remote_Desktop_Commander.start_process on dev-atlas:
`요청의 보안 상태를 결정하지 못해 이 도구 요청은 OpenAI에 의해 차단되었습니다.`
Denied targets: web/src/email_palette_controls.tsx and
web/tests/canvas/mail-palette.spec.ts. No corrective write occurred and no
alternate/reformatted correction was attempted. The native pending scenario,
its original failure trace/screenshot and SHA remain under
.dev/u3-palette-blocked/; .dev/u3-palette-browser-results.json records the actual
one PASS/one setup failure. It is deliberately not shipped as a falsely green
browser suite. U3.03 mobile interaction/compact polish remains OPEN/BLOCKED.
Existing implemented server/desktop source remains available for independent
review. The original G12 test and all previous pending bundles are preserved.

### U4 preview interaction and exact-field recovery design

Use mounted Notifications with explicitly synthetic intercepted preview transport
and the original Python renderer to verify old/latest response ordering, retained
stale content, server failure/recovery, sample/mode switching and exact matching
HTML/text/layout identity. No actual account, mail, publication or request writes.
Local validation issues carry the exact human field label as well as their block;
clicking recovery opens the existing inspector and focuses that particular input,
not the first unrelated control. Collapsed ancestors open only for the requested
field. Palette-control layout and the currently blocked mobile palette scenario
are not part of this independent change. Other version/publication guards remain.


U4 results: actual Hold-color recovery focus defect was reproduced with the
existing editor. A normal U4.04 source fix request (precise field labels, exact
input focus and disclosure expansion) was denied before execution by
Remote_Desktop_Commander.start_process on dev-atlas, with the same explicit
platform safety-decision error recorded above. Targets: email_preview_model.ts,
email_live_preview.tsx and email_template_workbench.tsx. Readback confirms the
old one-argument block callback and generic first-control focus remain. No
alternate or reformulated implementation was attempted. Original four-case
harness including the genuine focus RED is preserved unchanged at
.dev/u4-exact-focus-blocked/preview-contract.spec.ts; RED log
.dev/u4-exact-focus-red.txt. U4.04 exact-field recovery remains BLOCKED.

The other three independent existing-behavior scenarios ran normally and all
PASS (.dev/u4-independent-preview-results.json): delayed/out-of-order response
cannot replace current content; last valid content remains explicitly stale
through failure and recovers without saves; four sample types, three verification
modes, nine events, desktop/320/375/390 layout widths, exact text/source output
and collapsed diagnostics use the same synthetic renderer response. Only those
three passing cases remain in active preview-contract.spec.ts. No failed focus
scenario is silently marked PASS. Source/browser transport remains synthetic,
zero writes observed; actual mail-client/person acceptance stays NOT_RUN.

U3/U4 source checkpoint regression: full Web units 729/729 PASS (97 files),
127 affected Python cases PASS, including the 13 current original-coverage
checks; TypeScript/Vite and scoped Ruff PASS. The compiler reproduces layouts
1..5 and the locally built wheel includes each exact artifact. Three independent
current-preview browser scenarios PASS; U3 desktop palette case PASS. The archived
U3 mobile-setup case and U4 precise-focus RED are explicitly NOT passing gates.
Evidence: .dev/u3-web-full.txt, .dev/u3-python-regression.txt, .dev/u3-build.txt,
.dev/u3-layout-package/, .dev/u4-independent-preview-results.json. No running
user preview was replaced and no real mail/user acceptance was executed.

The S03 original audit is now preserved verbatim in ORIGINAL_EMAIL_UI_AUDIT_20261014.md;
its two canonical GitHub comments have identical body SHA256. All seven original
UI-01..UI-07 rows have exact line/wording/WBS mappings, now enforced by the checker
and two additional omission/tampering tests. The named S02 original attachment
remains unlocated; no replacement research or fabricated narrative closure.

### U5.02 / U5.03 / U5.06 review and historical preview design

Event-specific preheader changes must be classified on that event, not as a
set-wide change. The comparison lists subject/body/heading/preheader fields per
event and individual shared palette/style fields. Existing review hash/CAS,
actor, policy impact and explicit confirm contracts are unchanged.

Add an administrator-only read-only immutable-version preview: verify the
stored snapshot hash, render only allowlisted events against existing synthetic
publication sample data, and return the stored revision/actor/time/hash plus
rendered output. It must not create drafts, publish, issue decisions or touch
queued messages. UI shows actual history actor/time, exact active policy/version
IDs, and a separate view-only historical preview. Existing rollback-as-new-
publication remains separate; no automatic historical replay or real SMTP.
Tests use disposable API DBs or intercepted synthetic browser transport only.

U5 inspection checkpoint: per-event subject/body/heading/preheader differences,
individual palette fields and actual policy/version IDs are now displayed.
A read-only immutable historical preview verifies snapshot hash/current admin
and exposes stored author/time/revision/hash, without creating any publication,
draft, request, issuance, outbox entry or audit write. Three new API cases plus
five comparison/publication regressions PASS (8 total). The original no-write
baseline initially included a separate synthetic user's login; the corrected
test authenticates both fixture users before the baseline and retains the exact
all-table equality assertion. Browser fixture initially omitted required sample
context; using the existing complete synthetic sample corrected that harness.
Neither harness issue was a production defect or an acceptance pass.

A genuine U5.04 client recovery defect was reproduced and fixed: a server 409
PUBLICATION_CHANGED_REVIEW_REQUIRED, known to occur before any commit, now
releases the pending attempt but permanently consumes that proof. The user must
request a fresh review; the old POST is not replayed. Unknown conflicts and
transport/ambiguous failures remain latched. Five guard unit cases PASS.
Three mounted scenarios PASS: reviewed explicit synthetic publication, historical
read-only preview, and definitive-conflict/fresh-review recovery. Real current
administrator/mailbox/production publication was not invoked. TypeScript/Vite
and scoped Ruff PASS. Evidence: .dev/u5-inspection-python-final.txt,
.dev/u5-inspection-browser-qualified-results.json, .dev/u5-conflict-{red,green}.txt,
.dev/u5-inspection-build.txt. Existing rollback creates a new immutable published
revision; exact old request snapshots remain governed by the original API tests.

### U6 normal retry / raster normalization boundary

The previous-turn logo operation is retried normally on the same dev-atlas
worktree/tool, not through an alternative executor. Reuse the retained original
asset tests; preserve their original bytes and rebase only version selection
when a new immutable renderer is introduced. No changes to currently denied
optional-block, navigation, palette-layout or exact-focus operations.

Asset processing accepts only bounded PNG/JPEG (256 KiB encoded-input byte
budget, at most 512 x 512 pixels), rejects unsupported/animated/trailing payloads,
checks PNG framing/checksums before decoding and removes ancillary metadata
before decompression. Decode with the official Pillow 12.3.0 release pinned in
the project lock; re-encode fresh RGBA pixels as deterministic PNG without
metadata. IDs hash normalized bytes. This is a new explicit admin upload only;
no arbitrary URL, remote image fetch, SVG/GIF/script or automatic send. Existing
notification_assets table and admin authority are reused; stored bytes are
immutable, old issued snapshots must retain their exact asset identity/data.

Implementation reference (library API only, not competitor re-research): official
Pillow Image reference and Image file formats documentation, release 12.3.0,
https://pillow.readthedocs.io/en/stable/reference/Image.html and
https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html.
The UI/CID/renderer integration and qualification remain a separate subsequent
step; normalizer-only tests are not counted as complete U6.02 or U6.03.

U6 current operation result: the normal original logo backend retry succeeded.
The prior 256 KiB proposal was tightened to 32 KiB input AND normalized output,
so base64 JSON stays within the existing 64 KiB HTTP request ceiling. No global
HTTP limit or authentication policy was relaxed. JPEG framing rejects concatenated
or trailing payloads; PNG framing/CRC rejects animation and strips ancillary
metadata before decode. Historical snapshot validation hashes/validates stored
normalized RGBA PNG bytes without re-encoding them, so a library upgrade cannot
silently rewrite the historical attachment. The MIME composer binds the exact
image source and deterministic CID, includes one related PNG and unchanged
plain-text alternative, and rejects mismatched CID/data before opening SMTP.
All transport tests use FakeSMTP; no actual email was sent.

The independent Grant-owned upload UI/canvas/iframe rendering integration batch
was denied before execution by Remote_Desktop_Commander.start_process on dev-atlas:
`요청의 보안 상태를 결정하지 못해 이 도구 요청은 OpenAI에 의해 차단되었습니다.`
Targets: new email_logo_controls.tsx/email_logo_safety.ts and their integration
in email_design.ts, email_palette.ts (version preservation only),
email_palette_controls.tsx (version preservation only), email_template_workbench.tsx,
notification_preview.tsx and email_canvas_projection.tsx. Readback shows these
frontend writes did not occur. No alternative executor or reformulated UI
integration was attempted. The existing image-blocking UI remains unchanged;
U6 upload/preview UI and its browser qualification are NOT implemented/PASS.
The immutable server asset API and mail MIME source can be independently
qualified without weakening or bypassing this denied UI operation. Layout 6 is
opt-in through a saved design; existing frontend still creates layout 5 and
advertises logo upload as unavailable until the UI work can be completed.

U6 backend qualification checkpoint: 84 affected API/renderer/publication cases
PASS before the compatibility follow-up; the final focused 60-case run also
PASS after five RED->GREEN checks ensuring layouts 1..5 API responses do not gain
an irrelevant logo_width field. Immutable published logo previews remain byte-
identical after the disposable test asset-table row is removed. MIME tests
capture exactly matching related PNG bytes/CID without opening a real SMTP
connection and reject mismatched attachment identity before transport. Original
v1..v5 artifacts are unchanged; new v6 hash:
50c162c380e43801e8276cb2528239da3df9f095c2aad46eb081769669ebe292.
Compiler reproduction and exact wheel layout inclusion 1..6 PASS; scoped Ruff
PASS. Pillow dependency pinned 12.3.0. Evidence .dev/u6-assets-qualified.txt,
.dev/u6-logo-final-api.txt, .dev/u6-logo-{integrity,compat}-{red,green}.txt where
present (final compatibility GREEN is included in u6-logo-final-api.txt),
.dev/u6-assets-package.txt. U6 frontend upload/render integration remains
explicitly BLOCKED and is not included in this commit or called accepted UI.

### U6.04 / U6.05 reviewed test-send checkpoint — `86badc1f1cc0c028106cd933e69121db946966e0`

The existing preview/review UI is now bound end-to-end to a server-verifiable
saved-template proof and a durable one-shot attempt ID. Preview returns the exact
saved `updated_at` plus a SHA-256 review proof over actor, own registered mailbox,
template snapshot, sample inputs and rendered output. Confirmation POST carries
that proof and a fresh attempt ID; the server re-reads authority, transport pause,
recipient, saved template including immutable logo bytes, sample/rendering and
proof before it inserts the attempt claim. The claim commits before SMTP, so a
concurrent duplicate or retry with the same attempt ID cannot send twice.

Database schema v14 adds only `notification_test_attempts`; the v13->v14 migration
is additive and preserves existing users/templates/publications/assets/audit
rows. Current-schema assertions and backup/restore qualification were updated to
v14. `ATTEMPTED`, `ACCEPTED` and `UNKNOWN` are distinct durable states. A test-send
status GET is scoped to the current admin actor, template and attempt ID. SMTP
success means transport accepted only; it never claims inbox receipt. A transport
exception records `UNKNOWN`, and the same attempt cannot be replayed. The UI
remains latched while `ATTEMPTED`; explicit status reconciliation releases a
terminal ACCEPTED/UNKNOWN attempt, after which any new message requires a fresh
preview/review and a new attempt ID. A definite pre-transport stale-proof/rate-
limit rejection can release the local claim but is never automatically retried.

Qualification used only disposable test databases, monkeypatched/Fake SMTP and
synthetic intercepted browser transport; no actual email was sent. Focused server
review/replay/status/migration/recovery tests PASS; 13/13 client guard/review units
PASS. Three actual Notifications component browser scenarios PASS: successful
one-shot + ACCEPTED reconciliation, ambiguous transport + UNKNOWN reconciliation
with a fresh subsequent review, and ATTEMPTED remaining locked until a later
terminal read. The first two browser-authoring attempts exposed harness-only gaps
(collapsed saved-preview section, then missing synthetic `event`/default
verification-mode fields); after correcting the harness, 3/3 scenarios PASS.
Full Web units at this checkpoint: 731/731 across 97 files; TypeScript/Vite,
scoped Ruff/diff hygiene and immutable renderer reproduction PASS. Evidence:
`.dev/u6-reviewed-send-{red,backend-green,web-unit,api-regression,web-full,build,ruff,renderer}.txt`,
`.dev/u6-reviewed-send-browser-green-results.json`. GitHub exact-head CI was
queued/in progress when this evidence note was written; it is not pre-claimed.
U6.06 actual self-mail receipt remains NOT_RUN and requires its real authorized
environment/effect. No production, merge or release action was performed.


### U7 committed qualification checkpoint

Current exact source `d1421320678e8b660e6d43614f175030f1ed3729` has native
Grant checks and both Engineering System workflows SUCCESS. The pinned MJML
compiler reproduces immutable layouts 1..6; the locally built wheel contains
byte-identical layout artifacts with the recorded hashes. The WBS/crosswalk
validator and its negative self-checks PASS while correctly retaining overall
product completion OPEN.

The mounted Notifications qualification at this exact source uses real Grant
components with explicitly synthetic route transport. One keyboard-only task
selects Compact, edits the message, selects protected approval actions, changes
button size, captures desktop and 390px evidence, saves through Review/Confirm,
performs the mandatory post-write authoritative refresh, returns to inventory and
reopens the persisted draft. Result 1/1 PASS; the saved draft revision advances,
published revision does not, and only one synthetic PUT is observed. Evidence:
`.dev/u7-qualification-green.txt`, `.dev/u7-qualification-green-results.json`,
`.dev/u7-keyboard-desktop.png`, `.dev/u7-keyboard-mobile-390.png`.
This is mounted synthetic interaction evidence, not a real user/mail-client PASS.
320/375 editor-width qualification, manual/touch observations, actual clients,
independent authorized personas and measured novice timing remain separate OPEN
gates.


### Remaining mandatory recipient/editor WBS qualification — exact source 1f0ada8

The dependency-ready recipient/editor rows were executed instead of reopening
competitor research. `tests/test_email_remaining_wbs.py`: 32/32 PASS. This binds
server bounds, canonical/immutable action identities, nine-event eligibility,
EMAIL_PIN/OTP/MFA guidance, literal safe rich formatting, renderer reproducibility,
zero-write/admin-only draft preview, save-versus-publish separation, immutable
rollback/request history, and text-brand/footer fallback.

Mounted real Notifications composition with synthetic route transport:
`recipient-contract.spec.ts` 4/4 PASS. It verifies S/M/L 44/48/56px target math,
custom spacing and 320/375/390 views through save/reopen; canonical
Approve/Hold/Deny + distinct View Details and all three verification modes;
seven terminal events expose no decisions; hostile literal markup remains text,
rich emphasis/footer persist with the mandatory notice; explicit legacy canvas
upgrade preserves all nine event wording + KO locale and changes only the draft.
Artifacts: `.dev/wbs-u3-source.txt`, `.dev/wbs-u3-browser.txt`,
`.dev/wbs-u3-browser-results.json`.

These results close source/interaction evidence only. Deployed-development,
real-mail-client and independently operated persona gates remain separate. The
previously recorded U3.03 palette mobile denial and U4.04 exact-focus denial are
not bypassed or relabeled by these independent passes.
