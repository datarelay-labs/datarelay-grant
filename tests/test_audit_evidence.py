"""G9 audit search and export are bounded, human-authorized and safe."""

import csv
import io

from grant.db import Database, audit


def make_request(env, title="Audit evidence request"):
    created = env.human("requester").post(
        "/api/v1/requests", json=env.intake(title=title)
    )
    assert created.status_code == 202, created.text
    return created.json()


def test_audit_search_is_admin_only_scoped_and_ordered(env):
    first = make_request(env, "Audit first")
    second = make_request(env, "Audit second")
    admin = env.human("admin")
    path = "/api/v1/admin/audit/search"
    result = admin.get(path, params={"request_id": first["id"]})
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["total"] >= 1
    assert all(item["request_id"] == first["id"] for item in body["items"])
    assert all("details" in item for item in body["items"])
    assert all("summary" not in item for item in body["items"])
    assert [(e["at"], e["id"]) for e in body["items"]] == sorted(
        [(e["at"], e["id"]) for e in body["items"]], reverse=True
    )
    assert second["id"] not in [e["request_id"] for e in body["items"]]
    assert env.human("requester").get(path).status_code == 403
    assert env.api.get(path).status_code == 403

    by_action = admin.get(path, params={"action": "request.created"})
    assert by_action.status_code == 200
    assert by_action.json()["total"] >= 2
    invalid = admin.get(path, params={"limit": 201})
    assert invalid.status_code == 422


def test_audit_search_and_export_never_expose_free_text_or_formula_injection(env):
    row = make_request(env)
    with env.db.transaction() as conn:
        audit(
            conn,
            row["id"],
            "=1+1",
            "request.collaboration",
            {
                "decision": "DENIED",
                "body": "private-note-string",
                "reason": "private-note-string",
                "secret": "private-note-string",
                "event_id": "event-reference-only",
            },
        )
    admin = env.human("admin")
    params = {"request_id": row["id"]}
    json_response = admin.get("/api/v1/admin/audit/export", params={**params, "format": "json"})
    assert json_response.status_code == 200
    assert "attachment;" in json_response.headers["content-disposition"]
    assert "private-note-string" not in json_response.text
    data = json_response.json()
    assert data["export_schema"] == 1
    assert data["bounded"] is True
    assert all("body" not in row["details"] for row in data["events"])
    assert any(item["details"].get("decision") == "DENIED" for item in data["events"])

    csv_response = admin.get("/api/v1/admin/audit/export", params={**params, "format": "csv"})
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "private-note-string" not in csv_response.text
    records = list(csv.DictReader(io.StringIO(csv_response.text)))
    assert records
    assert any(record["actor"] == "'=1+1" for record in records)
    assert env.human("approver").get(
        "/api/v1/admin/audit/export", params={"format": "csv"}
    ).status_code == 403


def test_audit_chain_binds_policy_decision_and_execution_evidence(env):
    request = make_request(env)
    approver = env.human("approver")
    decided = approver.post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": request["revision"]},
    )
    assert decided.status_code == 200
    claim = {"execution_id": "audit-test-bound-execution", "action_hash": request["action_hash"]}
    assert env.api.post(f"/api/v1/requests/{request['id']}/consume", json=claim).status_code == 200
    assert env.api.post(
        f"/api/v1/requests/{request['id']}/result",
        json={**claim, "status": "REPORTED_SUCCEEDED", "evidence": "isolated evidence reference"},
    ).status_code == 200

    path = f"/api/v1/admin/audit/chain/{request['id']}"
    result = env.human("admin").get(path)
    assert result.status_code == 200, result.text
    body = result.json()
    snapshot = body["request"]
    assert snapshot["id"] == request["id"]
    assert snapshot["profile_id"] == request["profile_id"]
    assert snapshot["action_hash"] == request["action_hash"]
    assert snapshot["decision"] == "APPROVED"
    assert snapshot["execution_state"] == "REPORTED_SUCCEEDED"
    assert snapshot["execution_id"] == claim["execution_id"]
    events = {item["action"] for item in body["events"]}
    assert {"request.created", "request.decision_recorded", "execution.committed", "execution.result_reported"} <= events
    assert body["total_events"] >= 4
    assert env.human("stranger").get(path).status_code == 403


def test_immutable_audit_survives_disposable_backup_restore(env, tmp_path):
    row = make_request(env)
    old = env.human("admin").get(
        "/api/v1/admin/audit/search", params={"request_id": row["id"]}
    ).json()
    destination = tmp_path / "isolated-audit-v8.sqlite"
    env.db.backup(destination)
    restored = Database(destination)
    with restored.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 8
        audit_rows = conn.execute(
            "SELECT id FROM audit WHERE request_id=? ORDER BY at DESC,id DESC",
            (row["id"],),
        ).fetchall()
        assert len(audit_rows) == old["total"]
        assert conn.execute(
            "SELECT action_hash FROM requests WHERE id=?", (row["id"],)
        ).fetchone()[0] == row["action_hash"]


