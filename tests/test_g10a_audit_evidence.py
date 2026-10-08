"""G10A-4 audit provenance and secret-safe operator lifecycle evidence."""

import json
import re

from grant.models import Profile


def _email_material(env, request_id):
    with env.db.transaction(write=False) as conn:
        item = conn.execute(
            """SELECT * FROM outbox
               WHERE request_id=? AND sealed_payload=1 AND issuance_id IS NOT NULL
                 AND event_type='requested' ORDER BY created_at,id LIMIT 1""",
            (request_id,),
        ).fetchone()
    payload = env.settings.unseal(item["payload"])["body"]
    code = re.search(r"Four-digit confirmation PIN: ([0-9]{4})", payload)
    link = re.search(r"Approve: https?://[^\s/]+/api/v1/decision-intents/([^\s]+)", payload)
    assert code and link
    return item, code.group(1), link.group(1)


def _new_request(env, profile=None):
    body = env.intake()
    if profile:
        body["profile_id"] = profile["id"]
        body["action"] = {
            "kind": profile["action_kind"], "target": "sensitive-op",
            "parameters": {},
        }
    created = env.human("requester").post("/api/v1/requests", json=body)
    assert created.status_code == 202, created.text
    return created.json()


def _call(env, token, path, body):
    return env.api.post(
        f"/api/v1/decision-intents/{token}/{path}",
        headers={"Origin": env.settings.origin},
        json=body,
    )


