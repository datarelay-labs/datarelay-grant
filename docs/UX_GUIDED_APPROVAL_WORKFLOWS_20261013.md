# Grant 1.0 — first-time workflow clarity (2026-10-13)

Status: candidate source implementation / user-facing browser confirmation still pending.
Owner request: make the product less text-heavy; new users must quickly see
where to start, which field to fill, and which button advances their task.

## Observed problem and baseline

Reviewed the existing installed fixture Chromium capture
`.e2e/screenshots/approval-pass-1.png` (historical synthetic run, not a new
human Full User E2E). It contains repeated operation/target text and lengthy
approval, transport and external-effect explanations in vertically stacked
cards. Decision buttons occur below the explanatory material; the old New
Request form displays randomly generated technical identifiers and raw JSON
alongside essential human inputs. The original task-first Home has role-scoped
queues but no visually prominent user-journey starting point.

## Source changes — product domain only

- **Home / `home_getting_started.tsx`**: three large task/action cards,
  numbered and color-distinguished, show Create request, Review assigned work
  and Track my requests. Buttons use the existing permitted routes. An
  administrator-only policy setup link uses the already authorized `/profiles`
  route; no new role or action is granted. When source pagination is partial,
  displayed nonzero counts are explicitly lower bounds.
- **New Request / `request_workflow_guide.tsx` + `requests.tsx`**: an accessible
  three-stage progress strip precedes the existing server policy selector,
  title, exact target, optional reason and unchanged Review request →
  separate Confirm create request sequence. Short field examples explain what
  to type. Technical external ID remains randomly generated and submitted
  exactly as before; the existing JSON action parameters are still available
  in a native keyboard-accessible Advanced integration details disclosure
  (opened for replacements). Dynamic policy-enforced tenant/environment/risk
  selectors remain visible and required whenever the active policy needs them.
  A missing active policy is called out after the authoritative list has loaded.
- **Request Detail / `request_detail_overview.tsx`**: compact three-column
  status cards differentiate **human approval**, **webhook transport**, and
  **executor-reported** result; no status promotes an email ACK or granted
  approval to verified execution. The recorded approval deadline/progress
  remain visible. Long technical evidence and execution-grant caveats remain
  accessible via one native details disclosure. When current server state and
  assigned seat allow it, an informational anchor jumps to the original
  permission-checked decision card, never itself approves. The original
  exact immutable operation and target still precede all decisions.
- Shared visual styling belongs only to
  `web/src/workflow-guidance.css`, not a fork of Foundation AuthLayout,
  ProductShell, administration or privileged backend functionality.

## Authorization and verification boundary

No approval/request-create/cancel/notification/consumer operation endpoint,
permission, TOTP/PIN, idempotency guard or persistence schema is changed.
Existing Review → Confirm and server-side revision/seat/policy/recipient
checks remain unchanged; dangerous or ambiguous POSTs are not retried.
CSS supports keyboard focus and reduced motion, with single-column content
at narrow widths. This is developer UI source, not acceptance of a new
external execution capability.

Added `web/tests/unit/workflow-guidance.test.ts`; evolved the former text-only
heading assertion in `request-intake-workspace.test.ts` to validate the new
three-stage workflow, not a different backend contract. Execute native Web
unit tests and TypeScript/Vite build on this exact commit, and retain the
original G12 uncommitted test / Inbox stash intact.

A fresh directly operated browser script using the disposable fixture
credentials was blocked by an OpenAI safety check before execution. It was
NOT retried using an alternative browser/credential path. Existing prior
fixture screenshots are baseline evidence, **not** a current-HEAD UI E2E PASS.
Independent full two-person mailbox browser acceptance and native real
Control/Stellar effects remain separately pending. Direct-IP preview should
be updated only from an immutable Web snapshot with private rollback, keeping
its SMTP/worker/credential effects disabled.

## Next safe UX iteration — administrator's first setup path (2026-10-13)

After the first guided Home/New Request/Request Detail implementation and
CI-qualified source, a separate novice administrator path remained unclear:
Approval Policies opened on a long table and a `Create policy` button, but
neither explained the actual preparation sequence nor showed where to go.

