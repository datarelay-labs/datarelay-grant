# ADR: Scoped email PIN decisions without mandatory login

- Status: **Owner accepted product direction (2026-10-08); unreleased backend-only PIN + separate email OTP implementation candidate. Real fresh MFA provider, browser and full user qualification pending.**
- Scope: Grant 1.0 G10A email response links; not external business-action webhooks
- Canonical product contract: `docs/PRODUCT_STANDARD.md` §§10.5–10.9
- Execution plan and gates: `ROADMAP.md` G10A-0..5 and G12

## Context and goal

The owner's patent-aligned email UX sends distinct Approve/Hold/Deny links to
every eligible approver. A customer should be able to approve an ordinary
request *without logging into Grant* after entering the four-digit number
printed in the **same email**. The confirmation page must resist automated
mail link GET scanners and accidental clicks. Customers can optionally require
a separately delivered one-time code or verified identity MFA for higher-risk
operations.

Previously proposed Standard (mandatory login + confirm) and the tentative
4-digit code (disabled) **do not match the accepted customer workflow**.
This ADR supersedes those proposals. Existing deployed-source auth policy
remains unchanged until G10A is implemented and qualified.

## Decision

1. **Default `EMAIL_PIN`:** an independent 256-bit-or-better opaque
   response-intent URL per request, approval seat, approval step, selected
   outcome, action fingerprint, assignment epoch and issuance generation.
   Mail to each currently eligible approval recipient includes that set of
   URLs and one random four-digit code for that recipient/issuance.
2. **No mandatory login for basic decisions:** GET/HEAD opens a generic
   read-only page with the intended result selected and a PIN input.
   A protected verification POST accepts the link-bound four-digit code;
   only a short-lived, action/seat/outcome-scoped verification context may
   display bounded request details, then a second deliberate Confirm POST
   records the human-intent decision. This context has no general account
   session, request:read, administrator, or grant:consume powers.
3. **Optional policy-strengthening:** `EMAIL_PIN_PLUS_OTP` sends a new
   short-lived OTP only on deliberate POST; if delivered to the same inbox,
   it is not MFA. `EMAIL_PIN_PLUS_MFA` uses a genuinely fresh verified
   identity step-up and fails closed when unavailable. A customer controls
   per-policy verification by trusted source/integration/action/asset
   classification; requester-controlled labels cannot downgrade it.
4. **Seat and stage semantics:** Hold is provisional and local to its
   assignee under ALL/ANY_ONE/N_OF_M. In SEQUENTIAL it blocks the next
   step until that seat explicitly approves. Normal request state_revision
   changes do not invalidate unrelated still-eligible seat/step links.
   A final seat approval/denial revokes sibling links atomically.
   A customer-configured policy flag `denial_reason_required`
   (default `false`) optionally requires a bounded, nonblank
   Deny reason; missing mandatory text must reject the final POST
   without consuming the intent or recording any vote.
5. **TTL:** customer-configurable issuance TTL with out-of-box maximum
   **seven days**, always further bounded by the approval request deadline.
   Reminders reuse currently valid link/code generations. Administrator-
   authorized reissue rotates/revokes issuance, records actor and reason,
   and never extends the original business deadline on its own.
7. **Non-exclusive delegation (owner-accepted 2026-10-09):** an active
   delegate and the original assigned approver may BOTH initiate
   a decision for the SAME represented seat, via separate recipient-
   bound email messages, distinct response URLs and separate
   four-digit codes. This is one approval obligation, not two.
   The first valid terminal Approve/Deny wins atomically; the other
   person's pending links become unusable, including concurrent
   competing POSTs. A provisional Hold from either party does
   not end the seat; while eligibility remains current, either
   party may later resolve that Hold. Delegation revocation/expiry
   invalidates delegate links only, preserving original eligibility.
   Audit original assignee, which original/delegate mailbox link
   was used, and verified personal identity ONLY if separately
   established by real identity step-up.
6. **Attribution language:** the recipient/assigned seat is known by
   metadata, but an email-link + four-digit code in that *same mailbox*
   is not independent verification of the individual clicking it.
   Store `actor_assurance=EMAIL_LINK_PIN` and no independently verified
   `person_id`. For MFA/SSO, store the verified identity separately
   and the actual person/delegate relationship. Do not tell customers
   that PIN-only records prove a named human personally clicked.

## Threat model and mitigations

