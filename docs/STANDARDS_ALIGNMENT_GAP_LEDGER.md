# Grant standards alignment — evidence-first gap ledger

Status: preliminary source inspection, NOT product certification or E2E acceptance. Baseline: `b2d046938cbfd3e5ff37975b1594538d08e5e71d` (2026-10-18). This is a queued standards workstream; the active F31 Full User E2E packet remains the exclusive execution gate. No external callback, SMTP, production or release is authorized here.

## Owner decision / assurance

Low-assurance email-link plus four-digit PIN remains supported by design; do not represent same-mailbox PIN/OTP as independent MFA. Six-digit PIN is a possible configurable strengthening, not an approved mandatory replacement. Preserve per-integration policy floors and independent fresh TOTP for higher-assurance actions.

## Source-to-standard crosswalk

| Area | Reference | Source evidence | Finding / next acceptance gate |
| --- | --- | --- | --- |
| Explicit human decision, workflow ordering and delegation | OMG BPMN 2.0.2 / DMN / CMMN concepts; NIST SP 800-53 AC-5 | `grant/decision_links.py` `_active`, `confirm`; `grant/verification_policy.py` | Existing safeguards; independently test parallel quorum, delegation races, step transitions and denial; no OMG interchange conformance claimed. |
| PIN and step-up | NIST SP 800-63B-4; OWASP ASVS / Transaction Authorization | `grant/decision_links.py` `MAX_PIN_FAILURES=5`, scoped token, expiration, rate limits; `grant/verification_policy.py` | 4-digit explicitly low assurance; verify scanner-safe GET, PIN entropy/lockout, independent MFA and real-persona flow. |
| Execution binding | OWASP Transaction Authorization; NIST AC-3 | `grant/consumer_guard.py`, `grant/core.py`, action hash, consume/report | Source binding present; verify cross-process replay, revision races and external readback separately. |
| Legacy webhook | CloudEvents 1.0.2 | `grant/core.py` `_event`; `grant/transport.py` `send_webhook` | Native schema_version=1, event_id, event_type, occurred_at, state_revision, action_hash. NOT CloudEvents envelope. Preserve legacy consumers. |
| Webhook signing | RFC 9421 / RFC 9530 | `grant/transport.py`: HMAC over timestamp + dot + body, `X-Grant-Signature` | Custom HMAC, NOT RFC 9421. Test signed delivery/retry and determine versioned opt-in standard signature separately. |
| HTTP API contract | OpenAPI; RFC 9457 | `grant/admin.py` admin-only `/api/v1/openapi.json`; `grant/app.py` error handlers | Existing `error.code/category` JSON, NOT `application/problem+json`; use opt-in/versioned negotiation only with consumer regression coverage. |
| Audit evidence | ISO/IEC 27001/27002 mapping, W3C PROV concepts | `grant/audit_evidence.py`, `grant/admin.py` audit search/export/chain | Implemented evidence interfaces; test redaction, role isolation, retention and provenance before claiming coverage. |

## STD-04 safe migration contract (proposed, NOT implemented)

1. Preserve default `application/json` legacy webhook payload and all current HMAC headers exactly; existing receivers must remain byte-compatible.
2. Introduce CloudEvents only as an explicitly configured per-integration option in a future separately tested migration, with `specversion=1.0`, stable `id`, `source`, `type`, RFC3339 UTC `time`, `datacontenttype=application/json`, and original payload nested under `data`. Validate event identity and signature against the actual transmitted bytes.
3. Reject unrecognized event-format options. No implicit conversion or consumer auto-upgrade. Add contract tests for legacy equality, CloudEvents envelope, signature verification, retries, duplicates, stale revisions and cross-tenant rejection.
4. RFC 9457 must likewise be opt-in or versioned; retain legacy error JSON for current clients. Test validation and authorization errors with both formats.
5. Do not treat callback HTTP 2xx as protected action execution success; use explicit consume/report and external readback gates.

## Evidence / disposition

- `tests/test_client_response_contract.py`: 54 PASS, previous run.
- `tests/test_integration_diagnostics.py`: 11 PASS, previous run.
- `tests/test_mock_stellar_flow.py`: 4 PASS, most recent run (exit 0, 2026-10-18).
- `tests/test_g10a_fresh_mfa.py`: 6 PASS (exit 0, 2026-10-18).
- `tests/test_consumer_guard.py` + `tests/test_multi_approval.py` + `tests/test_g10a_email_decisions.py`: 102 PASS (exit 0, 2026-10-18); covers existing authorization binding and multi-approval/email decisions, NOT live user acceptance.
- `tests/test_audit_evidence.py` + `tests/test_g10a_audit_evidence.py`: 17 PASS (exit 0, 2026-10-18); existing audit/provenance/redaction tests, NOT a certification or complete retention/privacy assessment.
- No CloudEvents or RFC 9457 implementation/qualification claimed.
- G12 intentional dirty test and untracked `e2e-reports/` remain untouched.

Next: complete active F31 genuine Full User E2E where legitimate independent browser/mailbox authority exists. Then implement STD-04 behind explicit compatibility opt-in and rerun affected tests, exact-head CI and integration acceptance. No release/merge/production without authorization.
