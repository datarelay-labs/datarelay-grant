"""U2.01 authoritative paged inventory drill-down; isolated test DB only."""
from test_email_publication import publish, template
from test_notification_center import activate, policy_payload


def test_template_usage_read_reports_exact_active_versions_and_ignores_drafts(env):
    admin = env.human("admin")
    saved = template(admin)
    assert publish(admin, saved["id"]).status_code == 200
    profile = admin.post("/api/v1/profiles", json=policy_payload(env, saved["id"])).json()
    endpoint = "/api/v1/notification-template-sets/" + saved["id"] + "/usage"
    before = admin.get(endpoint)
    assert before.status_code == 200, before.text
    assert before.json()["total"] == 0
    activate(admin, profile["id"])
    result = admin.get(endpoint + "?limit=1").json()
    assert result["template_id"] == saved["id"]
    assert result["total"] == 1 and result["offset"] == 0 and result["limit"] == 1
    assert result["has_more"] is False
    item = result["policies"][0]
    assert item["profile_id"] == profile["id"]
    assert item["lifecycle"] == "ACTIVE"
    assert item["name"] == profile["name"]
    assert admin.get(endpoint + "?offset=1&limit=1").json()["policies"] == []
    assert env.human("approver").get(endpoint).status_code == 403
    assert admin.get(endpoint + "?limit=0").status_code == 422
    assert admin.get(endpoint + "?limit=51").status_code == 422
    assert admin.get(endpoint + "?offset=-1").status_code == 422
    assert admin.get(endpoint.replace(saved["id"], "missing-template")).status_code == 404
    assert admin.get(endpoint).json()["total"] == 1
