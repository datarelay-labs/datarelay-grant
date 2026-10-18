# Grant standards alignment — evidence-first gap ledger

Status: code-to-standard crosswalk with implemented **STD-04 opt-in** contract (2026-10-18). Original F31 deployed product remains `b2d046938cbfd3e5ff37975b1594538d08e5e71d`; new source is a separate candidate, **not deployed**. The owner's current explicit instruction advances remaining source work ahead of blocked Full User E2E. No external callback, SMTP, production or release effects authorized. No certification or live user acceptance claimed.

## Owner decision / assurance

Low-assurance email-link plus four-digit PIN remains supported by design; do not represent same-mailbox PIN/OTP as independent MFA. Six-digit PIN is a possible configurable strengthening, not an approved mandatory replacement. Preserve per-integration policy floors and independent fresh TOTP for higher-assurance actions.

## Source-to-standard crosswalk

| Area | Reference | Source evidence | Finding / next acceptance gate |
| --- | --- | --- | --- |
| Explicit human decision, workflow ordering and delegation | OMG BPMN 2.0.2 / DMN / CMMN concepts; NIST SP 800-53 AC-5 | `grant/decision_links.py` `_active`, `confirm`; `grant/verification_policy.py` | Existing safeguards; independently test parallel quorum, delegation races, step transitions and denial; no OMG interchange conformance claimed. |
| PIN and step-up | NIST SP 800-63B-4; OWASP ASVS / Transaction Authorization | `grant/decision_links.py` `MAX_PIN_FAILURES=5`, scoped token, expiration, rate limits; `grant/verification_policy.py` | SOURCE IMPLEMENTED STD-03 operator-selectable 4/6 digits, legacy defaults/issued digest unchanged and server-trusted issuance length. Both remain low assurance, fresh independent MFA policy separate. Live persona/received-mail gate NOT PASS. |
| Execution binding | OWASP Transaction Authorization; NIST AC-3 | `grant/consumer_guard.py`, `grant/core.py`, action hash, consume/report | Source binding present; verify cross-process replay, revision races and external readback separately. |
| Legacy + structured event delivery | CloudEvents 1.0.2 | `grant/core.py` `create_integration`; `grant/transport.py` `webhook_wire_payload` | IMPLEMENTED opt-in structured envelope with frozen encrypted event source and signed transmitted bytes; existing legacy receivers and queued events preserve original default. Tests remain supporting, not external acceptance. |
| Webhook signing | RFC 9421 / RFC 9530 | `grant/transport.py`: HMAC over timestamp + dot + body, `X-Grant-Signature` | Custom HMAC, NOT RFC 9421. Test signed delivery/retry and determine versioned opt-in standard signature separately. |
| HTTP API contract | OpenAPI; RFC 9457 | `grant/admin.py` admin-only `/api/v1/openapi.json`; `grant/app.py` error handlers | IMPLEMENTED explicit `Accept: application/problem+json` opt-in with `type/title/status` and bounded code/category/fields; legacy remains default. |
| Audit evidence | ISO/IEC 27001/27002 mapping, W3C PROV concepts | `grant/audit_evidence.py`, `grant/admin.py` audit search/export/chain | Implemented evidence interfaces; test redaction, role isolation, retention and provenance before claiming coverage. |

## STD-04 safe migration contract (source implemented, not deployed)

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
- STD-03 `tests/test_std03_pin_digits.py`: 3/3 PASS; mounted Web adapter/portal 4/6 PIN cases 40 PASS (focused). Wider email regression pending at writing.
- `tests/test_consumer_guard.py` + `tests/test_multi_approval.py` + `tests/test_g10a_email_decisions.py`: 102 PASS (exit 0, 2026-10-18); covers existing authorization binding and multi-approval/email decisions, NOT live user acceptance.
- `tests/test_audit_evidence.py` + `tests/test_g10a_audit_evidence.py`: 17 PASS (exit 0, 2026-10-18); existing audit/provenance/redaction tests, NOT a certification or complete retention/privacy assessment.
- STD-04 opt-in CloudEvents and RFC 9457 **source implemented** on a candidate; `tests/test_std04_wire_contract.py` 7/7 PASS (isolated loopback, registration API, HMAC, failed callback/retry, connection diagnostic, problem response).
- Existing Python transport/integration/identity tests (47) PASS; Web 104 files / 754 tests PASS, TS typecheck + Vite build PASS; exact-head CI must be confirmed after commit. No real receiving-system CloudEvents acceptance, Cloud Browser FUE or deployed-product PASS claimed.
- G12 intentional dirty test and untracked `e2e-reports/` remain untouched.

Next: commit/CI qualify STD-04, then continue remaining STD-01/02/03/05/06 source gaps where actually evidenced. Preserve blocked Full User E2E as separate unclosed gate. No release/merge/production without authorization.


## Accepted STD-04 implementation boundary (owner continuation 2026-10-18)

- **Goal:** opt-in structured CloudEvents 1.0 delivery and opt-in RFC 9457 error representations while default legacy clients and existing signed receivers remain unchanged.
- **Non-goals:** no generic workflow runtime, no live callback sends, no new OAuth provider, no automatic RFC 9421 key negotiation or third-party certification.
- **Contracts:** registration accepts `event_format=LEGACY|CLOUDEVENTS`; default LEGACY is byte-identical. The immutable, encrypted registered callback destination snapshots the chosen format, not any requester input. Existing queued events keep their original format. CloudEvents structured JSON uses id=outbox id, type=legacy event_type, source=registered Grant integration URI, UTC RFC3339 time, data=original payload. HMAC must sign actual transmitted bytes; no 2xx implies execution.
- **HTTP errors:** return RFC 9457 only for explicit `Accept: application/problem+json` with nonzero quality; otherwise retain exact legacy `error` schema. Emit only bounded code/category/field names, no raw error detail or secrets.
- **State/rollback:** reuse encrypted destination JSON, no schema migration and no updates to existing integrations; removing opt-in support leaves original legacy records unchanged. New format requires deliberate admin registration and signed Review→Confirm.
- **Security/ownership:** role checks and registered destination allowlist unchanged; no external effects or Foundation shared code changes. Grant Web review must show chosen wire format and invalidate stale selections.
- **Acceptance:** RED→GREEN Python model/API/transport/real loopback HMAC/replay tests and Web review tests; affected regressions, typecheck/build/CI, and preserved intentional G12 diff. Full-user acceptance is a separate gate.
