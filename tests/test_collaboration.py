"""G5 request collaboration never weakens explicit action-bound authorization."""

import sqlite3

from grant.db import Database


def create(env):
    response = env.human("requester").post("/api/v1/requests", json=env.intake())
    assert response.status_code == 202, response.text
    return response.json()


def post(env, actor, request_id, kind, body, revision):
    return env.human(actor).post(
        f"/api/v1/requests/{request_id}/comments",
        json={"kind": kind, "body": body, "expected_revision": revision},
    )


def test_requester_comment_and_approver_question_are_bounded_append_only(env):
    row = create(env)
    requester = post(env, "requester", row["id"], "COMMENT", "Evidence attached at case #42", row["revision"])
    assert requester.status_code == 201, requester.text
    first = requester.json()
    assert first["revision"] == row["revision"] + 1
    assert first["collaboration_state"] == "OPEN"
    assert first["action_hash"] == row["action_hash"]
    question = post(env, "approver", row["id"], "QUESTION", "Which host instance?", first["revision"])
    assert question.status_code == 201, question.text
    result = question.json()
    assert [item["kind"] for item in result["comments"]] == ["COMMENT", "QUESTION"]
    assert [item["body"] for item in result["comments"]] == [
        "Evidence attached at case #42", "Which host instance?",
    ]
    assert all(item["author_id"] in (env.users["requester"]["id"], env.users["approver"]["id"]) for item in result["comments"])
    assert result["action_hash"] == row["action_hash"]
    assert result["state"] == "AWAITING"
    assert result["execution_state"] == "NOT_STARTED"
    assert not any(key in result["comments"][0] for key in ("password", "token", "parameters"))


def test_request_more_info_blocks_approval_until_requester_responds(env):
    row = create(env)
    asked = post(env, "approver", row["id"], "REQUEST_INFO", "Please attach the change ticket ID", row["revision"])
    assert asked.status_code == 201, asked.text
    assert asked.json()["collaboration_state"] == "INFO_REQUESTED"

    denied = env.human("approver").post(
        f"/api/v1/requests/{row['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": asked.json()["revision"]},
    )
    assert denied.status_code == 409, denied.text
    assert denied.json()["error"]["code"] == "COLLABORATION_RESPONSE_REQUIRED"

    intruder = post(env, "stranger", row["id"], "INFO_RESPONSE", "I approve", asked.json()["revision"])
    assert intruder.status_code == 404, intruder.text
    unauthorized = post(env, "approver", row["id"], "INFO_RESPONSE", "Not the owner", asked.json()["revision"])
    assert unauthorized.status_code == 403, unauthorized.text

    answered = post(env, "requester", row["id"], "INFO_RESPONSE", "Ticket INC-123 (safe reference)", asked.json()["revision"])
    assert answered.status_code == 201, answered.text
    assert answered.json()["collaboration_state"] == "OPEN"
    assert answered.json()["action_hash"] == row["action_hash"]
    approved = env.human("approver").post(
        f"/api/v1/requests/{row['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": answered.json()["revision"]},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["state"] == "APPROVED"


