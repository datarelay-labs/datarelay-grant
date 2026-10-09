"""G7 operational metrics reconcile with authoritative, role-scoped requests."""

import time

from grant.db import Database


def create(env, *, title="Operator request", client=None):
    requester = client if client is not None else env.human("requester")
    result = requester.post(
        "/api/v1/requests", json=env.intake(title=title)
    )
    assert result.status_code == 202, result.text
    return result.json()


def decision(env, row, value):
    result = env.human("approver").post(
        f"/api/v1/requests/{row['id']}/decision",
        json={"decision": value, "expected_revision": row["revision"]},
    )
    assert result.status_code == 200, result.text
    return result.json()


def test_operations_requires_current_admin_and_starts_at_zero(env):
    admin = env.human("admin")
    result = admin.get("/api/v1/admin/operations")
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["counts"]["total"] == 0
    assert body["counts"]["pending"] == 0
    assert body["counts"]["email_failed"] == 0
    assert body["approval_latency_seconds"] is None
    assert len(body["integrations"]) == 1
    assert body["integrations"][0]["health"] == "not_verified"
    assert body["integrations"][0]["last_callback_accepted_at"] is None
    assert "destination" not in body["integrations"][0]
    assert "token" not in str(body)
    assert env.human("requester").get("/api/v1/admin/operations").status_code == 403
    assert env.api.get("/api/v1/admin/operations").status_code == 403
    blocked_view = env.human("approver").get(
        "/api/v1/requests", params={"view": "ops_email_failed"}
    )
    assert blocked_view.status_code == 403


def test_operations_metrics_match_actionable_exception_queues(env):
    admin = env.human("admin")
    pending = create(env, title="Waiting operation")
    held = create(env, title="Held operation")
    decision(env, held, "HELD")
    denied = create(env, title="Denied operation")
    decision(env, denied, "DENIED")
    cancelled = create(env, title="Cancelled operation")
    result = env.human("requester").post(
        f"/api/v1/requests/{cancelled['id']}/cancel",
        json={"expected_revision": cancelled["revision"]},
    )
    assert result.status_code == 200, result.text
    expired = create(env, title="Expired operation")
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE requests SET deadline=? WHERE id=?",
            (time.time() - 5, expired["id"]),
        )
    unused = create(env, title="Approved unused")
    decision(env, unused, "APPROVED")
    failed = create(env, title="Failed execution")
    decision(env, failed, "APPROVED")
    unknown = create(env, title="Unknown execution")
    decision(env, unknown, "APPROVED")
    for row, status in ((failed, "REPORTED_FAILED"), (unknown, "UNKNOWN")):
        claim = {"execution_id": row["id"], "action_hash": row["action_hash"]}
        assert env.api.post(
            f"/api/v1/requests/{row['id']}/consume", json=claim
        ).status_code == 200
        report = env.api.post(
            f"/api/v1/requests/{row['id']}/result",
            json={**claim, "status": status, "evidence": "isolated operator test"},
        )
        assert report.status_code == 200, report.text
    with env.db.transaction() as conn:
        mail = conn.execute(
            "SELECT id FROM outbox WHERE request_id=? AND kind='email' LIMIT 1",
            (pending["id"],),
        ).fetchone()
        assert mail is not None
        conn.execute("UPDATE outbox SET state='FAILED' WHERE id=?", (mail["id"],))
        conn.execute(
            """INSERT INTO outbox(
               id,request_id,kind,event_type,revision,payload,destination,available_at,created_at
            ) SELECT ?,id,'webhook','approval_outcome',revision,'{}','fixture-sealed',
                     created_at,created_at FROM requests WHERE id=?""",
            ("failed-webhook", pending["id"]),
        )
        conn.execute("UPDATE outbox SET state='FAILED' WHERE id='failed-webhook'")

    response = admin.get("/api/v1/admin/operations")
    assert response.status_code == 200, response.text
    counts = response.json()["counts"]
    assert counts["total"] == 8
    assert counts["pending"] == 2
    assert counts["held"] == 1
    assert counts["denied"] == 1
    assert counts["expired"] == 1
    assert counts["cancelled"] == 1
    assert counts["approved_unused"] == 1
    assert counts["execution_failed"] == 1
    assert counts["execution_unknown"] == 1
    assert counts["email_failed"] == 1
    assert counts["webhook_failed"] == 1
    assert counts["delivery_failed"] == 1
    assert counts["overdue"] == 1
    assert response.json()["approval_latency_seconds"] is not None

    mappings = {
        "ops_pending": "pending",
        "ops_overdue": "overdue",
        "ops_approved_unused": "approved_unused",
        "ops_execution_unknown": "execution_unknown",
        "ops_execution_failed": "execution_failed",
        "ops_email_failed": "email_failed",
        "ops_webhook_failed": "webhook_failed",
        "ops_delivery_failed": "delivery_failed",
    }
    for view, metric in mappings.items():
        items = admin.get("/api/v1/requests", params={"view": view})
        assert items.status_code == 200, (view, items.text)
        assert len(items.json()) == counts[metric], (view, metric, items.json())
    for state, metric in (("HELD", "held"), ("DENIED", "denied"),
                          ("EXPIRED", "expired"), ("CANCELLED", "cancelled")):
        rows = admin.get("/api/v1/requests", params={"state": state})
        assert rows.status_code == 200, (state, rows.text)
        assert len(rows.json()) == counts[metric]
    assert len(admin.get("/api/v1/requests", params={"view": "ops_decided"}).json()) >= 4
    assert env.human("requester").get(
        "/api/v1/requests", params={"view": "ops_pending"}
    ).status_code == 403


