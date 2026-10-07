# R1 integration contract

Grant is an approval authority, not a workflow runner. R1 accepts the same bounded
JSON request for DataRelay and Stellar; presets are example payloads, not an arbitrary
mapping language. Wire schema is available to an administrator at
`GET /api/v1/openapi.json`. The examples use placeholders, never credentials.

## Configure once

An administrator registers a DataRelay or Stellar integration with an installation-
approved exact callback URL. Secrets in callback headers/HMAC material are encrypted
and excluded from response projections. A profile fixes the integration, action kind,
assigned human, deadline, reminder policy and execution validity. Requests cannot
override the destination or approver. A Stellar integration requires a fixed tenant;
request `source.tenant_id` must match. Use one integration per trusted tenant/source.

Credentials use `Authorization: Bearer <token>`. Give request producers only
`request:create` and, when needed, `request:read`; give the existing executor separate
`request:read`, `grant:consume`, `result:write` credentials. These are integration
scopes, not authority to make a human decision. Identifiers/scopes can be listed and
credentials revoked without exposing their raw value again.

## Request and decision

`POST /api/v1/requests` persists a request and returns HTTP 202 with a stable request
ID, action fingerprint, revision and initial state. It never keeps a connection open
waiting for approval. `external_id` must be stable for retries within an integration.
A repeated identical submission returns the original request; changed content or
requester identity using that ID returns conflict. Do not use a random ID on retries.

```json
{
  "external_id": "existing-system-operation-id",
  "profile_id": "configured-profile-uuid",
  "title": "Approve a bounded operation",
  "action": {"kind": "configured.action.kind", "target": "exact-target", "parameters": {}},
  "source": {"case_id": "original-case-reference"},
  "reason": "The exact purpose and expected impact"
}
```

Action JSON is immutable. Floating-point values, unsafe integers, oversized/deep
JSON and obvious credential field names are rejected. Use secret references rather
than values. The fingerprint is SHA256 over UTF-8 JSON using sorted keys, compact
separators and non-ASCII characters unescaped. Use the provided Python client to
avoid cross-language canonicalization disagreements. Hash the actual action the
consumer will execute; never blindly trust a hash copied from an outcome event.

Humans authenticate through the product UI and choose approve/hold/deny, followed by
explicit confirmation. Email GETs cannot decide. The server enforces assignee, current
session, self-approval and revision rules. Hold is not approval and cannot extend the
absolute deadline. To change an action, cancel the uncommitted old request and create
a new request with its `predecessor_id`. An already committed action cannot be undone
by cancelling its request.

## Outcome delivery

Grant POSTs `grant.approval.outcome` JSON with schema_version, stable event_id,
state_revision, request_id, external_id, source, state, decision, decision_actor,
decision_at, action_hash, grant_until, execution_state, reason and request_url.
Times are UTC Unix seconds. A retained APPROVED human decision on a CANCELLED or
EXPIRED request is history, not current execution authority. Inspect current state.

Delivery is at-least-once with bounded backoff. Persist event IDs and highest request
revision at the receiver. The same event ID is retained on retries and manual resend.
A 2xx reply means accepted notification, never successful business execution. Grant
suppresses queued outcomes whose state has changed, but an already in-flight event
may still arrive late. Revalidate current state before committing an operation.

Optional signature headers:

```text
X-Grant-Event-Id: <stable event UUID>
X-Grant-Timestamp: <UTC Unix seconds for this delivery attempt>
X-Grant-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + raw_body)>
```

`grant.client.verify_outcome` checks signature, timestamp and event identity. It does
not perform deduplication, business approval or execution authorization. Use bounded
receiver bodies and protect/rotate keys through approved administrative procedures.
Configured static authentication headers are available when a vendor cannot verify
HMAC. Redirects and environment-proxy routing are not followed.

## DataRelay execution boundary

Use `GET /api/v1/requests/{id}` for current state. Immediately before a protected
operation, the existing product calls `POST /api/v1/requests/{id}/consume` with its
own durable `execution_id` and the actual expected action_hash. A fresh valid
commitment returns `committed: true, replay: false`. Retry with the same ID returns
`replay: true`; reconcile the product's ledger, DO NOT execute again. A different ID,
changed action, held/denied/cancelled/expired request or recovery pause cannot obtain
a fresh commitment. Unavailable Grant fails closed. Keep the product's own permissions.

After commitment, the product executes through its existing tested operation path.
POST `/api/v1/requests/{id}/result` using the same execution binding and status
RUNNING, REPORTED_SUCCEEDED, REPORTED_FAILED or UNKNOWN, with a bounded evidence
reference. Terminal reports cannot be silently replaced. UNKNOWN requires inspecting
the real system, not blind retry. Reported success is not independent verification.

The bundled client only sends API requests. There is intentionally no callback that
executes arbitrary user code and no generic Runner. Tests with a fixture consumer
are contract evidence, not completion of R1-M3. That milestone requires one real
DataRelay product to enforce this contract at its actual execution boundary.

## Stellar Cyber configuration and acceptance

Candidate outgoing path: Universal Webhook Responder, custom POST to Grant
`/api/v1/requests`, JSON content and Authorization bearer header. Configure the
rendered payload to match `examples/stellar-request.json`, with the fixed profile
and tenant and deployment-supported event fields. In the consulted 7.0.xs docs,
placeholders reference fields directly, without `_source.` or iteration tags.
Use a stable source operation/event identity for deduplication.

The return URL must be an actual supported receiver, not the outgoing responder.
The consulted XDR Connect documentation describes limited-availability JSON ingestion
with an installation-generated webhook URL and Authorization bearer token. Availability,
permissions, normalization and exact URL must be checked on the deployed version.
Ingestion does not prove an earlier automation will resume. Do not invent a receiver.

Locate the returned event by Grant request/event ID and original case/tenant reference.
Exclude Grant outcome and connection-test events from approval-request trigger rules.
Verify approved, denied and held outcomes, duplicate deliveries and tenant rejection.
No external execution report means NOT_STARTED/result unreported, not success.

Official references consulted (deployed-version verification remains mandatory):
- https://docs.stellarcyber.ai/7.0.xs/Configure/Connectors/Universal-Webhook-Connectors.htm
- https://docs.stellarcyber.ai/7.0.xs/Configure/Connectors/XDR-Connector.htm

Actual SMTP receipt, actual DataRelay operation evidence and actual Stellar receiver
lookup are external acceptance prerequisites. A successful mock or echo receiver is
never labeled as satisfying those prerequisites.
