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
