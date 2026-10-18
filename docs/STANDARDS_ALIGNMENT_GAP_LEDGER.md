# Grant standards alignment — evidence-first gap ledger

Status: code-to-standard crosswalk with implemented **STD-04 opt-in** contract (2026-10-18). Original F31 deployed product remains `b2d046938cbfd3e5ff37975b1594538d08e5e71d`; new source is a separate candidate, **not deployed**. The owner's current explicit instruction advances remaining source work ahead of blocked Full User E2E. No external callback, SMTP, production or release effects authorized. No certification or live user acceptance claimed.

## Owner decision / assurance

Low-assurance email-link plus four-digit PIN remains supported by design; do not represent same-mailbox PIN/OTP as independent MFA. Six-digit PIN is now an optional installation setting for new issuance; the default and existing issued four-digit approval remain unchanged. Preserve per-integration policy floors and independent fresh TOTP for higher-assurance actions.

## Source-to-standard crosswalk

| Area | Reference | Source evidence | Finding / next acceptance gate |
| --- | --- | --- | --- |
| Explicit human decision, workflow ordering and delegation | OMG BPMN 2.0.2 / DMN / CMMN concepts; NIST SP 800-53 AC-5 | `grant/decision_links.py` `_active`, `confirm`; `grant/verification_policy.py` | Existing safeguards; independently test parallel quorum, delegation races, step transitions and denial; no OMG interchange conformance claimed. |
| PIN and step-up | NIST SP 800-63B-4; OWASP ASVS / Transaction Authorization | `grant/decision_links.py` `MAX_PIN_FAILURES=5`, scoped token, expiration, rate limits; `grant/verification_policy.py` | SOURCE IMPLEMENTED STD-03 operator-selectable 4/6 digits, legacy defaults/issued digest unchanged and server-trusted issuance length. Both remain low assurance, fresh independent MFA policy separate. Live persona/received-mail gate NOT PASS. |
| Execution binding | OWASP Transaction Authorization; NIST AC-3 | `grant/consumer_guard.py`, `grant/core.py`, action hash, consume/report | Source binding present; verify cross-process replay, revision races and external readback separately. |
| Legacy + structured event delivery | CloudEvents 1.0.2 | `grant/core.py` `create_integration`; `grant/transport.py` `webhook_wire_payload` | IMPLEMENTED opt-in structured envelope with frozen encrypted event source and signed transmitted bytes; existing legacy receivers and queued events preserve original default. Tests remain supporting, not external acceptance. |
| Webhook signing | RFC 9421 / RFC 9530 | `grant/transport.py`: HMAC over timestamp + dot + body, `X-Grant-Signature` | Custom HMAC, NOT RFC 9421. Test signed delivery/retry and determine versioned opt-in standard signature separately. |
| HTTP API contract | OpenAPI; RFC 9457 | `grant/admin.py` admin-only `/api/v1/openapi.json`; `grant/app.py` error handlers | IMPLEMENTED explicit `Accept: application/problem+json` opt-in with `type/title/status` and bounded code/category/fields; legacy remains default. |
| Audit evidence | ISO/IEC 27001/27002 mapping, W3C PROV concepts | `grant/audit_evidence.py`, `grant/admin.py` audit search/export/chain | STD-05 source repair: strict typed `represented_approver` is now surfaced alongside mailbox recipient and actual verified-person assurance without leaking token/PIN; 18 isolated tests PASS. ISO organizational certification and tamper-proof external audit remain unclaimed. |

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
- STD-03 `tests/test_std03_pin_digits.py`: 3/3 PASS; focused existing email/MFA Python suite 48 PASS; Web PIN adapter/portal cases 40 PASS, full Web 104 files/757 PASS, typecheck/build/Ruff PASS, exact CI on commit `82dd0c7` separate; new source not deployed.
- `tests/test_consumer_guard.py` + `tests/test_multi_approval.py` + `tests/test_g10a_email_decisions.py`: 102 PASS (exit 0, 2026-10-18); covers existing authorization binding and multi-approval/email decisions, NOT live user acceptance.
- `tests/test_audit_evidence.py` + `tests/test_g10a_audit_evidence.py`: 17 PASS; STD-05 new `tests/test_std05_audit_actor.py` 1 PASS, total 18 audit PASS. Deliberately does not claim ISO certification or external integrity/non-repudiation guarantees.
- STD-04 opt-in CloudEvents and RFC 9457 **source implemented** on a candidate; `tests/test_std04_wire_contract.py` 7/7 PASS (isolated loopback, registration API, HMAC, failed callback/retry, connection diagnostic, problem response).
- Existing Python transport/integration/identity tests (47) PASS; Web at STD-04 commit 104 files / 754 tests PASS, TS typecheck + Vite build PASS; exact-head GitHub Grant #39107173829 and ES #39107174161 SUCCESS. No real receiving-system CloudEvents acceptance, Cloud Browser FUE or deployed-product PASS claimed.
- G12 intentional dirty test and untracked `e2e-reports/` remain untouched.

