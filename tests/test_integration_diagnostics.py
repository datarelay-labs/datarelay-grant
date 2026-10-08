"""G8 integration diagnostics are read-only and scoped to administrators."""


def test_diagnostics_derive_from_existing_integration_records(env):
    a = env.human("admin")
    ident = env.integration["id"]
    result = a.get(f"/api/v1/integrations/{ident}/diagnostics")
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["integration"]["id"] == ident
    assert body["integration"]["name"] == "Test DataRelay"
    assert body["request_activity"]["count"] == 0
    assert body["transport"]["last_accepted_at"] is None
    assert body["connection_tests"] == []
    assert env.human("requester").get(
        f"/api/v1/integrations/{ident}/diagnostics"
    ).status_code == 403
    assert a.get("/api/v1/integrations/unknown/diagnostics").status_code == 404


def test_export_manifest_has_only_safe_nonexecutable_metadata(env):
    a = env.human("admin")
    result = a.get("/api/v1/integrations/configuration-export")
    assert result.status_code == 200, result.text
    manifest = result.json()
    assert manifest["schema_version"] == 1
    assert manifest["import_supported"] is False
    assert manifest["executable_restore_bundle"] is False
    assert len(manifest["integrations"]) == 1
    assert len(manifest["policies"]) >= 1
    assert manifest["templates"] == []
    assert set(manifest["integrations"][0]) == {
        "id", "name", "kind", "tenant", "enabled"
    }
    assert "action_kind" in manifest["policies"][0]
    assert env.human("requester").get(
        "/api/v1/integrations/configuration-export"
    ).status_code == 403


def test_request_observations_do_not_mutate_execution(env):
    requester = env.human("requester")
    row = requester.post("/api/v1/requests", json=env.intake())
    assert row.status_code == 202, row.text
    result = env.human("admin").get(
        f"/api/v1/integrations/{env.integration['id']}/diagnostics"
    )
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["request_activity"]["count"] == 1
    assert data["transport"]["last_accepted_at"] is None
    actual = requester.get(f"/api/v1/requests/{row.json()['id']}")
    assert actual.status_code == 200
    assert actual.json()["execution_state"] == "NOT_STARTED"


def test_existing_credential_metadata_is_classified_without_revealing_material(env):
    data = env.human("admin").get(
        f"/api/v1/integrations/{env.integration['id']}/diagnostics"
    ).json()
    credential = next(
        item for item in data["credentials"] if item["id"] == env.token["id"]
    )
    assert credential["role"] == "mixed"
    assert credential["enabled"] is True
    assert set(credential["scopes"]) == {
        "request:create", "request:read", "grant:consume", "result:write"
    }
    assert set(credential) == {"id", "scopes", "role", "enabled", "created_at"}
    assert any(
        record["event"] == "integration.token_created"
        and record["credential_id"] == env.token["id"]
        for record in data["credential_history"]
    )


def test_connection_test_event_history_is_read_from_bounded_safe_audit_fields(env):
    import time

    from grant.db import audit

    now = time.time()
    with env.db.transaction() as conn:
        audit(
            conn, None, env.admin.id, "integration.test_accepted",
            {"integration_id": env.integration["id"], "event_id": "diagnostic-test-1"},
            now=now - 20,
        )
        audit(
            conn, None, env.admin.id, "integration.test_failed",
            {"integration_id": env.integration["id"], "event_id": "diagnostic-test-2"},
            now=now - 10,
        )
    response = env.human("admin").get(
        f"/api/v1/integrations/{env.integration['id']}/diagnostics"
    )
    assert response.status_code == 200, response.text
    history = response.json()["connection_tests"]
    assert [item["status"] for item in history] == ["failed", "accepted"]
    assert all(item["execution_allowed"] is False for item in history)
    assert all(set(item) == {"at", "status", "execution_allowed"} for item in history)


