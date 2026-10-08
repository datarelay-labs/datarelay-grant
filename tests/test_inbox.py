"""G6 server-side inbox filtering and pagination obey principal scope."""

import time

from grant.auth import Principal
from grant.models import Delegation


def create(env, client, *, title="Inbox request", external_id=None, action=None):
    body = env.intake(
        title=title,
        **({"external_id": external_id} if external_id is not None else {}),
        **({"action": action} if action is not None else {}),
    )
    result = client.post("/api/v1/requests", json=body)
    assert result.status_code == 202, result.text
    return result.json()


def test_requester_view_and_server_search_paginate_after_filter(env):
    requester = env.human("requester")
    other = env.human("stranger")
    own = [
        create(env, requester, title=("Needle " if i % 3 == 0 else "Generic ") + str(i))
        for i in range(62)
    ]
    outsiders = [create(env, other, title="Needle outsider " + str(i)) for i in range(3)]
    assert len(outsiders) == 3

    first = requester.get(
        "/api/v1/requests", params={"view": "requester", "search": "needle", "limit": 6}
    )
    second = requester.get(
        "/api/v1/requests",
        params={"view": "requester", "search": "needle", "limit": 6, "offset": 6},
    )
    assert first.status_code == second.status_code == 200
    left, right = first.json(), second.json()
    assert len(left) == len(right) == 6
    assert len({row["id"] for row in left + right}) == 12
    own_ids = {item["id"] for item in own}
    assert all(item["id"] in own_ids and "needle" in item["title"].lower() for item in left + right)
    assert all(item["requester_id"] == env.users["requester"]["id"] for item in left + right)

    other_rows = other.get("/api/v1/requests", params={"view": "requester", "search": "needle"})
    assert {item["id"] for item in other_rows.json()} == {item["id"] for item in outsiders}
    wrong_user = requester.get(
        "/api/v1/requests", params={"requester_id": env.users["stranger"]["id"]}
    )
    assert wrong_user.status_code == 200 and wrong_user.json() == []


def test_filters_scope_state_action_policy_integration_date_and_execution(env):
    requester = env.human("requester")
    row = create(env, requester, title="Filter target")
    params = {
        "state": "AWAITING",
        "policy_id": row["profile_id"],
        "integration_id": row["integration_id"],
        "action_kind": row["action"]["kind"],
        "approver_id": row["approver_id"],
        "execution_state": "NOT_STARTED",
        "delivery_state": row["delivery_state"],
        "collaboration_state": "OPEN",
        "created_after": max(row["created_at"] - 2, 0),
        "created_before": row["created_at"] + 2,
        "search": "filter",
    }
    matched = requester.get("/api/v1/requests", params=params)
    assert matched.status_code == 200, matched.text
    assert row["id"] in {result["id"] for result in matched.json()}
    for key, replacement in (
        ("state", "DENIED"),
        ("policy_id", "not-a-real-profile"),
        ("integration_id", "not-an-integration"),
        ("action_kind", "different.action"),
        ("approver_id", "not-an-approver"),
        ("execution_state", "UNKNOWN"),
        ("delivery_state", "FAILED"),
        ("collaboration_state", "INFO_REQUESTED"),
        ("created_after", row["created_at"] + 60),
        ("created_before", row["created_at"] - 60),
    ):
        queried = requester.get("/api/v1/requests", params={**params, key: replacement})
        assert queried.status_code == 200, (key, queried.text)
        assert row["id"] not in {result["id"] for result in queried.json()}


def test_approver_views_reflect_collaboration_and_recent_decisions(env):
    requester = env.human("requester")
    approver = env.human("approver")
    a, b = create(env, requester, title="Need decision"), create(env, requester, title="Ask first")
    asked = approver.post(
        f"/api/v1/requests/{b['id']}/comments",
        json={
            "kind": "REQUEST_INFO",
            "body": "Please provide ticket",
            "expected_revision": b["revision"],
        },
    )
    assert asked.status_code == 201, asked.text
    inbox = approver.get("/api/v1/requests", params={"view": "needs"})
    assert inbox.status_code == 200
    ids = {r["id"] for r in inbox.json()}
    assert a["id"] in ids and b["id"] not in ids

    held = approver.post(
        f"/api/v1/requests/{a['id']}/decision",
        json={"decision": "HELD", "expected_revision": a["revision"]},
    )
    assert held.status_code == 200
    held_list = approver.get("/api/v1/requests", params={"view": "held"})
    assert held_list.status_code == 200
    assert a["id"] in {r["id"] for r in held_list.json()}
    approved = approver.post(
        f"/api/v1/requests/{a['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": held.json()["revision"]},
    )
    assert approved.status_code == 200
    recent = approver.get("/api/v1/requests", params={"view": "recent"})
    assert recent.status_code == 200
    assert a["id"] in {r["id"] for r in recent.json()}
    assert a["id"] not in {r["id"] for r in approver.get("/api/v1/requests", params={"view": "needs"}).json()}