Next: qualify STD-05/06 source and exact-head CI. STD-01/02 implementable semantics have evidence below. Do not implement entire external modeling standards or high-risk operator effects absent accepted scope. Preserve blocked Full User E2E as separate unclosed gate. No release/merge/production without authorization.


## Accepted STD-04 implementation boundary (owner continuation 2026-10-18)

- **Goal:** opt-in structured CloudEvents 1.0 delivery and opt-in RFC 9457 error representations while default legacy clients and existing signed receivers remain unchanged.
- **Non-goals:** no generic workflow runtime, no live callback sends, no new OAuth provider, no automatic RFC 9421 key negotiation or third-party certification.
- **Contracts:** registration accepts `event_format=LEGACY|CLOUDEVENTS`; default LEGACY is byte-identical. The immutable, encrypted registered callback destination snapshots the chosen format, not any requester input. Existing queued events keep their original format. CloudEvents structured JSON uses id=outbox id, type=legacy event_type, source=registered Grant integration URI, UTC RFC3339 time, data=original payload. HMAC must sign actual transmitted bytes; no 2xx implies execution.
- **HTTP errors:** return RFC 9457 only for explicit `Accept: application/problem+json` with nonzero quality; otherwise retain exact legacy `error` schema. Emit only bounded code/category/field names, no raw error detail or secrets.
- **State/rollback:** reuse encrypted destination JSON, no schema migration and no updates to existing integrations; removing opt-in support leaves original legacy records unchanged. New format requires deliberate admin registration and signed Review→Confirm.
- **Security/ownership:** role checks and registered destination allowlist unchanged; no external effects or Foundation shared code changes. Grant Web review must show chosen wire format and invalidate stale selections.
- **Acceptance:** RED→GREEN Python model/API/transport/real loopback HMAC/replay tests and Web review tests; affected regressions, typecheck/build/CI, and preserved intentional G12 diff. Full-user acceptance is a separate gate.


## STD-01 / STD-02 / STD-05 / STD-06 control crosswalk (2026-10-18)

Scope of this ledger: **Grant product SOURCE**, not conformity assessment of an
enterprise information-security management system, full OMG standard
interchange, a legally binding signature service, or a human-verified external
effect. A `SOURCE_VERIFIED` status means a named control has an implemented
path and focused automated evidence, NOT that the entire reference is met.