def test_operational_totals_are_not_capped_by_request_page_size(env):
    requester = env.human("requester")
    for i in range(113):
        create(env, title=f"Pending bulk operation {i}", client=requester)
    admin = env.human("admin")
    metrics = admin.get("/api/v1/admin/operations")
    assert metrics.status_code == 200
    assert metrics.json()["counts"]["pending"] == 113
    pages = [
        admin.get("/api/v1/requests", params={"view": "ops_pending", "limit": 100, "offset": i})
        for i in (0, 100)
    ]
    assert all(page.status_code == 200 for page in pages)
    assert len(pages[0].json()) == 100
    assert len(pages[1].json()) == 13


def test_restored_database_preserves_preexisting_operational_metrics(env, tmp_path):
    item = create(env)
    original = env.human("admin").get("/api/v1/admin/operations").json()
    destination = tmp_path / "operations-restored.sqlite"
    env.db.backup(destination)
    restored = Database(destination)
    with restored.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12
        rows = conn.execute("SELECT state FROM requests").fetchall()
        assert [r["state"] for r in rows] == ["AWAITING"]
        assert conn.execute(
            "SELECT id FROM requests WHERE id=?", (item["id"],)
        ).fetchone() is not None
    after = env.human("admin").get("/api/v1/admin/operations").json()
    assert after["counts"] == original["counts"]


def test_approved_grant_expiry_is_not_misclassified_as_overdue_approval(env):
    requester = env.human("requester")
    row = create(env, title="Grant expires after approval", client=requester)
    approved = decision(env, row, "APPROVED")
    assert approved["state"] == "APPROVED"
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE requests SET deadline=?,grant_until=? WHERE id=?",
            (time.time() - 10, time.time() - 3, row["id"]),
        )
    admin = env.human("admin")
    body = admin.get("/api/v1/admin/operations")
    assert body.status_code == 200, body.text
    assert body.json()["counts"]["expired"] == 1
    assert body.json()["counts"]["overdue"] == 0
    queue = admin.get("/api/v1/requests", params={"view": "ops_overdue"})
    assert queue.status_code == 200
    assert queue.json() == []