def test_changes_requested_requires_fresh_linked_request_not_in_place_edit(env):
    row = create(env)
    changes = post(env, "approver", row["id"], "REQUEST_CHANGES", "Change the target host", row["revision"])
    assert changes.status_code == 201, changes.text
    assert changes.json()["collaboration_state"] == "CHANGES_REQUESTED"

    try_to_answer = post(env, "requester", row["id"], "INFO_RESPONSE", "Ignore changes", changes.json()["revision"])
    assert try_to_answer.status_code == 409, try_to_answer.text

    refuse_old = env.human("approver").post(
        f"/api/v1/requests/{row['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": changes.json()["revision"]},
    )
    assert refuse_old.status_code == 409
    assert refuse_old.json()["error"]["code"] == "COLLABORATION_RESPONSE_REQUIRED"

    cancelled = env.human("requester").post(
        f"/api/v1/requests/{row['id']}/cancel",
        json={"expected_revision": changes.json()["revision"], "reason": "Revising target"},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["state"] == "CANCELLED"

    new_action = env.intake(
        predecessor_id=row["id"],
        action={"kind": "service.restart", "target": "revised-service", "parameters": {"reason_code": 1}},
    )
    replacement = env.human("requester").post("/api/v1/requests", json=new_action)
    assert replacement.status_code == 202, replacement.text
    next_row = replacement.json()
    assert next_row["predecessor_id"] == row["id"]
    assert next_row["id"] != row["id"]
    assert next_row["state"] == "AWAITING"
    assert next_row["collaboration_state"] == "OPEN"
    assert next_row["action_hash"] != row["action_hash"]
    assert next_row["revision"] == 1
    assert [x["action"] for x in changes.json()["timeline"] if x["action"] == "request.collaboration"]


def test_comment_authority_payload_and_revision_guard(env):
    row = create(env)
    no_integration = env.api.post(
        f"/api/v1/requests/{row['id']}/comments",
        json={"kind": "COMMENT", "body": "not human", "expected_revision": row["revision"]},
    )
    assert no_integration.status_code == 403
    hidden = post(env, "stranger", row["id"], "COMMENT", "not a participant", row["revision"])
    assert hidden.status_code == 404
    no_requester_escalation = post(env, "requester", row["id"], "REQUEST_CHANGES", "invalid role", row["revision"])
    assert no_requester_escalation.status_code == 403
    empty = post(env, "approver", row["id"], "COMMENT", "", row["revision"])
    assert empty.status_code == 422
    oversized = post(env, "approver", row["id"], "COMMENT", "x" * 3000, row["revision"])
    assert oversized.status_code == 422
    first = post(env, "requester", row["id"], "COMMENT", "One valid comment", row["revision"])
    assert first.status_code == 201
    stale = post(env, "approver", row["id"], "QUESTION", "Outdated", row["revision"])
    assert stale.status_code == 409
    body = env.human("requester").get(f"/api/v1/requests/{row['id']}").json()
    assert len(body["comments"]) == 1
    assert body["action_hash"] == row["action_hash"]


def test_v7_to_v8_migration_preserves_requests_and_collaboration(env, tmp_path):
    row = create(env)
    destination = tmp_path / "legacy_v7.sqlite"
    env.db.backup(destination)
    with sqlite3.connect(destination) as conn:
        conn.execute("DROP TABLE request_comments")
        conn.execute("ALTER TABLE requests DROP COLUMN collaboration_state")
        conn.execute("PRAGMA user_version=7")
    upgraded = Database(destination)
    with upgraded.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 8
        persisted = conn.execute(
            "SELECT action_hash,collaboration_state FROM requests WHERE id=?", (row["id"],)
        ).fetchone()
        assert persisted["action_hash"] == row["action_hash"]
        assert persisted["collaboration_state"] == "OPEN"
        assert conn.execute("SELECT count(*) FROM request_comments").fetchone()[0] == 0


def test_replacement_comparison_exposes_material_diff_only_to_allowed_reader(env):
    original = create(env)
    changed = post(env, "approver", original["id"], "REQUEST_CHANGES", "Target needs to change", original["revision"])
    assert changed.status_code == 201
    canceled = env.human("requester").post(
        f"/api/v1/requests/{original['id']}/cancel",
        json={"expected_revision": changed.json()["revision"]},
    )
    assert canceled.status_code == 200

    replacement_input = env.intake(
        title="Restart revised target",
        predecessor_id=original["id"],
        action={"kind": "service.restart", "target": "revised-test-target", "parameters": {"reason_code": 2}},
        reason="Changed after review",
    )
    replacement = env.human("requester").post("/api/v1/requests", json=replacement_input)
    assert replacement.status_code == 202, replacement.text
    current = replacement.json()

    comparison = env.human("requester").get(f"/api/v1/requests/{current['id']}/comparison")
    assert comparison.status_code == 200, comparison.text
    diff = comparison.json()
    assert diff["predecessor_id"] == original["id"]
    assert diff["request_id"] == current["id"]
    assert diff["predecessor_state"] == "CANCELLED"
    assert diff["action_changed"] is True
    assert diff["fresh_approval_required"] is True
    assert diff["changes"]["action.target"] == {
        "before": "test-service", "after": "revised-test-target",
    }
    assert diff["changes"]["action.parameters"] == {
        "before": {"reason_code": 1}, "after": {"reason_code": 2},
    }
    assert diff["changes"]["title"]["after"] == "Restart revised target"
    assert not any("secret" in key or "password" in key for key in diff["changes"])
    assert env.human("stranger").get(f"/api/v1/requests/{current['id']}/comparison").status_code == 404
    assert env.human("approver").get(f"/api/v1/requests/{current['id']}/comparison").status_code == 200
    assert env.human("requester").get(f"/api/v1/requests/{original['id']}/comparison").status_code == 409


def test_linked_replacement_cannot_silently_change_requester_identity(env):
    original = create(env)
    canceled = env.human("requester").post(
        f"/api/v1/requests/{original['id']}/cancel",
        json={"expected_revision": original["revision"]},
    )
    assert canceled.status_code == 200
    forged = env.human("admin").post(
        "/api/v1/requests",
        json=env.intake(predecessor_id=original["id"], title="Forbidden takeover"),
    )
    assert forged.status_code == 403, forged.text
    assert forged.json()["error"]["code"] == "PREDECESSOR_OWNER_MISMATCH"


def test_pending_information_excluded_from_approvers_need_decision_queue(env):
    row = create(env)
    requested = post(env, "approver", row["id"], "REQUEST_INFO", "Please explain", row["revision"])
    assert requested.status_code == 201
    pending = env.human("approver").get(f"/api/v1/requests/{row['id']}")
    assert pending.json()["viewer_assigned"] is True
    assert pending.json()["viewer_can_decide"] is False
    responded = post(env, "requester", row["id"], "INFO_RESPONSE", "Additional context", requested.json()["revision"])
    assert responded.status_code == 201
    resumed = env.human("approver").get(f"/api/v1/requests/{row['id']}")
    assert resumed.json()["viewer_can_decide"] is True
