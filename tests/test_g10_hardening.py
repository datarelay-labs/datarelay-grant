"""G10 isolated security regressions for approval, execution and evidence bounds."""

import csv
import io
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from grant.audit_evidence import audit_export, audit_search, request_chain
from grant.auth import Principal
from grant.configuration_preview import preview_configuration
from grant.errors import GrantError
from grant.models import ApproverGroup, Consume, Decision, Profile


def request_with_group(env, mode: str, required: int | None = None) -> dict:
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name=f"G10 isolated {mode}",
            member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]],
        ),
    )
    profile = env.core.create_profile(
        env.admin,
        Profile(
            name=f"G10 review {mode}",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            approval_mode=mode,
            approver_group_id=group["id"],
            approvals_required=required,
            action_kind="service.g10-review",
        ),
    )
    env.core.transition_profile(env.admin, profile["id"], "TESTING")
    active = env.core.transition_profile(env.admin, profile["id"], "ACTIVE")
    created = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=active["id"],
            action={"kind": active["action_kind"], "target": "g10-sandbox", "parameters": {}},
        ),
    )
    assert created.status_code == 202, created.text
    return created.json()


def test_audit_poisoned_numbers_are_omitted_and_csv_neutralizes_leading_whitespace(env):
    req = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    with env.db.transaction() as conn:
        # Simulate an older/third-party malformed audit record in the isolated
        # local DB. Product audit writers correctly reject nonfinite JSON.
        conn.execute(
            "INSERT INTO audit(id,request_id,at,actor,action,detail) VALUES(?,?,?,?,?,?)",
            ("poisoned-numeric", req["id"], time.time(), " \t=1+1",
             "request.audit", '{"approvals":NaN,"required":Infinity,"decision":"APPROVED"}'),
        )
    admin = env.human("admin")
    found = admin.get("/api/v1/admin/audit/search", params={"request_id": req["id"]})
    assert found.status_code == 200, found.text
    event = next(e for e in found.json()["items"] if e["id"] == "poisoned-numeric")
    assert event["details"] == {"decision": "APPROVED"}

    exported = admin.get(
        "/api/v1/admin/audit/export",
        params={"format": "json", "request_id": req["id"]},
    )
    assert exported.status_code == 200, exported.text
    assert "NaN" not in exported.text and "Infinity" not in exported.text
    csv_result = admin.get(
        "/api/v1/admin/audit/export",
        params={"format": "csv", "request_id": req["id"]},
    )
    assert csv_result.status_code == 200
    rows = list(csv.DictReader(io.StringIO(csv_result.text)))
    poisoned = next(row for row in rows if row["id"] == "poisoned-numeric")
    assert poisoned["actor"].startswith("'")
    assert "NaN" not in poisoned["details"]


def test_ended_admin_principal_cannot_use_audit_or_configuration_preview(env):
    admin = env.human("admin")
    principal = env.auth.session(admin.cookies["grant_session"])
    manifest = admin.get("/api/v1/integrations/configuration-export").json()
    req = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    with env.db.transaction() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (principal.session_id,))

    paths = (
        lambda: audit_search(env.db, principal),
        lambda: audit_export(env.db, principal, fmt="json"),
        lambda: request_chain(env.db, principal, req["id"]),
        lambda: preview_configuration(env.db, principal, manifest),
    )
    for call in paths:
        with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
            call()
    assert admin.get("/api/v1/admin/audit/search").status_code == 401
    assert admin.get("/api/v1/admin/audit/export").status_code == 401