def test_metadata_import_preview_detects_conflicts_without_changing_configuration(env):
    admin = env.human("admin")
    exported = admin.get("/api/v1/integrations/configuration-export")
    assert exported.status_code == 200
    original = exported.json()
    preview = admin.post("/api/v1/admin/configuration/preview", json=original)
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["schema_version"] == 1
    assert data["preview_only"] is True
    assert data["can_apply"] is False
    assert data["summary"]["integrations"] == len(original["integrations"])
    assert data["summary"]["policies"] == len(original["policies"])
    assert data["summary"]["templates"] == len(original["templates"])
    assert any(entry["kind"] == "integration" for entry in data["conflicts"])
    assert admin.get("/api/v1/integrations/configuration-export").json() == original
    assert env.human("requester").post(
        "/api/v1/admin/configuration/preview", json=original
    ).status_code == 403


def test_portability_preview_rejects_unknown_fields_and_unsupported_versions(env):
    admin = env.human("admin")
    import copy

    manifest = admin.get("/api/v1/integrations/configuration-export").json()
    risky = copy.deepcopy(manifest)
    risky["integrations"][0]["callback_url"] = "https://unused.invalid"
    response = admin.post("/api/v1/admin/configuration/preview", json=risky)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "CONFIGURATION_PREVIEW_UNSAFE"
    unsupported = {**manifest, "schema_version": 999}
    rejected = admin.post("/api/v1/admin/configuration/preview", json=unsupported)
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "CONFIGURATION_PREVIEW_UNSAFE"
    assert env.api.post(
        "/api/v1/admin/configuration/preview", json=manifest
    ).status_code == 403


def test_audit_pagination_literal_search_and_export_bounds(env):
    admin = env.human("admin")
    req = make_request(env)
    with env.db.transaction() as conn:
        for i in range(118):
            audit(conn, req["id"], "auditor", f"probe.{i}", {"decision": "DENIED"}, now=100)
    first = admin.get(
        "/api/v1/admin/audit/search",
        params={"request_id": req["id"], "limit": 50},
    )
    second = admin.get(
        "/api/v1/admin/audit/search",
        params={"request_id": req["id"], "limit": 50, "offset": 50},
    )
    assert first.status_code == second.status_code == 200
    ids = [row["id"] for row in first.json()["items"] + second.json()["items"]]
    assert len(ids) == len(set(ids)) == 100
    assert first.json()["has_more"] is True
    literal = admin.get("/api/v1/admin/audit/search", params={"search": "%"})
    assert literal.status_code == 200
    assert literal.json()["items"] == []
    injection = admin.get(
        "/api/v1/admin/audit/search", params={"search": "' OR 1=1 --"}
    )
    assert injection.status_code == 200
    assert injection.json()["items"] == []
    bad_range = admin.get(
        "/api/v1/admin/audit/search", params={"since": 200, "until": 100}
    )
    assert bad_range.status_code == 422
    assert admin.get(
        "/api/v1/admin/audit/export", params={"limit": 1001}
    ).status_code == 422
    assert admin.get(
        "/api/v1/admin/audit/export", params={"format": "xml"}
    ).status_code == 422


def test_backup_preserves_group_delegation_comment_policy_and_identity_history(env, tmp_path):
    import time

    from grant.auth import Principal
    from grant.models import ApproverGroup, Delegation

    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name="Evidence snapshot group",
            member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]],
        ),
    )
    now = time.time()
    env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 2,
            ends_at=now + 120,
        ),
    )
    row = make_request(env)
    comment = env.human("approver").post(
        f"/api/v1/requests/{row['id']}/comments",
        json={"kind": "QUESTION", "body": "Is this the correct target?",
              "expected_revision": row["revision"]},
    )
    assert comment.status_code == 201, comment.text
    destination = tmp_path / "evidence-state.sqlite"
    env.db.backup(destination)
    restored = Database(destination)
    with restored.transaction(write=False) as conn:
        tables = [
            "audit", "requests", "profile_versions", "approver_groups",
            "delegations", "request_comments", "api_tokens",
        ]
        counts = {
            table: conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in tables
        }
        assert all(count > 0 for count in counts.values()), counts
        assert conn.execute(
            "SELECT id FROM approver_groups WHERE id=?", (group["id"],)
        ).fetchone() is not None
        assert conn.execute(
            "SELECT action_hash FROM requests WHERE id=?", (row["id"],)
        ).fetchone()[0] == row["action_hash"]
        assert conn.execute(
            "SELECT kind FROM request_comments WHERE request_id=?", (row["id"],)
        ).fetchone()[0] == "QUESTION"
        assert conn.execute(
            "SELECT count(*) FROM audit WHERE request_id=?", (row["id"],)
        ).fetchone()[0] >= 2