def test_delegate_and_role_scoped_inbox(env):
    requester = env.human("requester")
    delegate = env.human("stranger")
    row = create(env, requester, title="Delegated work")
    now = time.time()
    env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 5, ends_at=now + 120,
        ),
    )
    delegated = delegate.get("/api/v1/requests", params={"view": "delegated"})
    assert delegated.status_code == 200
    assert row["id"] in {r["id"] for r in delegated.json()}
    assert row["id"] in {
        r["id"] for r in delegate.get("/api/v1/requests", params={"view": "needs"}).json()
    }
    assert delegate.get("/api/v1/requests", params={"view": "requester"}).json() == []
    assert env.api.get("/api/v1/requests", params={"view": "needs"}).status_code == 403

    denied = delegate.get("/api/v1/requests", params={"view": "nonexistent"})
    assert denied.status_code == 422


def test_server_pagination_has_stable_nonoverlapping_pages(env):
    requester = env.human("requester")
    rows = [create(env, requester, title=f"Bulk request {i}") for i in range(67)]
    with env.db.transaction() as conn:
        for row in rows:
            conn.execute("UPDATE requests SET created_at=100 WHERE id=?", (row["id"],))
    pages = [
        requester.get("/api/v1/requests", params={"view": "requester", "limit": 17, "offset": offset})
        for offset in (0, 17, 34, 51, 68)
    ]
    assert all(page.status_code == 200 for page in pages)
    combined = [row["id"] for page in pages for row in page.json()]
    assert len(combined) == 67
    assert len(set(combined)) == 67
    assert {row["id"] for row in rows} == set(combined)
    assert pages[-1].json() == []


def test_requester_progress_tracks_information_approval_and_execution(env):
    requester = env.human("requester")
    approver = env.human("approver")
    row = create(env, requester, title="Progress tracked")
    created = requester.get(f"/api/v1/requests/{row['id']}").json()
    assert created["approval_progress"] == {
        "mode": "SINGLE",
        "approved_count": 0,
        "required_count": 1,
        "total_members": 1,
        "waiting_approver_ids": [env.users["approver"]["id"]],
        "waiting_approvers": [
            {"id": env.users["approver"]["id"], "username": "approver"}
        ],
        "group_name": None,
        "waiting_on": "APPROVERS",
    }
    ask = approver.post(
        f"/api/v1/requests/{row['id']}/comments",
        json={"kind": "REQUEST_INFO", "body": "Need reference", "expected_revision": row["revision"]},
    )
    assert ask.status_code == 201
    pending = requester.get(f"/api/v1/requests/{row['id']}").json()
    assert pending["approval_progress"]["waiting_on"] == "REQUESTER_INFO"
    assert pending["approval_progress"]["waiting_approver_ids"] == []
    answer = requester.post(
        f"/api/v1/requests/{row['id']}/comments",
        json={"kind": "INFO_RESPONSE", "body": "Safe reference", "expected_revision": ask.json()["revision"]},
    )
    assert answer.status_code == 201
    decision = approver.post(
        f"/api/v1/requests/{row['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": answer.json()["revision"]},
    )
    assert decision.status_code == 200
    approved = requester.get(f"/api/v1/requests/{row['id']}").json()
    assert approved["approval_progress"]["approved_count"] == 1
    assert approved["approval_progress"]["waiting_on"] == "EXECUTOR"


def test_literal_search_terms_do_not_act_as_sql_wildcards(env):
    requester = env.human("requester")
    percent = create(env, requester, title="Release 100% uptime")
    underscore = create(env, requester, title="Release 100_percent")
    create(env, requester, title="Unrelated maintenance")
    for term, expected in (
        ("100%", percent["id"]),
        ("100_", underscore["id"]),
    ):
        result = requester.get("/api/v1/requests", params={"search": term})
        assert result.status_code == 200, result.text
        assert {row["id"] for row in result.json()} == {expected}
    injection = requester.get("/api/v1/requests", params={"search": "' OR 1=1 --"})
    assert injection.status_code == 200, injection.text
    assert injection.json() == []
    assert requester.get("/api/v1/requests", params={"limit": 101}).status_code == 422
    assert requester.get("/api/v1/requests", params={"offset": -1}).status_code == 422
