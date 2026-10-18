"""STD-05 trace actual represented approver separately from mailbox recipient."""

from tests.test_g10a_email_decisions import complete, create, messages


def test_admin_audit_chain_and_export_preserve_real_email_approver_reference(env):
    request = create(env)
    mail = messages(env, request["id"])[0]
    response = complete(env, mail, "APPROVED")
    assert response.status_code == 200, response.text
    assert response.json()["verified_person_id"] is None
    admin = env.human("admin")
    chain_response = admin.get("/api/v1/admin/audit/chain/" + request["id"])
    assert chain_response.status_code == 200
    vote = next(evt for evt in chain_response.json()["events"]
                if evt["action"] == "request.decision_recorded")
    assert vote["details"]["represented_approver"] == env.users["approver"]["id"]
    assert vote["details"]["mailbox_recipient_id"] == env.users["approver"]["id"]
    assert vote["details"]["actor_assurance"] == "EMAIL_LINK_PIN"
    assert vote["details"].get("verified_person_id") is None
    search = admin.get("/api/v1/admin/audit/search",
                       params={"request_id": request["id"]})
    assert search.status_code == 200
    assert any(
        evt["details"].get("represented_approver") == env.users["approver"]["id"]
        for evt in search.json()["items"]
    )
    exported = admin.get("/api/v1/admin/audit/export",
                         params={"request_id": request["id"], "format": "json"})
    assert exported.status_code == 200
    assert any(
        evt["details"].get("represented_approver") == env.users["approver"]["id"]
        for evt in exported.json()["events"]
    )
    for raw in [chain_response.text, search.text, exported.text]:
        assert mail["links"]["APPROVED"] not in raw
        assert mail["pin"] not in raw
        assert mail["sealed"] not in raw
    assert env.human("requester").get(
        "/api/v1/admin/audit/search", params={"request_id": request["id"]},
    ).status_code == 403
