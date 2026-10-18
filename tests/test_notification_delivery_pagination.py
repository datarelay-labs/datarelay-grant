"""G2 admin delivery health must not lose failures beyond newest 200 records.

All deliveries are synthetic rows in a per-test disposable SQLite database.
No SMTP or webhook worker is invoked by these GET requests.
"""
from __future__ import annotations

import time


def populate(env):
    response = env.api.post(
        "/api/v1/requests", json=env.intake(title="Notification paging fixture")
    )
    assert response.status_code == 202, response.text
    request_id = response.json()["id"]
    anchor = time.time() - 3600
    with env.db.transaction() as conn:
        conn.execute(
            "DELETE FROM outbox WHERE request_id=? AND kind='email'",
            (request_id,),
        )
        for number in range(235):
            state = "FAILED" if number == 0 else (
                "PENDING" if number % 4 == 0 else "DELIVERED"
            )
            event = "reminder" if number % 2 == 0 else "requested"
            conn.execute(
                """INSERT INTO outbox(
                   id,request_id,kind,event_type,revision,payload,destination,
                   state,attempts,last_error,available_at,created_at
                 ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    f"fixture-mail-{number:03d}", request_id, "email", event,
                    response.json()["revision"], "fixture-private-payload",
                    "fixture-private-destination", state, 1,
                    "fixture-timeout" if state == "FAILED" else None,
                    anchor + number, anchor + number,
                ),
            )
    return request_id


def test_admin_delivery_pages_find_old_failure_beyond_legacy_first_200(env):
    request_id = populate(env)
    admin = env.human("admin")
    result = admin.get("/api/v1/notification-deliveries")
    assert result.status_code == 200, result.text
    original_shape = result.json()
    # The newest two records share a timestamp; sorting by ID breaks ties
    # deterministically, including across changing page boundaries.
    with env.db.transaction() as conn:
        conn.execute(
            """UPDATE outbox SET created_at=(
                 SELECT created_at FROM outbox WHERE id='fixture-mail-234'
               ) WHERE id='fixture-mail-233'"""
        )
    result = admin.get("/api/v1/notification-deliveries")
    original_shape = result.json()
    assert [item["id"] for item in original_shape["deliveries"][:2]] == [
        "fixture-mail-234", "fixture-mail-233",
    ]
    assert len(original_shape["deliveries"]) == 200  # existing default preserved
    assert original_shape["total"] == 235
    assert original_shape["offset"] == 0
    assert original_shape["limit"] == 200
    assert original_shape["has_more"] is True
    assert all(row["id"] != "fixture-mail-000" for row in original_shape["deliveries"])

    previous = admin.get("/api/v1/notification-deliveries", params={
        "limit": 100, "offset": 100,
    })
    last = admin.get("/api/v1/notification-deliveries", params={
        "limit": 100, "offset": 200,
    })
    assert previous.status_code == last.status_code == 200
    assert len(last.json()["deliveries"]) == 35
    assert last.json()["has_more"] is False
    assert last.json()["deliveries"][-1]["id"] == "fixture-mail-000"
    assert previous.json()["total"] == last.json()["total"] == 235
    assert {x["id"] for x in previous.json()["deliveries"]}.isdisjoint(
        x["id"] for x in last.json()["deliveries"]
    )

    failed = admin.get("/api/v1/notification-deliveries", params={
        "state": "FAILED", "limit": 20,
    })
    assert failed.status_code == 200, failed.text
    assert failed.json()["total"] == 1
    assert failed.json()["deliveries"][0]["id"] == "fixture-mail-000"
    assert failed.json()["deliveries"][0]["event_type"] == "reminder"
    assert failed.json()["deliveries"][0]["request_id"] == request_id
    assert failed.json()["deliveries"][0]["transport_accepted"] is False
    assert failed.json()["deliveries"][0]["receipt_confirmed"] is False
    assert "fixture-private-destination" not in failed.text
    assert "fixture-private-payload" not in failed.text

    filtered = admin.get("/api/v1/notification-deliveries", params={
        "state": "PENDING", "event_type": "reminder",
        "request_id": request_id, "limit": 50,
    })
    assert filtered.status_code == 200
    assert 0 < filtered.json()["total"] < 235
    assert all(
        row["state"] == "PENDING"
        and row["event_type"] == "reminder"
        and row["request_id"] == request_id
        for row in filtered.json()["deliveries"]
    )
    missing = admin.get("/api/v1/notification-deliveries", params={
        "request_id": "nonexistent-bounded-request-id",
    })
    assert missing.status_code == 200
    assert missing.json()["total"] == 0
    assert missing.json()["deliveries"] == []
    assert missing.json()["has_more"] is False

    # Read/filter never alters retry state or sends a notification.
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM outbox WHERE kind='email' AND state='FAILED'"
        ).fetchone()[0] == 1


def test_delivery_filters_fail_closed_on_invalid_query_and_role_change(env):
    admin = env.human("admin")
    for params in (
        {"state": "REISSUE"},
        {"event_type": "unknown"},
        {"limit": 201}, {"limit": 0}, {"offset": -1},
        {"request_id": "x" * 201},
    ):
        result = admin.get("/api/v1/notification-deliveries", params=params)
        assert result.status_code == 422, (params, result.text)
    assert env.human("requester").get(
        "/api/v1/notification-deliveries", params={"state": "FAILED"}
    ).status_code == 403
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE users SET role='member' WHERE id=?",
            (env.users["admin"]["id"],),
        )
    assert admin.get("/api/v1/notification-deliveries").status_code in (401, 403)
