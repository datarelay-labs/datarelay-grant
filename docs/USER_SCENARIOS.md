# R1 user scenarios and evidence boundary

Read this complete contract before browser/final confirmation. Tests must interact
with actual Grant pages and real authentication. Do not replace user journeys with
mocked API state or a claimed PASS. Fixture transports are real loopback SMTP/HTTP,
not real DataRelay or Stellar installations. That distinction is mandatory.

## Preparation and same-candidate rule

Commit the reviewed candidate, record HEAD and source tree, install locked dependencies,
and build the exact Foundation-backed web app. Run `bash scripts/checks.sh browser`.
The Playwright fixture provisions disposable admin, requester, approver and unrelated
member accounts with random credentials, a temporary DB and loopback receivers.
Never use production credentials or a real customer's system for this fixture.
All pages use the built web app and real product API. Browser errors fail the test.

## Shared login, shell and task-oriented navigation

Before domain workflow confirmation, verify the shared user frame in a real browser:

1. Sign-in is centered using the DataRelay-family Foundation composition, with Grant
   identity/context separated from the bounded credential card.
2. The credential card shows the common DataRelay welcome/sign-in framing, password
   visibility behavior and administrator-managed-account guidance. MFA/recovery remains
   in the same shared auth frame.
3. After sign-in, desktop navigation is grouped into Home, Work, Configuration and
   Administration goals; Account & Security and sign-out are associated with the
   signed-in user rather than consuming primary navigation space.
4. Collapse and expand the desktop sidebar and verify the mobile off-canvas navigation.
   Focus, labels and the active route remain understandable in each state.
5. Home behaves as an action center: work needing a decision and exceptions/recent work
   are primary. It must not become a chart-first NOC/SOC dashboard.
6. Requests/My approvals are scan-oriented work surfaces. Approval Policies and
   Notifications enter focused list/detail flows rather than one permanently expanded
   settings canvas.

These checks validate shared presentation only. Grant server-side authorization and
approval/execution authority remain independently verified by the domain scenarios below.

## Two independent complete passes

Perform each pass with NEW isolated browser contexts and separate sign-ins:

1. Requester opens Requests, signs in and chooses New request. Select the configured
   profile, enter target, title and reason, and submit. The detail shows the exact
   immutable action, fingerprint, pending decision, separate delivery/execution.
2. Confirm the SMTP fixture actually received the request link. An email GET must not
   approve. An unrelated signed-in member opening that link receives REQUEST NOT FOUND.
3. Assigned approver opens the request, chooses Hold and confirms. Consumer HTTP
   commitment must fail while held. The original deadline must not be extended.
4. Approver selects Approve. Before confirmation the request must still be held.
   Confirm approved. The HTTP receiver must receive the correlated APPROVED event.
   Delivery acceptance must not become execution success.
5. The disposable consumer calls the real consume endpoint with the actual expected
   action hash and stable execution ID. First commitment is fresh; identical retry
   is a replay and does not mean execute again. Report a fixture-only result and
   refresh the UI. It must label that result as reported, not independently verified.
6. On separate requests, confirm Deny in the UI and verify no commitment. Verify
   cancellation also blocks commitment. Fresh API creation is allowed for consumer
   interface setup/assertions; human decisions must use the actual approval UI.
7. Capture the resulting UI and assert no browser runtime errors. Close all contexts
   and repeat the complete journey with new independent sign-ins and request IDs.

## Request replacement through the UI

The requester creates a new request in the UI, cancels and explicitly confirms it.
Choose Create replacement request; confirm the cancelled predecessor is identified.
Change the target and submit with a new external ID. Detail must link to the old
request; the new action requires a new approval and cannot inherit old authorization.
An uncancelled predecessor, cross-source predecessor or changed action on a committed
request must not bypass the server's immutable-action contract.

## Administrative configuration and credential lifecycle

An administrator signs in through the normal login screen. System administration
shows actual accounts, health and audit through Foundation adapters. Create a
separate disposable account through the UI; never assume mock account creation.
Configure a DataRelay fixture integration against the registered receiver and test
its connection. In Notifications, create a complete bounded event template set, preview
the rendered requested message, and send a non-authorizing test notification while
keeping transport acceptance distinct from inbox receipt. In Approval Policies, create
a single-approver Draft for a fixed action kind, select the notification template set,
move it to Testing, run an isolated non-executing test, explicitly Activate it and inspect
version/change history. Confirm policy/template/branding edits apply only to new request
snapshots; saving a policy alone must never make it live.
Issue a scoped credential through the UI, inspect metadata without raw secret/hash
exposure, request revocation and confirm it. Verify the revoked credential cannot
read requests. Revocation cancellation must leave it usable. A requester/member
cannot invoke administrator-only management routes or decide another person's request.

## Mobile and shared security surfaces

At a 390-by-844 viewport, sign in, view live administration, integrations, and
individual session/MFA controls. No horizontal document overflow or missing controls.
Foundation components must use Grant adapters; unsupported TLS/upgrade controls must
not masquerade as working operations. Test email/connection messages state acceptance,
not final receipt or business execution. Do not put raw credentials in screenshots.

## API/operational confirmations

Run the product tests for wrong user/source, self-approval, idempotency conflict,
changed action, expired approval, cancellation-vs-consume races, revoked credentials,
MFA/session termination, oversized/duplicate JSON, configured destinations, no redirect,
retry event identity, stale queued outcomes, restart lease recovery and bounded reminders.
Run real CLI initialization and schema-version checks. Back up and restore into NEW
paths; delivery/consume remain paused, sessions clear, restored open requests are
invalidated on acknowledged resume, and uncertain commitments become UNKNOWN.

## External acceptance (cannot be replaced by the above)

R1-M3: one real DataRelay product must submit its actual operation, block execution
without a fresh valid commitment, execute through its existing operation path, and
report its actual result. Include hold/deny/expiry and duplicate-effect checks.
R1-M4: record deployed Stellar version, actual outgoing configuration and actual
receiver path. Find correlated approved/denied events in that receiver, verify tenant
binding and feedback-loop exclusion. An echo receiver is insufficient.
SMTP: confirm a real designated user's inbox received the message.
R1-M5: repeat applicable journeys and recovery on one frozen candidate, record
external evidence, hashes and CI. Owner acceptance/publication remain separate.
No missing external evidence is converted into a success by this scenario document.