| Control / normative reference | Product disposition | Grounded source and targeted evidence | Additional unmet boundary |
| --- | --- | --- | --- |
| OMG BPMN 2.0.2 sequential tasks, exclusive decisions | SOURCE_VERIFIED semantics | `grant/core.py::_record_vote` sequential waiting-seat and terminal states; `tests/test_multi_approval.py::test_sequential_rejects_out_of_order_then_advances` | BPMN XML import/export/executable BPMN engine NOT_APPLICABLE to accepted Grant product scope |
| BPMN parallel human decisions / quorum | SOURCE_VERIFIED semantics | `_record_vote` approval count, denials, holds; `tests/test_multi_approval.py::test_all_group_requires_every_member_and_snapshots_membership`, `test_n_of_m_and_duplicate_decision_are_race_safe` | No general-purpose workflow orchestrator promised |
| OMG DMN 1.6 decision logic, trust inputs | SOURCE_VERIFIED concepts | `grant/verification_policy.py::trusted_action_floor`; versioned ACTIVE policy selection and minimum verification; `tests/test_multi_approval.py::test_stale_group_editor_cannot_reduce_future_all_threshold` | DMN decision tables interchange/external expression engine NOT_APPLICABLE |
| OMG CMMN 1.1 human case outcomes | SOURCE_VERIFIED concepts | `grant/core.py::_record_vote` distinct HELD/DENIED; request collaboration/assignments and audit; `tests/test_multi_approval.py::test_sequential_hold_remains_revisable_by_same_approver` | CMMN XML interchange NOT_APPLICABLE |
| NIST SP 800-53 AC-3 server-side access enforcement | SOURCE_VERIFIED | `grant/auth.py::require_current_authority`, `grant/decision_links.py::_active`, `grant/consumer_guard.py::check_product_claim`; `tests/test_g10_hardening.py::test_revoked_integration_token_cannot_query_cached_request_principal` | Organization-wide authorization governance out of scope |
| NIST SP 800-53 AC-5 separation of duties | SOURCE_VERIFIED | `grant/decision_links.py::_active` self-approval check and delegated-seat current authority; `tests/test_multi_approval.py::test_group_denial_is_final_and_self_approval_is_rejected`, `tests/test_g10a_email_decisions.py::test_original_and_delegate_first_terminal_wins_under_concurrency` | Independent assigned human identity only verifiable in authenticated MFA tier |
| NIST SP 800-53 AU audit actor/provenance | SOURCE_REPAIRED | `grant/core.py::_record_vote`; `grant/audit_evidence.py::sanitized_detail` typed `represented_approver` with distinct mailbox and verified-person fields; `tests/test_std05_audit_actor.py` RED→GREEN, admin role and PIN/token secrecy | External WORM signing, cryptographic non-repudiation NOT CLAIMED |
| NIST SP 800-63B-4 identity / authentication | SOURCE_VERIFIED tier distinction | `grant/verification_policy.py` trusted floor; `grant/decision_mfa.py` independently authenticated fresh TOTP; `tests/test_g10a_fresh_mfa.py`, `tests/test_std03_pin_digits.py` | Email+PIN/OTP is low assurance, NOT MFA or AAL2; owner-selected password composition may differ from NIST guidance |
| OWASP ASVS 5 / Transaction Authorization | SOURCE_VERIFIED | `grant/decision_links.py` inert GET and PIN→short-lived context→explicit Confirm; `grant/core.py::consume` action_hash and replay handling; `tests/test_g10a_email_decisions.py::test_readonly_link_requires_pin_then_explicit_confirm_and_no_execution`; `tests/test_g10_hardening.py::test_competing_consume_ids_never_commit_two_actions` | Real external action exactly-once requires receiving system's own atomic ledger/readback |
| RFC 9457 HTTP Problem Details | SOURCE_IMPLEMENTED_OPT_IN | `grant/app.py::_error_response`, `tests/test_std04_wire_contract.py` | Legacy callers continue Grant-native JSON; strict full API/client conformance beyond existing test coverage NOT CLAIMED |
| CloudEvents 1.0.2 structured delivery | SOURCE_IMPLEMENTED_OPT_IN | `grant/transport.py::webhook_wire_payload`, encrypted registration choice, `tests/test_std04_wire_contract.py` isolated 2xx/5xx and HMAC | No external real receiver acceptance yet |
| RFC 9421 HTTP Message Signatures / RFC 9530 digests | NO_CONFORMANCE_CLAIM | Existing bounded custom `X-Grant-Signature` timestamp+body HMAC in `grant/transport.py` | Deliberate RFC 9421 implementation/negotiation would require separate consumer compatibility and key-management requirements |
| ISO/IEC 27001/27002, ISO 37301 organizational controls | PARTIAL_PRODUCT_SUPPORT | Role scoping, typed audit export, configuration history and recovery in `grant/admin.py` / `grant/audit_evidence.py`; `tests/test_audit_evidence.py` | Organizational certification, retention/legal holds and audit integrity infrastructure require operator program/owner policy |
| W3C PROV-DM provenance model | CONCEPTUAL_ONLY | Request ID, action hash, approval actor, steps, issuance, decision, execution result traced in `request_chain` | No official PROV interchange or evidence signing |
| WCAG 2.2 focus order during Grant email approval | SOURCE_REPAIRED | `web/src/email_decision_portal.tsx` focus target on phase transitions; `web/tests/browser/approval.spec.ts` isolated Chromium keyboard focus assertion PASS | Common Foundation 320×568 first-view login defect and shell/identity UI owned by Foundation #99 |
| SCIM 2.0 enterprise provisioning | OPTIONAL_NOT_IN_BASELINE | Existing local Grant users/groups and Foundation shared identity; no SCIM endpoint falsely exposed | Explicit enterprise provisioning contract / separate roadmap acceptance required |
| Retention / restore + HTTPS / Network / password-admin effects | OWNER_GATED | `ROADMAP.md` SM-3/SM-4; existing read-only System Management guidance | Host privileges, deletion, external certification, operational recovery require separately authorized change control |

### Standard-alignment source disposition

- **STD-01:** source-to-standard applicability inventory COMPLETE, with
  explicit covered semantics, out-of-scope interchange and owner-gated gaps.
- **STD-02:** existing decision state/actor/quorum/delegation/execution
  invariants SOURCE_VERIFIED, no repeated implementation warranted without
  independent failure evidence.
- **STD-03:** 4-digit owner default plus optional 6-digit source implemented,
  full integration confirmation still requires real mailbox/user acceptance.
- **STD-04:** opt-in structured event + explicit problem response SOURCE
  IMPLEMENTED and local CI qualified; external real consumer acceptance OPEN.
- **STD-05:** lost original approver ID in sanitized admin export FIXED with
  strict typed allowlist; organization-level ISO compliance NOT CLAIMED.
- **STD-06:** Grant approval phase keyboard-focus bug FIXED and targeted
  isolated Chromium PASS; shared Foundation login/shell gaps upstream and
  SCIM is an optional separate product feature.

No unresolved **demonstrated** safe, mandatory Grant-source standard gap
remains from this bounded audit. This is NOT equivalent to complete
independent-user E2E, real mail delivery, full standards certification,
or production/release readiness.
