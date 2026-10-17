"""G10A mailbox fanout remains seat-scoped and stage-aware."""

import time

from grant.auth import Principal
from grant.models import ApproverGroup, Delegation, Profile


def create_group_request(env, mode):
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name=f"G10A fanout {mode}",
            member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]],
        ),
    )
    profile = env.core.create_profile(
        env.admin,
        Profile(
            name=f"G10A mail fanout {mode}",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            approval_mode=mode,
            approver_group_id=group["id"],
            action_kind=f"service.mail-{mode.lower()}",
        ),
    )
    env.core.transition_profile(env.admin, profile["id"], "TESTING")
    active = env.core.transition_profile(env.admin, profile["id"], "ACTIVE")
    resp = env.human("requester").post(
        "/api/v1/requests", json=env.intake(
            profile_id=profile["id"],
            action={"kind": active["action_kind"], "target": "test", "parameters": {}},
        ),
    )
    assert resp.status_code == 202, resp.text
    return resp.json()


def outgoing(env, request_id):
    with env.db.transaction(write=False) as conn:
        messages = conn.execute(
            "SELECT destination,event_type,payload FROM outbox WHERE request_id=? AND kind='email' ORDER BY created_at,id",
            (request_id,),
        ).fetchall()
    return [{
        "email": env.settings.unseal(row["destination"])["email"],
        "event": row["event_type"],
        "payload": row["payload"],
    } for row in messages]


def test_all_parallel_seats_have_distinct_mailboxes_without_shared_cc(env):
    request = create_group_request(env, "ALL")
    issued = outgoing(env, request["id"])
    assert len(issued) == 2
    assert {x["email"] for x in issued} == {
        env.users["approver"]["email"], env.users["stranger"]["email"],
    }
    assert all(x["event"] == "requested" for x in issued)
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM approval_assignments WHERE request_id=?",
            (request["id"],),
        ).fetchone()[0] == 2


def test_sequential_hold_never_notifies_a_later_step(env):
    request = create_group_request(env, "SEQUENTIAL")
    assert [x["email"] for x in outgoing(env, request["id"])] == [
        env.users["approver"]["email"],
    ]
    first = env.human("approver").post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": "HELD", "expected_revision": request["revision"]},
    )
    assert first.status_code == 200
    assert len(outgoing(env, request["id"])) == 1
    cleared = env.human("approver").post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": first.json()["revision"]},
    )
    assert cleared.status_code == 200
    assert cleared.json()["state"] == "AWAITING"
    deliveries = outgoing(env, request["id"])
    assert len(deliveries) == 2
    assert deliveries[-1]["email"] == env.users["stranger"]["email"]


def test_delegate_mail_is_distinct_but_represents_one_seat(env):
    now = time.time()
    env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1, ends_at=now + 3600,
        ),
    )
    request = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    messages = outgoing(env, request["id"])
    assert len(messages) == 2
    assert {x["email"] for x in messages} == {
        env.users["approver"]["email"], env.users["stranger"]["email"],
    }
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM approval_assignments WHERE request_id=?",
            (request["id"],),
        ).fetchone()[0] == 1