def test_admin_provenance_chain_never_discloses_pin_token_or_digest(env):
    request = _new_request(env)
    mail, pin, token = _email_material(env, request["id"])
    admin = env.human("admin")
    before = {}
    with env.db.transaction(write=False) as conn:
        for table in ("audit", "request_decisions", "decision_issuances",
                      "decision_intents", "decision_otp_challenges"):
            before[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    url = f"/api/v1/admin/audit/chain/{request['id']}"
    chain_response = admin.get(url)
    assert chain_response.status_code == 200, chain_response.text
    chain = chain_response.json()
    assert chain["approval_assignments"]
    assert len(chain["email_issuances"]) == 1
    issued = chain["email_issuances"][0]
    assert issued["id"] == mail["issuance_id"]
    assert issued["recipient_id"] == env.users["approver"]["id"]
    assert issued["recipient_role"] == "ORIGINAL"
    assert issued["intent_count"] == 3
    assert issued["state"] == "ACTIVE"
    assert chain["decision_verification"]["snapshot"] == "EMAIL_PIN"
    assert chain["decision_verification"]["mailbox_code_is_mfa"] is False
    assert chain["identity_evidence_limit"] == "EMAIL_LINK_PIN_NOT_PERSON_VERIFIED"
    assert chain["current_is_execution_verified"] is False
    assert chain["deliveries"][0]["sealed_payload"] is True
    assert chain["deliveries"][0]["transport_accepted_not_recipient_receipt"] is False
    dump = chain_response.text
    assert token not in dump and pin not in dump
    assert mail["payload"] not in dump
    assert "token_digest" not in dump and "pin_digest" not in dump
    assert "recipient_email_digest" not in dump
    assert "otp_digest" not in dump and "_decision_pin" not in dump
    assert admin.get(url).json() == chain
    with env.db.transaction(write=False) as conn:
        for table, before_count in before.items():
            assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == before_count
    assert env.human("requester").get(url).status_code == 403
    assert env.api.get(url).status_code == 403


def test_audit_search_export_exposes_typed_assurance_not_free_text(env):
    request = _new_request(env)
    _, pin, token = _email_material(env, request["id"])
    wrong = "9999" if pin != "9999" else "9998"
    denied = _call(env, token, "verify", {"pin": wrong})
    assert denied.status_code == 403
    checked = _call(env, token, "verify", {"pin": pin})
    assert checked.status_code == 200
    chosen = _call(
        env, token, "confirm",
        {"confirmation_token": checked.json()["confirmation_token"], "reason": ""},
    )
    assert chosen.status_code == 200
    admin = env.human("admin")
    chain = admin.get(f"/api/v1/admin/audit/chain/{request['id']}").json()
    by_action = {event["action"]: event for event in chain["events"]}
    assert by_action["decision.pin_failed"]["details"]["failed_attempts"] == 1
    assert by_action["decision.pin_failed"]["details"]["locked"] is False
    assert by_action["request.decision_recorded"]["details"]["actor_assurance"] == "EMAIL_LINK_PIN"
    assert by_action["request.decision_recorded"]["details"]["mailbox_recipient_id"] == env.users["approver"]["id"]
    assert by_action["request.decision_recorded"]["details"].get("verified_person_id") is None
    assert chain["email_issuances"][0]["state"] == "CONSUMED"
    exported = admin.get(
        "/api/v1/admin/audit/export",
        params={"request_id": request["id"], "format": "json"},
    )
    assert exported.status_code == 200
    content = exported.text
    assert '"EMAIL_LINK_PIN"' in content
    assert token not in content and pin not in content
    assert "_decision_tokens" not in content
    assert "pin_digest" not in content


def test_extra_otp_evidence_is_mailbox_only_not_independent_mfa(env):
    profile = env.core.create_profile(
        env.admin,
        Profile(
            name="G10A auditable OTP",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind="audit.otp",
            verification_mode="EMAIL_PIN_PLUS_OTP",
        ),
    )
    env.core.transition_profile(env.admin, profile["id"], "TESTING")
    active = env.core.transition_profile(env.admin, profile["id"], "ACTIVE")
    request = _new_request(env, active)
    _, pin, token = _email_material(env, request["id"])
    challenge = _call(env, token, "verify", {"pin": pin})
    assert challenge.status_code == 200
    context = challenge.json()["confirmation_token"]
    queued = _call(env, token, "otp/request", {"confirmation_token": context})
    assert queued.status_code == 202
    with env.db.transaction(write=False) as conn:
        record = conn.execute(
            "SELECT payload,otp_challenge_id FROM outbox WHERE request_id=? AND event_type='decision_otp'",
            (request["id"],),
        ).fetchone()
    body = env.settings.unseal(record["payload"])["body"]
    match = re.search(r"verification code is: ([0-9]{6})", body)
    assert match
    otp = match.group(1)
    assert _call(env, token, "otp/verify", {"confirmation_token": context, "otp": otp}).status_code == 200
    assert _call(env, token, "confirm", {"confirmation_token": context}).status_code == 200
    chain = env.human("admin").get(f"/api/v1/admin/audit/chain/{request['id']}").json()
    assert len(chain["otp_challenges"]) == 1
    challenge = chain["otp_challenges"][0]
    assert challenge["id"] == record["otp_challenge_id"]
    assert challenge["state"] == "CONSUMED"
    assert challenge["verified_at"] is not None
    assert chain["decision_verification"]["snapshot"] == "EMAIL_PIN_PLUS_OTP"
    assert chain["decision_verification"]["mailbox_code_is_mfa"] is False
    final_vote = next(
        evt for evt in chain["events"] if evt["action"] == "request.decision_recorded"
    )
    assert final_vote["details"]["actor_assurance"] == "EMAIL_LINK_PIN_PLUS_OTP"
    assert final_vote["details"].get("verified_person_id") is None
    content = json.dumps(chain)
    for secret in (token, pin, otp, record["payload"]):
        assert secret not in content
    assert "otp_digest" not in content and "token_digest" not in content
    assert "pin_digest" not in content and '"payload":' not in content


def test_audit_chain_works_for_pre_g10a_migrated_request(env):
    row = _new_request(env)
    with env.db.transaction() as conn:
        conn.execute(
            "DELETE FROM decision_intents WHERE issuance_id IN ("
            " SELECT id FROM decision_issuances WHERE request_id=?)", (row["id"],),
        )
        conn.execute("DELETE FROM decision_issuances WHERE request_id=?", (row["id"],))
        conn.execute("DELETE FROM approval_assignments WHERE request_id=?", (row["id"],))
        conn.execute("UPDATE requests SET email_pin_enabled=0 WHERE id=?", (row["id"],))
    response = env.human("admin").get(f"/api/v1/admin/audit/chain/{row['id']}")
    assert response.status_code == 200, response.text
    assert response.json()["email_issuances"] == []
    assert response.json()["approval_assignments"] == []
    assert response.json()["decision_verification"]["snapshot"] == "EMAIL_PIN"


def test_operator_decision_email_security_metrics_expose_counts_only(env):
    request = _new_request(env)
    _, pin, token = _email_material(env, request["id"])
    admin = env.human("admin")
    endpoint = "/api/v1/admin/operations"
    first = admin.get(endpoint)
    assert first.status_code == 200, first.text
    counts = first.json()["decision_email_security"]
    assert counts["active_issuances"] >= 1
    assert counts["locked_issuances"] == 0
    assert counts["active_challenges"] == 0
    assert counts["mailbox_code_is_mfa"] is False
    assert counts["recipient_receipt_verified"] is False
    for n in range(5):
        incorrect = f"{n:04d}"
        if incorrect == pin:
            incorrect = "9999"
        assert _call(env, token, "verify", {"pin": incorrect}).status_code == 403
    second = admin.get(endpoint)
    assert second.status_code == 200
    summary = second.json()["decision_email_security"]
    assert summary["locked_issuances"] == 1
    assert summary["active_issuances"] == 0
    assert token not in second.text and pin not in second.text
    assert env.users["approver"]["email"] not in second.text
    assert "_decision_tokens" not in second.text and "pin_digest" not in second.text
    assert env.human("requester").get(endpoint).status_code == 403


def test_operator_counts_outstanding_email_otp_and_unavailable_fresh_mfa(env):
    p = env.core.create_profile(
        env.admin,
        Profile(
            name="OTP operator counters",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind="audit.operator-otp",
            verification_mode="EMAIL_PIN_PLUS_OTP",
        ),
    )
    env.core.transition_profile(env.admin, p["id"], "TESTING")
    active = env.core.transition_profile(env.admin, p["id"], "ACTIVE")
    req = _new_request(env, active)
    _, pin, token = _email_material(env, req["id"])
    context = _call(env, token, "verify", {"pin": pin}).json()["confirmation_token"]
    assert _call(env, token, "otp/request", {"confirmation_token": context}).status_code == 202
    overview = env.human("admin").get("/api/v1/admin/operations")
    assert overview.status_code == 200
    assert overview.json()["decision_email_security"]["active_challenges"] == 1
    # An independent installed MFA verification provider remains unavailable;
    # make that operational gap visible without claiming this email code is MFA.
    high = env.core.create_profile(
        env.admin,
        Profile(
            name="Fresh MFA status gate",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind="audit.operator-mfa",
            verification_mode="EMAIL_PIN_PLUS_MFA",
        ),
    )
    env.core.transition_profile(env.admin, high["id"], "TESTING")
    high_active = env.core.transition_profile(env.admin, high["id"], "ACTIVE")
    _new_request(env, high_active)
    status = env.human("admin").get("/api/v1/admin/operations")
    assert status.status_code == 200
    details = status.json()["decision_email_security"]
    assert details["pending_fresh_mfa"] >= 1
    assert details["mailbox_code_is_mfa"] is False
    assert details["recipient_receipt_verified"] is False