def test_failed_connection_diagnostic_does_not_expose_transport_detail(env, monkeypatch):
    def simulated_transport_failure(*_args):
        raise ConnectionError("isolated transport unavailable")

    monkeypatch.setattr("grant.transport.send_webhook", simulated_transport_failure)
    response = env.human("admin").post(
        f"/api/v1/integrations/{env.integration['id']}/test"
    )
    assert response.status_code == 502, response.text
    assert response.json()["error"]["code"] == "CONNECTION_TEST_FAILED"
    detail = env.human("admin").get(
        f"/api/v1/integrations/{env.integration['id']}/diagnostics"
    )
    assert detail.status_code == 200
    assert detail.json()["connection_tests"][0]["status"] == "failed"
    assert detail.json()["connection_tests"][0]["execution_allowed"] is False
    assert "isolated transport unavailable" not in detail.text


def test_callback_failure_time_uses_worker_audit_not_retry_schedule(env):
    import time

    from grant.db import audit

    created = env.human("requester").post(
        "/api/v1/requests", json=env.intake()
    )
    assert created.status_code == 202
    req = created.json()
    before = time.time() - 40
    with env.db.transaction() as conn:
        conn.execute(
            """INSERT INTO outbox(
              id,request_id,kind,event_type,revision,payload,destination,
              state,available_at,created_at)
              VALUES(?,?,?,?,?,?,?,?,?,?)""",
            ("retry-later", req["id"], "webhook", "approval_outcome",
             req["revision"], "{}", "opaque-test",
             "FAILED", before + 3600, before - 30),
        )
        audit(
            conn, req["id"], "worker", "delivery.failed",
            {"event_id": "retry-later", "kind": "webhook", "error": "test"},
            now=before,
        )
    details = env.human("admin").get(
        f"/api/v1/integrations/{env.integration['id']}/diagnostics"
    )
    assert details.status_code == 200, details.text
    assert details.json()["transport"]["last_failure_at"] == before
    assert details.json()["transport"]["latest_state"] == "FAILED"


def test_template_export_contains_event_metadata_not_rendered_content(env):
    import copy
    import json

    from grant.mail_templates import DEFAULT_EVENT_TEMPLATES

    templates = copy.deepcopy(DEFAULT_EVENT_TEMPLATES)
    templates["requested"]["body"] = "opaque-private-template-content"
    created = env.human("admin").post(
        "/api/v1/notification-template-sets",
        json={"name": "Template metadata only", "templates": templates},
    )
    assert created.status_code == 201, created.text
    export = env.human("admin").get("/api/v1/integrations/configuration-export")
    assert export.status_code == 200
    manifest = export.json()
    info = next(t for t in manifest["templates"] if t["name"] == "Template metadata only")
    assert "requested" in info["event_types"]
    assert "opaque-private-template-content" not in json.dumps(manifest)
    assert "event_templates" not in json.dumps(manifest)


def test_diagnostics_audit_bounds_apply_to_selected_integration_not_all_events(env):
    import time

    from grant.db import audit

    base = time.time() - 1000
    with env.db.transaction() as conn:
        audit(
            conn, None, env.admin.id, "integration.test_accepted",
            {"integration_id": env.integration["id"], "event_id": "selected-event"},
            now=base,
        )
        for i in range(220):
            audit(
                conn, None, env.admin.id, "integration.test_accepted",
                {"integration_id": "unrelated-fixture", "event_id": str(i)},
                now=base + i + 1,
            )
    response = env.human("admin").get(
        f"/api/v1/integrations/{env.integration['id']}/diagnostics"
    )
    assert response.status_code == 200, response.text
    history = response.json()["connection_tests"]
    assert len(history) == 1
    assert history[0]["at"] == base


def test_read_scope_is_neutral_in_credential_role_classification(env):
    import json

    ident = env.token["id"]
    endpoint = f"/api/v1/integrations/{env.integration['id']}/diagnostics"
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE api_tokens SET scopes=? WHERE id=?",
            (json.dumps(["request:read", "grant:consume", "result:write"]), ident),
        )
    executor = env.human("admin").get(endpoint)
    assert executor.status_code == 200, executor.text
    record = next(item for item in executor.json()["credentials"] if item["id"] == ident)
    assert record["role"] == "executor"
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE api_tokens SET scopes=? WHERE id=?",
            (json.dumps(["request:read"]), ident),
        )
    observer = env.human("admin").get(endpoint)
    assert observer.status_code == 200
    record = next(item for item in observer.json()["credentials"] if item["id"] == ident)
    assert record["role"] == "observer"
