# G11 DataRelay and Stellar external acceptance

Observed 2026-10-08 by read-only inspection. This document is an acceptance
readiness ledger, not an external integration PASS. Authority: Grant 1.0
Product Standard, Roadmap G11, Integration Contract, Full User E2E.

## 2026-10-10 current integrated pure G11 evidence checks (Work Packet #98)

The current G10A integrated candidate now includes the reviewed G11 pure,
**non-executing** security checks from the older Draft PR #53. Trusted
product configuration must supply the expected Grant integration ID, and the
current request must match it. The normalized Control replay readback must
match **both required**, product-trusted positive Route and Destination IDs,
rather than accepting the result's own claimed IDs. An absent Control stream
checkpoint row may legitimately yield an empty unchanged checkpoint.
Stellar normalized evidence must match the original tenant, case, **alert**
and outcome **state revision**; malformed identifiers and ASCII controls fail
closed. The helper never sends a request, starts or replays a Control action,
nor authenticates the receiver; positive results remain explicitly
independently_verified=false and require separate actual product readback.

These are only development candidate source guarantees and deterministic test
evidence. No Grant integration uses these helpers as a mounted real Control
or Stellar effect path, and neither M3 nor M4 has passed external acceptance.
The older phase-1 observations below are preserved as historical source
evidence, not today's installed product-build identity.

## 2026-10-09 phase 1: source and safe API contract verification

**Scope:** Grant and Control development sources and read-only service health.
No actual Control replay POST, destination send, customer email, credential
exchange or product database change was performed.

- Grant integrated candidate baseline `c0a54db2434d9780b6e451b016fa60c33a7efc4e`
  was clean and synchronized before the work. Existing pure Guard contract:
  `tests/test_consumer_guard.py` **29/29 PASS** before extension.
- Control running service `http://127.0.0.1:8000/health` returned **HTTP 200**
  with `build_identity.git_sha=fc89dadcb01a262ef7881a6bca94dd4989a8b496`,
  `git_dirty=false`, equal live/build digests and Route Processing enabled.
  This is **service health only**, not approval-path acceptance. The running
  Control development tree is clean at that SHA; GitHub `main-v2` was
  separately observed at `b45ad9d37079a822ede0349fe0f1b00f01b38ce5`.
  Those are **different builds**, not a frozen two-product candidate.
- On the running Control source, imported Pydantic
  `DeliveryLogReplayRequest` has exactly one field `dry_run`, whose default
  is **false**. `DeliveryLogReplayResponse` includes `log_id`, `dry_run`,
  `outcome` (`dry_run_ok`/`delivered`/`failed`), `event_count`,
  `route_id`, `destination_id`, `stream_id`, `replay_run_id`, preview and
  bounded error fields. The current GitHub `main-v2` router confirms
  `POST /api/v1/runtime/replay/delivery-log/{log_id}` and the same models.
  A live GET of `/openapi.json` timed out, so **live OpenAPI parity is NOT
  confirmed**.
- Control's existing router and service write replay stage records and
  operator audit for **both** `dry_run=true` and `dry_run=false`; only the
  former avoids the destination send. Therefore even a dry-run POST was
  withheld in this source-only/read-only phase.
- Control `main-v2` currently calls its destination adapter's `send`
  without a Grant consume claim, exact action binding or product-side
  idempotency ledger in that path. Its canonical
  `tests/test_replay_hardening_m11_1.py` includes
  `test_delivery_log_replay_allows_duplicate_send_without_row_lock`, which
  explicitly expects **two** mocked destination sends for duplicate legacy
  replay calls. That existing behavior is **not safe as a protected
  approval-controlled execution endpoint** without Control-owned gating.
- The Grant pure receipt checker now optionally binds both the expected
  Control route ID and destination ID to the returned values (strict positive
  integers, rejecting `bool`, wrong, absent, swapped or partial IDs).
  Returning a matching candidate record **never asserts independent effect
  verification**. Positive claims still require a product atomic effect lock.

**Phase 1 verdict:** read-only health **PASS**; source schema and mock/local
pure contract verification **PASS**; API availability for actual protected
business effects **NOT VALIDATED**; G11 M3 real integration **WAITING**.
Do not replace actual Control destination/ledger readback with this evidence.

**Phase 2 prerequisite:** In a separate explicitly scoped Control development
worktree, add an opt-in, product-owned Grant consume guard with a durable
exact-operation effect ledger at the chosen replay boundary. A missing/denied,
held, expired, mismatched or replayed claim must never reach
`DestinationAdapter.send`; ambiguous post-send outcomes must reconcile the
product ledger before another send. Validate against a **disposable** replay
log and non-production destination, with an observed effect count of exactly
one and stable Control checkpoint. Do not retrofit a bypass-prone alternate
route or change the existing production route before the bounded design is
accepted. Once implemented, verify Control and Grant on the *same* source
candidate with independent external effect readback, not just mocked tests.

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
   The candidate action kind datarelay.control.delivery_log.replay is a design
   proposal, not a live configured/accepted policy.
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

The pure helper grant.consumer_guard validates bindings and distinguishes a
fresh claim from an already-consumed/replayed claim. It NEVER runs product
actions, changes external product state, writes a business effect ledger or
turns a local test into independently observed acceptance.

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
capabilities, approved responder and receiver configuration, original case and
tenant binding, received APPROVED/DENIED/HELD/EXPIRED outcome events by immutable
Grant request/event ID, receiver deduplication, and explicit exclusion of Grant
outcome and connection-test events from any approval-trigger rule. Verify
actual receiver readback, not just callback HTTP acceptance.

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
