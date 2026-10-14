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