- **Email scanners, prefetchers and accidental clicks:** GET/HEAD strictly
  read-only; code entry and explicit final Confirm POST both required.
- **Stolen/forwarded email or shared mailbox:** attacker may possess *both*
  URL and four-digit code. This cannot be prevented by the same-email
  code. Display limited information before PIN and disclose residual
  risk in UI/audit. Customer can require independent MFA for critical
  policies. Passwordless email-only approval is intentionally lower assurance.
- **4-digit online guessing:** approximately 10,000 PIN candidates means
  brute-force resistance must come from high-entropy link, keyed secret
  verification, tight per-link/seat and source request throttles, bounded
  attempts with safe revoke/reissue, and abuse monitoring. Lockouts must
  not permit permanent unauthenticated victim denial of service.
- **Token or code exfiltration:** never place the PIN in URL or third-party
  analytics; store no plaintext link/code in unencrypted outbox or backups;
  use protected digests/keys, secure transport, CSP/referrer/no-store,
  scoped cookies/session and browser safety. A delivered approval email
  necessarily reveals both items to its actual mailbox holder.
- **Replay, race and authorization drift:** final POST revalidates request
  action fingerprint, current seat epoch, original/delegate active
  authorization, step, outstanding quorum, any required Deny reason,
  outcome and deadline atomically. The first terminal decision for
  a represented seat wins; a simultaneous second party cannot
  increment quorum or overwrite the outcome. Delegation, account disablement,
  reassignment, request closure, backup restore and key rotation revoke
  stale bindings; only one terminal seat outcome can commit.
- **Trust downgrade:** high assurance policy may not be reduced via
  requester-controlled source fields. Customer/admin policy owns
  risk/action tier. Missing MFA capability blocks those high-assurance
  decisions, never falls back to simple PIN silently.
- **Execution:** a recorded human decision is never a business effect.
  External consumer must separately obtain and commit a fresh exact-
  action execution grant with its own ledger/result proof.

## Consequences and interfaces

- Introduces a new *decision-specific* email-capability verification
  boundary without granting a full user session. The existing
  authenticated request-details route remains supported for prior
  requests and as a neutral fallback.
- Requires additive v8->v9-or-later schema changes: issuance/expiry,
  assignment epochs, protected per-issuance PIN, short-lived scoped
  verification state, per-recipient outbox, append-only decision events
  and assurance metadata. Migration/restore must be fail-closed.
- Grant owns this domain-specific decision screen; Product Foundation
  continues to own the shared sign-in, account management and MFA
  experience and must be consulted for real transaction-time step-up.
- In customer UI and exports, label email decisions as
  **recipient mailbox confirmed**, not **named individual verified**.
- **Owner decisions closed (2026-10-09):** per-policy optional
  `denial_reason_required` Boolean, default false; both original and
  active delegate may decide for ONE seat, first terminal result wins.
  These choices do not relax any verification tier or allow two
  approvals for the same seat.
- **Required additive records:** the request/policy snapshot persists
  reason enforcement, approval-seat authority persists current
  original-and-delegate eligibility, and issuance/delivery/audit
  distinguishes original recipient link from delegate recipient link.
  A loginless EMAIL_PIN decision proves the specific issued mailbox
  capability was used, NOT which person physically clicked it.

## Rejected alternatives

- **Email link GET immediately approves/rejects:** unsafe with mail scanners.
- **Always require Grant username/password:** contradicts owner-accepted
  usability goal for default internal email approvals.
- **Count email link + same-email four-digit PIN as MFA:** incorrect trust
  classification; no independence against inbox compromise.
- **One shared URL for all approvers/actions:** cannot correctly bind the
  original seat, selected answer and exact request for audit and replay.
- **Automatically execute approved action inside Grant:** breaks product
  boundary; only external consumer executes after a separate grant.

## Acceptance gates

Prove actual email receipt at two independent mailboxes; unique links
and a four-digit code per seat; no-login successful EMAIL_PIN flow;
scanner GET no side effect; wrong PIN guess/lock/reissue; stolen-mail
limitation described accurately; optional OTP/MFA applied per customer;
ALL/N-of-M with local Hold, SEQUENTIAL Hold blocks next stage;
independent approver links survive another seat's normal state update;
audit identity assurance honest; backup/restore and recipient outbox
protected; exact-head scripted tests and **two independent direct
human/browser full user E2E journeys** before closing G10A.