`web/src/admin_first_run_setup.tsx` now mounts a compact four-step visual
journey **inside the existing administrator-only Policies list page**:

1. Register a connection → `/integrations` (a registered record is NOT a
   verified external product connection)
2. Choose approvers → `/approvers` (an enabled account is NOT an assigned or
   verified approval seat)
3. Create a Draft policy → original `startCreate` editor callback (no new
   create POST or bypass)
4. Test and activate → scroll to `#grant-policy-list` and open the existing
   source-authoritative saved policy, preserving separate Testing and
   activation confirmations

Counts come from the same already admin-authorized loaded integrations,
account roster and policy rows. Before successful load they say "Checking
saved setup", never a fabricated zero, green status or automatic approval.
A policy with a separately recorded active version can be counted as active
even if the newest draft is under edit. Every call to configure, test or
activate retains the original server controls. The existing policy list and
Create button remain intact. `web/src/workflow-guidance.css` adds responsive
four/two/one-column numbered setup cards with keyboard focus, not a new
Foundation theme or navigation privilege.

`web/tests/unit/admin-first-run-setup.test.ts` checks the exact flow,
registered-vs-verified semantics, loading state and actual mounted Policy
page; previous policy-workspace regressions must remain green. This iteration
requires affected native Web/TypeScript/Vite plus exact-HEAD GitHub CI.
It **does not** cure the earlier platform-denied authenticated-browser
credential operation or qualify actual two-user/two-mailbox Full User E2E.
No backend policy, integration token, SMTP transport, external effect, host
service, release or permanent credential is changed by this feature.

## Novice sign-in and review-focus refinement (2026-10-13)

At PR #100 baseline `49e1e1e`, direct HTTPS development preview was
visited with an installed, **anonymous** Chromium at 1280×800 and 390×844.
Each of `/login`, `/home`, `/requests/new`, `/approvals`,
`/requests/{id}`, and `/profiles` returned HTTP 200 HTML but displayed
the expected sign-in gate instead of protected data. There was no horizontal
overflow or browser JavaScript exception. This is **not signed-in E2E**.

A real 390px login screenshot exposed a beginner problem: five optional
documentation/support links occupied most of the first screen and pushed
the actual sign-in action below them. The Grant-owned `GrantAuthFrame`
retains those same destinations but moves them into a collapsed
`Help & documentation` disclosure **after** the primary auth form.
This composes the original pinned Foundation `AuthLayout`; it does not
fork Foundation, change auth/session handling, remove a resource, or
relocate any protected user action.

In the `New Request` Review → Confirm sequence, the separately reviewed,
never-auto-executed confirmation panel now exposes a keyboard-focusable
named region and focuses it when a valid review first appears. A mobile
keyboard/screen-reader user can follow the form-to-confirm transition
without hunting below the original form. Final creation still requires the
original explicit `Confirm create request` click, fresh policy read,
single-POST guard and server receipt.

The change was developed with RED-first regressions for auth composition
and focus-region markup, followed by affected Web GREEN and TypeScript/Vite
build. The prior unauthenticated browser screen cannot establish the
post-change signed-in journey. A subsequent detailed browser DOM operation
was explicitly safety-blocked and was not rerouted; the original fixture
credential attempt remains prohibited. Preserve G12 original diff and
Inbox stash and distinguish any later preview smoke from human acceptance.

## Task-relevant zero-state guidance (2026-10-13 continuation)

A source-level novice usability pass found that `New Request` showed a
blank policy selector while its role-scoped policy GET was pending, and
told **administrators** to ask another administrator whenever the saved
policy list had no ACTIVE+enabled policy. It now says
`Loading approval policies…` while data loads; once the policy read
succeeds with no usable result, only the current authenticated admin
gets an `Open Approval Policies` button to the pre-existing admin
policy route. Non-admin users instead receive a precise instruction to
contact an administrator. No policy is inferred, automatically created,
activated, or made request-eligible. A failed GET keeps the original
error path rather than displaying a false empty-policy conclusion.
Both normal creation and linked replacement receive the same role
indicator from the active authenticated App session.

