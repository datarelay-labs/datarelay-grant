# G11 DataRelay and Stellar external acceptance

Observed 2026-10-08 by read-only inspection. This document is an acceptance
readiness ledger, not an external integration PASS. Authority: Grant 1.0
Product Standard, Roadmap G11, Integration Contract, Full User E2E.

## DataRelay Control: representative product-owned operation

The online dev-drcontrol development host was queried read-only. HTTPS /health
returned HTTP 200 with git HEAD fc89dadcb01a262ef7881a6bca94dd4989a8b496,
git_dirty=false and matching live/build source digests.

A real existing Control operation is manual replay of a failed delivery log:
- Product router: app/runtime/router.py, POST /runtime/replay/delivery-log/{log_id},
  under the configured API prefix (default /api/v1).
- Product handler: app/runtime/replay_service.py::replay_delivery_log.
- Request: DeliveryLogReplayRequest(dry_run=false for actual delivery).
- Response: log_id, dry_run, outcome, event_count, replay_run_id and route IDs.
- In the current inspected path, Control calls its own destination adapter and
  records replay stages without a Grant request/decision/consume/result guard.
- Replay may transmit data to a real destination. NO replay POST was made.
  No Control worktree, service state, credentials or product data were modified.

**M3 status: WAITING_INTEGRATION.** Health 200 and the presence of a replay API
do not prove a Grant-controlled product execution boundary.

### Product-owned integration proposal (not yet implemented in Control)

1. Before invoking its existing replay operation, Control atomically reserves
   a stable product operation key and execution ID in its own durable ledger,
   binding failed delivery log, route and destination.
2. A Grant producer creates a bounded human approval request with the same
   stable external operation identity and an immutable full action fingerprint.
   The Control G11 **isolated pilot** uses the candidate action
   `{"kind":"datarelay.control.delivery_log.replay","target":"delivery-log/<log_id>","parameters":{"log_id":<id>,"route_id":<id>,"destination_id":<id>}}`.
   This is a tested synthetic binding, **not** a live installed policy.
3. Hold, denial, expiry and Grant outage block product delivery. Callback
   transport success, an email GET or free-form reasoning is not approval.
4. After explicit human approval, the product executor rereads current Grant
   state and consumes with its durable execution ID and *actual* action hash.
   A fresh claim does not replace the product-side atomic effect lock.
5. A repeated claim, crash ambiguity or recorded product effect requires
   ledger reconciliation, NEVER a second external destination send.
6. The product must read back the actual replay stage, replay_run_id, durable
   effect ledger, destination evidence and unchanged checkpoint, and report
   a bounded result to Grant on the same request/execution/action hash.
7. Validate one actual successful effect; hold, deny, expiry, different action
   and token revocation failures; replay with zero additional product effects;
   crash-window uncertainty; and same-build auditing.

The pure helper `grant.consumer_guard.check_product_claim` requires the
product-trusted `expected_integration_id` and compares it strictly to
the current authenticated Grant request's `integration_id`, in addition
to the action fingerprint, consumed execution ID and durable product
reservation. The expected integration ID must come from independently
verified product configuration; copying it from a request or callback would
defeat this trust boundary. Missing, mismatched or ill-formed identifiers
fail closed, not to a product effect attempt. This helper distinguishes
a fresh claim from an already-consumed/replayed claim, but NEVER runs
product actions, changes external product state, writes a business effect
ledger or turns a local test into independently observed acceptance.

### Required actual M3 evidence (none asserted as PASS)

- Exact deployed Grant and Control build identities and disposable operation
  scope, stable request/external ID, policy snapshot, bound action fingerprint.
- Source-side attempts refused before approval and under hold, denial, expiry.
- One fresh product-side delivery effect with its product durable execution ID,
  replay_run_id, destination observation and checkpoint readback.
- A repeated claim and crash/uncertainty recovery with NO duplicate effect.
- Product-authored result plus Grant request/decision/consume/result correlation
  on one frozen candidate, independently observed outside the Grant fixture.

## Stellar Cyber external receiver

A candidate outbound path is Universal Webhook Responder, with a stable tenant,
original case and alert reference and Grant request ID. An outgoing responder
is NOT an inbound receiver. A supported and authenticated XDR Connect receiving
integration must be verified on the actual deployed Stellar version.

**M4 status: WAITING_EXTERNAL_RECEIVER.** No deployed Stellar version, approved
tenant-scoped auth, supported receiver endpoint or actual correlated XDR record
was available here. No customer/production Stellar connection was invoked.

To close M4, record the installed version and supported outgoing/incoming
capabilities, approved responder and receiver configuration, original case,
alert and tenant binding, received APPROVED/DENIED/HELD/EXPIRED outcome events
by immutable Grant request/event ID AND its exact positive state revision,
receiver deduplication, and explicit exclusion of Grant outcome and
connection-test events from any approval-trigger rule. Grant's unmounted pure
normalized readback checker rejects missing/wrong alert IDs and mismatched
event state revisions, including booleans in place of integers. Source and
receiver record identifiers cannot contain control characters. Vendor
payloads need a separately verified deployed-version mapping into these
normalized fields; no particular Stellar payload keys are invented here.
A matching tuple remains only a candidate pending independently verified
receiver readback, not M4 PASS or approval authority.

## Owner-controlled gates / responsibilities

- DataRelay Control owner: install a product-owned consume guard at the existing
  replay operation, durable side-effect ledger and disposable test destination.
- Stellar installation owner: provide deployed version and an authenticated
  supported receiver with tenant/case normalization and loop exclusion.
- Grant installation owner: approved private Foundation Contents:read CI access.
- Product owner: same-candidate Full User E2E, external readback, candidate freeze,
  owner acceptance and separate release/tag/publication authorization.

No real M3/M4 completion is inferred from source inspection, local contract
tests, a mock callback, an email receipt or this document. Independent G12
pre-release checks may continue without compromising these gates.
