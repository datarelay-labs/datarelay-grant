"""PF-11 actual persisted Grant delivery state, never transport/business receipt."""

from grant.db import uid


def test_admin_destination_projection_is_bound_to_real_queued_outbox(env):
    admin = env.human("admin")
    result = admin.get("/api/v1/admin/notification-destinations")
    assert result.status_code == 200, result.text
    baseline = result.json()
    assert len(baseline) == 2  # SMTP and the actual registered integration.
    smtp = next(row for row in baseline if row["kind"] == "smtp")
    webhook = next(row for row in baseline if row["kind"] == "webhook")
    assert smtp["enabled"] is False  # No SMTP configured on fixture.
    assert smtp["queue"] == {"queued": 0, "retryPending": 0, "deadLetter": 0}
    assert webhook["enabled"] is True
    assert webhook["queue"] == {"queued": 0, "retryPending": 0, "deadLetter": 0}
    assert webhook["reference"].startswith("grant.webhook.")
    assert env.integration["id"] not in str(baseline)
    assert env.settings.callback_urls[0] not in str(baseline)
    assert env.human("requester").get("/api/v1/admin/notification-destinations").status_code == 403
    assert env.api.get("/api/v1/admin/notification-destinations").status_code == 403
    assert admin.get("/api/v1/admin/notification-destinations").json() == baseline


def test_aggregate_uses_stored_attempts_and_omits_recipient_secrets(env):
    admin = env.human("admin")
    requester = env.human("requester")
    request = requester.post("/api/v1/requests", json=env.intake()).json()
    with env.db.transaction() as conn:
        rows = conn.execute(
            "SELECT id,kind,state FROM outbox WHERE request_id=? ORDER BY id", (request["id"],)
        ).fetchall()
        email = next(row for row in rows if row["kind"] == "email")
        conn.execute("UPDATE outbox SET state='PENDING',attempts=2,"
                     "destination='private@example.invalid',last_error='very-secret' WHERE id=?", (email["id"],))
        conn.execute("""INSERT INTO outbox(
            id,request_id,kind,event_type,revision,payload,destination,
            state,attempts,available_at,created_at)
            VALUES(?,?, 'webhook', 'approval_outcome', 1, '{}', ?, 'FAILED', 5, 1, 1)
        """, (uid(), request["id"], "https://receiver.invalid/private/token"))
    projection = admin.get("/api/v1/admin/notification-destinations")
    assert projection.status_code == 200, projection.text
    rows = projection.json()
    smtp = next(row for row in rows if row["kind"] == "smtp")
    webhook = next(row for row in rows if row["kind"] == "webhook")
    assert smtp["queue"]["retryPending"] >= 1
    assert webhook["queue"]["deadLetter"] == 1
    assert webhook["lastOutcome"] == "dead_letter"
    assert "private@example.invalid" not in projection.text
    assert "receiver.invalid" not in projection.text
    assert "very-secret" not in projection.text
    assert "testPreview" not in projection.text
    assert "maySubmitToProductSender" not in projection.text


def test_disabling_integration_does_not_remove_historical_failed_events(env):
    admin = env.human("admin")
    with env.db.transaction() as conn:
        conn.execute("UPDATE integrations SET enabled=0 WHERE id=?", (env.integration["id"],))
    rows = admin.get("/api/v1/admin/notification-destinations").json()
    assert next(r for r in rows if r["kind"] == "webhook")["enabled"] is False
    assert len(rows) == 2