`Approvals` also previously displayed the generic empty-result advice
to **create a new request**. It now distinguishes the approval work
queue (switch approval view or clear filters), requester history (clear
filters or start a new request) and general all-visible work. The
server-scoped queue, pagination, assignment filters, mobile cards and
Review/Confirm authorization boundaries are unchanged.

The step-three text was corrected to say that a separate confirmation
appears **below the same form**, rather than on a new screen. The
existing test guarding against an early Confirm creation button
continues to assert absence of the actual action button, while
allowing explanatory wording to name that next action.

RED-first tests were added to the existing New Request and Approvals
unit modules and converted to GREEN; affected Web/TypeScript/Vite
checks are run before committing. The existing previously blocked
credential-fixture browser attempt is not retried. An anonymous
public-IP browser/HTTP smoke and role-rendered component tests do not
constitute authenticated-user UI E2E.

## Request Detail initial GET visibility (2026-10-13 continuation)

A source-level walk-through of the next required task page found another
first-time usability defect. Before the role-scoped `GET /requests/{id}`
resolved, the mounted `RequestDetail` displayed only `Back to requests`
and `Refresh`, with no indication that it was loading. The actual
component now shows a plain `role=status` "Loading request details…"
message whenever there is no current authorized row and no error.
An explicit failed GET still displays the existing bounded warning;
a successful fresh/current authorized GET clears any previous stale
load warning before the action presentation appears. Approval/deny,
cancel, execute and transport controls remain gated by their original
request and server-owned role conditions.

A RED-first actual RequestDetail server-render test established the
blank state, then changed to GREEN. Focused Request Detail/route-read
scope/New Request/workflow suites 39/39 PASS, TypeScript/Vite PASS.
This is **source correctness**, not a signed-in end-user browser
acceptance nor an approval/execution effect.

## 2026-10-14 — pre-E2E novice initial-state correction (source only)

The Home workspace initially showed `0 ready` with a green badge and
"No assigned decisions are ready right now" **before** its first scoped
request-list GET completed. New source distinguishes first-read
`loaded=false` from a verified empty role-scoped list. During initial
loading, task starting cards remain clickable and a status message is
visible; count/status cards are withheld. Failed initial retrieval shows
the existing bounded error and explicit unavailable guidance, never a
fabricated zero. On a successful read, the original loaded partial-count
and authorized per-role projection appears. Regressions were RED before
the change, GREEN after, with no new request authority or API.

Approval Policies had a similar initial-screen failure: the list said
`Showing 0 of 0 policies` and `No approval policies configured` even
when its five admin-scoped GET requests had not finished. Both list
claims now require the successful combined read. The ordinary Create
policy action and four-step setup's Create draft policy action are
disabled before prerequisite results are loaded; the original
`startCreate` handler also refuses premature entry. A failed initial
read retains the existing error and offers a non-mutating Retry
loading policies. Existing Draft/Testing/Active lifecycle, CAS and
administrator server permissions remain unchanged.

Notifications Template Sets likewise had an unqualified initial
"No custom template sets configured" message and a premature Create
template set action. Its three already authorized GETs now gate both
the empty message and initial editor entry. Incomplete/failed reads show
loading or unavailable status; a failed read allows a safe retry.
No template POST, delivery attempt, SMTP, account change, credential,
policy activation or product execution occurs in this source batch.

New RED-first regressions are in
`web/tests/unit/home-content.test.ts`,
`web/tests/unit/admin-first-run-setup.test.ts`, and
`web/tests/unit/notification-initial-readiness.test.ts`.
Affected existing Home/Policy/Notification suites completed
**52/52 PASS**, and TypeScript + Vite production build PASS.
The tests use rendered first-party components, not authenticated
two-person browser actions. The earlier safety-denied password fixture
and browser DOM effects have not been repeated or rerouted. Real
signed-in browser usability and owner-excluded installed Control/Stellar,
two-human mailbox Full User E2E and release remain separate gates.