def test_integration_callback_accepted_is_transport_only(env):
    requester = env.human("requester")
    row = create(env, title="Callback delivery", client=requester)
    import time
    now = time.time()
    with env.db.transaction() as conn:
        conn.execute(
            """INSERT INTO outbox(
                 id,request_id,kind,event_type,revision,payload,destination,
                 state,delivered_at,available_at,created_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                "observed-webhook", row["id"], "webhook", "approval_outcome",
                row["revision"], "{}", "sealed-test-destination",
                "DELIVERED", now, now, now,
            ),
        )
    response = env.human("admin").get("/api/v1/admin/operations")
    assert response.status_code == 200, response.text
    integration = response.json()["integrations"][0]
    assert integration["health"] == "transport_accepted"
    assert integration["last_callback_accepted_at"] == now
    assert integration["request_count"] == 1
    assert integration["failed_callback_events"] == 0
    assert "destination" not in integration
    assert env.human("requester").get(
        f"/api/v1/requests/{row['id']}"
    ).json()["execution_state"] == "NOT_STARTED"


def test_recovery_paused_is_reported_without_inventing_outcomes(env):
    row = create(env)
    before = env.human("admin").get("/api/v1/admin/operations").json()
    with env.db.transaction() as conn:
        conn.execute("UPDATE runtime SET value='1' WHERE key='paused'")
    after = env.human("admin").get("/api/v1/admin/operations")
    assert after.status_code == 200, after.text
    assert after.json()["recovery_paused"] is True
    assert after.json()["counts"] == before["counts"]
    assert env.human("requester").get(
        f"/api/v1/requests/{row['id']}"
    ).json()["execution_state"] == "NOT_STARTED"


def test_recovered_webhook_is_not_an_unresolved_integration_failure(env):
    import time

    row = create(env, title="Recovery from callback error")
    now = time.time()
    with env.db.transaction() as conn:
        for ident, state, created, delivered in (
            ("callback-first-failed", "FAILED", now - 10, None),
            ("callback-next-success", "DELIVERED", now, now),
        ):
            conn.execute(
                """INSERT INTO outbox(
                     id,request_id,kind,event_type,revision,payload,destination,
                     state,delivered_at,available_at,created_at
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (ident, row["id"], "webhook", "approval_outcome",
                 row["revision"], "{}", "sealed-fixture",
                 state, delivered, created, created),
            )
    admin = env.human("admin")
    summary = admin.get("/api/v1/admin/operations")
    assert summary.status_code == 200, summary.text
    integration = summary.json()["integrations"][0]
    assert integration["last_callback_accepted_at"] == now
    assert integration["failed_callback_events"] == 0
    assert integration["health"] == "transport_accepted"
    queue = admin.get("/api/v1/requests", params={"view": "ops_webhook_failed"})
    assert queue.status_code == 200
    assert queue.json() == []
    assert summary.json()["counts"]["webhook_failed"] == 0


def test_operational_latency_median_and_sample_count_reconcile_with_decisions(env):
    admin = env.human("admin")
    empty = admin.get("/api/v1/admin/operations").json()
    assert empty["approval_latency_seconds"] is None
    assert empty["approval_latency_median_seconds"] is None
    assert empty["approval_latency_sample_count"] == 0

    # Long-tail durations deliberately separate average from median.
    durations = (60.0, 120.0, 3600.0, 240.0)
    base = time.time() - 7200
    for index, elapsed in enumerate(durations):
        row = create(env, title=f"Decided latency {index}")
        decision(env, row, "DENIED")
        started_at = base + 600 * index
        with env.db.transaction() as conn:
            conn.execute(
                "UPDATE requests SET created_at=?,decision_at=? WHERE id=?",
                (started_at, started_at + elapsed, row["id"]),
            )
        summary = admin.get("/api/v1/admin/operations").json()
        assert summary["approval_latency_sample_count"] == index + 1
        if index == 2:
            assert summary["approval_latency_seconds"] == 1260.0
            assert summary["approval_latency_median_seconds"] == 120.0

    # Even sample size: midpoint is the mean of the two middle observations.
    final = admin.get("/api/v1/admin/operations").json()
    assert final["approval_latency_seconds"] == 1005.0
    assert final["approval_latency_median_seconds"] == 180.0
    pending = create(env, title="Still pending")
    held = create(env, title="Held; not final")
    decision(env, held, "HELD")
    final_again = admin.get("/api/v1/admin/operations").json()
    assert final_again["approval_latency_sample_count"] == 4
    assert final_again["approval_latency_median_seconds"] == 180.0
    assert final_again["approval_latency_seconds"] == 1005.0
    queue = admin.get("/api/v1/requests", params={"view": "ops_decided"})
    assert queue.status_code == 200
    assert len(queue.json()) == final_again["approval_latency_sample_count"]
    assert pending["id"] not in [x["id"] for x in queue.json()]
    assert env.human("requester").get("/api/v1/admin/operations").status_code == 403