def test_two_simultaneous_approvers_can_never_double_grant(env):
    row = request_with_group(env, "ANY_ONE")
    fence = threading.Barrier(2)
    results = []
    principals = [
        Principal(env.users[who]["id"], "human", "member")
        for who in ("approver", "stranger")
    ]

    def race(actor: Principal):
        fence.wait(timeout=10)
        try:
            return env.core.decide(
                actor, row["id"],
                Decision(decision="APPROVED", expected_revision=row["revision"]),
            )["state"]
        except GrantError as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(race, principal) for principal in principals]
        results = [future.result(timeout=15) for future in futures]
    assert results.count("APPROVED") == 1, results
    assert any(result in ("STALE_OR_FINAL_DECISION", "DECISION_ALREADY_RECORDED") for result in results)
    with env.db.transaction(write=False) as conn:
        current = conn.execute(
            "SELECT state,revision,execution_id FROM requests WHERE id=?", (row["id"],)
        ).fetchone()
        assert current["state"] == "APPROVED"
        assert current["execution_id"] is None
        assert current["revision"] == row["revision"] + 1
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?", (row["id"],)
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.decision_recorded'",
            (row["id"],),
        ).fetchone()[0] == 1


def test_competing_consume_ids_never_commit_two_actions(env):
    created = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    approved = env.human("approver").post(
        f"/api/v1/requests/{created['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": created["revision"]},
    )
    assert approved.status_code == 200
    principal = env.auth.api_token(env.token["token"])
    fence = threading.Barrier(2)

    def consume(execution_id: str):
        fence.wait(timeout=10)
        try:
            result = env.core.consume(
                principal, created["id"],
                Consume(execution_id=execution_id, action_hash=created["action_hash"]),
            )
            return (execution_id, result["replay"])
        except GrantError as exc:
            return (execution_id, exc.code)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(consume, key) for key in ("isolated-operation-A", "isolated-operation-B")]
        results = [f.result(timeout=15) for f in futures]
    accepted = [key for key, value in results if value is False]
    denied = [value for _, value in results if isinstance(value, str)]
    assert len(accepted) == 1, results
    assert denied == ["EXECUTION_ALREADY_COMMITTED"], results
    with env.db.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT execution_id,execution_state FROM requests WHERE id=?", (created["id"],)
        ).fetchone()
        assert row["execution_id"] == accepted[0]
        assert row["execution_state"] == "COMMITTED"
        assert conn.execute(
            "SELECT count(*) FROM audit WHERE request_id=? AND action='execution.committed'",
            (created["id"],),
        ).fetchone()[0] == 1
    replay = env.core.consume(
        principal, created["id"],
        Consume(execution_id=accepted[0], action_hash=created["action_hash"]),
    )
    assert replay["replay"] is True


def test_security_metadata_preview_rejects_anomalies_without_database_mutation(env):
    admin = env.human("admin")
    payload = admin.get("/api/v1/integrations/configuration-export").json()
    with env.db.transaction(write=False) as conn:
        original = tuple(
            conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in ("audit", "integrations", "profiles", "profile_versions", "api_tokens")
        )
    candidate = json.loads(json.dumps(payload))
    candidate["policies"][0]["version"] = True
    assert admin.post("/api/v1/admin/configuration/preview", json=candidate).status_code == 422
    candidate = json.loads(json.dumps(payload))
    candidate["integrations"][0]["unexpected_field"] = "not allowed"
    assert admin.post("/api/v1/admin/configuration/preview", json=candidate).status_code == 422
    candidate = json.loads(json.dumps(payload))
    candidate["policies"][0]["action_kind"] = "unknown.anything"
    preview = admin.post("/api/v1/admin/configuration/preview", json=candidate)
    assert preview.status_code == 200
    assert preview.json()["can_apply"] is False
    assert preview.json()["preview_only"] is True
    with env.db.transaction(write=False) as conn:
        after = tuple(
            conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in ("audit", "integrations", "profiles", "profile_versions", "api_tokens")
        )
    assert after == original


def test_member_cannot_get_admin_audit_or_reuse_admin_only_preview(env):
    member = env.human("requester")
    for endpoint in (
        "/api/v1/admin/audit",
        "/api/v1/admin/audit/search",
        "/api/v1/admin/audit/export",
        "/api/v1/admin/operations",
    ):
        assert member.get(endpoint).status_code == 403
    assert member.post("/api/v1/admin/configuration/preview", json={}).status_code == 403


