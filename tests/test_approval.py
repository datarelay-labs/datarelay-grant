import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from grant.errors import GrantError
from grant.models import Cancel, Consume, Integration, ProfileUpdate


def create(env, body=None):
    response = env.api.post("/api/v1/requests", json=body or env.intake())
    assert response.status_code == 202, response.text
    return response.json()


def approve(env, row, decision="APPROVED"):
    response = env.human("approver").post(
        f"/api/v1/requests/{row['id']}/decision",
        json={"decision": decision, "expected_revision": row["revision"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_request_approval_execution_result(env):
    row = create(env)
    path = f"/api/v1/requests/{row['id']}"
    grant = {"execution_id": "consumer-operation-1", "action_hash": row["action_hash"]}
    assert env.api.post(path + "/consume", json=grant).status_code == 409
    row = approve(env, row)
    assert row["state"] == "APPROVED"
    assert row["delivery_state"] == "PENDING"
    assert row["execution_state"] == "NOT_STARTED"
    assert env.api.post(path + "/consume", json=grant).json()["replay"] is False
    assert env.api.post(path + "/consume", json=grant).json()["replay"] is True
    assert (
        env.api.post(path + "/consume", json={**grant, "execution_id": "different"}).status_code
        == 409
    )
    assert (
        env.api.post(path + "/consume", json={**grant, "action_hash": "f" * 64}).status_code == 409
    )
    result = {**grant, "status": "REPORTED_SUCCEEDED", "evidence": "consumer-ledger:test-1"}
    assert env.api.post(path + "/result", json=result).status_code == 200
    assert env.api.post(path + "/result", json=result).status_code == 200
    assert (
        env.api.post(path + "/result", json={**result, "status": "REPORTED_FAILED"}).status_code
        == 409
    )
    assert env.api.get(path).json()["execution_state"] == "REPORTED_SUCCEEDED"


@pytest.mark.parametrize("state", ["HELD", "DENIED"])
def test_hold_or_deny_never_authorizes(env, state):
    original = create(env)
    row = approve(env, original, state)
    assert row["deadline"] == original["deadline"]
    assert row["grant_until"] is None
    assert (
        env.api.post(
            f"/api/v1/requests/{row['id']}/consume",
            json={"execution_id": "x", "action_hash": row["action_hash"]},
        ).status_code
        == 409
    )


def test_idempotent_intake_and_conflicting_change(env):
    body = env.intake()
    row = create(env, body)
    assert create(env, body)["id"] == row["id"]
    assert env.api.post("/api/v1/requests", json={**body, "title": "Changed"}).status_code == 409
    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT count(*) FROM requests").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM outbox").fetchone()[0] == 1


def test_human_external_id_conflict_uses_integration_uniqueness_key(env):
    body = env.intake(external_id="human-idempotency")
    first = env.human("requester").post("/api/v1/requests", json=body)
    assert first.status_code == 202, first.text
    with env.db.transaction() as conn:
        conn.execute(
            "INSERT INTO profiles(id,name,integration_id,approver_id,action_kind,deadline_seconds,reminder_seconds,max_reminders,grant_seconds,enabled) VALUES(?,?,?,?,?,?,?,?,?,0)",
            ("other-profile", "Other", env.integration["id"], env.users["approver"]["id"], "service.restart", 86400, 3600, 3, 900),
        )
    conflict = env.human("stranger").post(
        "/api/v1/requests", json={**body, "profile_id": "other-profile"}
    )
    assert conflict.status_code in (404, 409)
    assert conflict.status_code != 500


def test_human_idempotency_uses_active_version_integration_while_draft_changes_target(env):
    requester = env.human("requester")
    body = env.intake(external_id="human-active-version-idempotency")
    first = requester.post("/api/v1/requests", json=body)
    assert first.status_code == 202, first.text

    secondary = env.core.create_integration(
        env.admin,
        Integration(
            name="Secondary DataRelay",
            kind="datarelay",
            callback_url=env.settings.callback_urls[0],
        ),
    )
    env.core.update_profile(
        env.admin,
        env.profile["id"],
        ProfileUpdate(
            name=env.profile["name"],
            integration_id=secondary["id"],
            approver_id=env.profile["approver_id"],
            action_kind=env.profile["action_kind"],
            email_template_id=env.profile["email_template_id"],
            deadline_seconds=env.profile["deadline_seconds"],
            reminder_seconds=env.profile["reminder_seconds"],
            max_reminders=env.profile["max_reminders"],
            grant_seconds=env.profile["grant_seconds"],
            tenant_selector=env.profile["tenant_selector"],
            environment=env.profile["environment"],
            severity=env.profile["severity"],
            risk_level=env.profile["risk_level"],
        ),
    )

    replay = requester.post("/api/v1/requests", json=body)
    assert replay.status_code == 202, replay.text
    assert replay.json()["id"] == first.json()["id"]


def test_duplicate_decision_is_not_duplicate_event(env):
    row = create(env)
    client = env.human("approver")
    path = f"/api/v1/requests/{row['id']}/decision"
    body = {"decision": "APPROVED", "expected_revision": 1}
    assert client.post(path, json=body).status_code == 200
    assert client.post(path, json=body).status_code == 200
    assert client.post(path, json={**body, "decision": "DENIED"}).status_code == 409
    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT count(*) FROM outbox WHERE kind='webhook'").fetchone()[0] == 1


def test_expiry_is_not_human_denial(env):
    row = create(env)
    with env.db.transaction() as conn:
        conn.execute("UPDATE requests SET deadline=? WHERE id=?", (time.time() - 1, row["id"]))
    response = env.human("approver").post(
        f"/api/v1/requests/{row['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": 1},
    )
    assert response.status_code == 409
    state = env.api.get(f"/api/v1/requests/{row['id']}").json()
    assert state["state"] == "EXPIRED" and state["decision"] is None
    assert any(e["actor"] == "policy" for e in state["timeline"])


def test_cancel_preserves_decision_and_blocks_execution(env):
    row = approve(env, create(env))
    path = f"/api/v1/requests/{row['id']}"
    response = env.api.post(path + "/cancel", json={"expected_revision": row["revision"]})
    assert response.status_code == 200
    assert response.json()["decision"] == "APPROVED"
    assert response.json()["state"] == "CANCELLED"
    assert (
        env.api.post(
            path + "/consume", json={"execution_id": "x", "action_hash": row["action_hash"]}
        ).status_code
        == 409
    )


def test_cancel_consume_race_has_one_winner(env):
    row = approve(env, create(env))
    principal = env.auth.api_token(env.token["token"])

    def cancel():
        return env.core.cancel(principal, row["id"], Cancel(expected_revision=row["revision"]))

    def consume():
        return env.core.consume(
            principal, row["id"], Consume(execution_id="race-1", action_hash=row["action_hash"])
        )

    def guarded(fn):
        try:
            return (True, fn())
        except GrantError:
            return (False, None)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(guarded, [cancel, consume]))
    assert sum(success for success, _ in results) == 1
    final = env.core.get(principal, row["id"])
    assert (final["state"] == "CANCELLED") != bool(final["execution_id"])


def test_cancel_after_deadline_commits_expiry_instead(env):
    row = create(env)
    with env.db.transaction() as conn:
        conn.execute("UPDATE requests SET deadline=? WHERE id=?", (time.time() - 1, row["id"]))

    response = env.api.post(
        f"/api/v1/requests/{row['id']}/cancel",
        json={"expected_revision": row["revision"], "reason": "too late"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "REQUEST_EXPIRED"
    current = env.api.get(f"/api/v1/requests/{row['id']}").json()
    assert current["state"] == "EXPIRED"
    assert current["decision"] is None


def test_cancel_after_execution_grant_expiry_preserves_human_decision(env):
    row = approve(env, create(env))
    with env.db.transaction() as conn:
        conn.execute("UPDATE requests SET grant_until=? WHERE id=?", (time.time() - 1, row["id"]))

    response = env.api.post(
        f"/api/v1/requests/{row['id']}/cancel",
        json={"expected_revision": row["revision"], "reason": "too late"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "REQUEST_EXPIRED"
    current = env.api.get(f"/api/v1/requests/{row['id']}").json()
    assert current["state"] == "EXPIRED"
    assert current["decision"] == "APPROVED"
