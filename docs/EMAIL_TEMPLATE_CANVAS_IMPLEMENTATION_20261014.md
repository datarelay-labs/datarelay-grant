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