def test_demoted_admin_principal_cannot_read_or_mutate_using_cached_role(env):
    admin = env.human("admin")
    cached = env.auth.session(admin.cookies["grant_session"])
    req = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    with env.db.transaction() as conn:
        conn.execute("UPDATE users SET role='member' WHERE id=?", (cached.id,))
    for operation in (
        lambda: audit_search(env.db, cached),
        lambda: env.core.get(cached, req["id"]),
        lambda: env.core.list_requests(cached, view="ops_pending"),
    ):
        with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
            operation()
    assert admin.get("/api/v1/admin/audit/search").status_code == 403


def test_revoked_session_cannot_read_request_or_material_revision(env):
    original = env.human("requester").post(
        "/api/v1/requests", json=env.intake()
    ).json()
    client = env.human("admin")
    cached = env.auth.session(client.cookies["grant_session"])
    with env.db.transaction() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (cached.session_id,))
    for operation in (
        lambda: env.core.get(cached, original["id"]),
        lambda: env.core.list_requests(cached),
    ):
        with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
            operation()
    assert client.get(f"/api/v1/requests/{original['id']}").status_code == 401


def test_revoked_integration_token_cannot_query_cached_request_principal(env):
    token_actor = env.auth.api_token(env.token["token"])
    req = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE api_tokens SET enabled=0 WHERE id=?", (token_actor.id,)
        )
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.core.get(token_actor, req["id"])
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.core.list_requests(token_actor)


def test_cached_reader_scope_reduction_blocks_read_without_disabling_execution(env):
    req = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    approved = env.human("approver").post(
        f"/api/v1/requests/{req['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": req["revision"]},
    )
    assert approved.status_code == 200
    token_actor = env.auth.api_token(env.token["token"])
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE api_tokens SET scopes=? WHERE id=?",
            (json.dumps(["grant:consume", "result:write"]), token_actor.id),
        )
    with pytest.raises(GrantError, match="SCOPE_REQUIRED"):
        env.core.get(token_actor, req["id"], required_scope="request:read")
    with pytest.raises(GrantError, match="SCOPE_REQUIRED"):
        env.core.list_requests(token_actor)
    assert env.api.get(f"/api/v1/requests/{req['id']}").status_code == 403
    result = env.core.consume(
        token_actor, req["id"],
        Consume(execution_id="scoped-executor-allowed", action_hash=req["action_hash"]),
    )
    assert result["committed"] is True and result["replay"] is False


def test_admin_configuration_preview_rejects_missing_csrf_and_foreign_origin(env):
    admin = env.human("admin")
    manifest = admin.get("/api/v1/integrations/configuration-export").json()
    with env.db.transaction(write=False) as conn:
        before = tuple(
            conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in ("audit", "integrations", "profiles", "profile_versions")
        )
    csrf = admin.headers.pop("x-csrf-token")
    rejected = admin.post("/api/v1/admin/configuration/preview", json=manifest)
    assert rejected.status_code == 403, rejected.text
    admin.headers["x-csrf-token"] = csrf
    foreign = admin.post(
        "/api/v1/admin/configuration/preview",
        json=manifest,
        headers={"origin": "https://untrusted.example.invalid"},
    )
    assert foreign.status_code == 403, foreign.text
    assert foreign.json()["error"]["code"] == "CROSS_ORIGIN_REJECTED"
    with env.db.transaction(write=False) as conn:
        after = tuple(
            conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in ("audit", "integrations", "profiles", "profile_versions")
        )
    assert after == before


def test_audit_export_no_store_and_bad_json_payload_are_fail_closed(env):
    admin = env.human("admin")
    response = admin.get("/api/v1/admin/audit/export", params={"format": "json"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["content-disposition"].startswith("attachment;")
    malformed = admin.post(
        "/api/v1/admin/configuration/preview",
        content='{"schema_version":1,"schema_version":2}',
        headers={"content-type": "application/json"},
    )
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "INVALID_JSON"
