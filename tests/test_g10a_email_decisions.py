"""G10A mailbox capability: inert GET, scoped PIN, explicit terminal POST."""

import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from grant.auth import Principal
from grant.models import ApproverGroup, Delegation, Profile


def messages(env, request_id):
    with env.db.transaction(write=False) as conn:
        rows = conn.execute(
            """SELECT * FROM outbox WHERE request_id=? AND issuance_id IS NOT NULL
               ORDER BY created_at,id""",
            (request_id,),
        ).fetchall()
    result = []
    for row in rows:
        body = env.settings.unseal(row["payload"])["body"]
        assert row["sealed_payload"] == 1
        pin = re.search(r"Four-digit confirmation PIN: ([0-9]{4})", body)
        assert pin
        links = {}
        for label in ("Approve", "Hold", "Deny"):
            found = re.search(label + r": (https?://[^\s]+)", body)
            assert found
            links[{"Approve": "APPROVED", "Hold": "HELD", "Deny": "DENIED"}[label]] = (
                found.group(1).split("/")[-1]
            )
        result.append({
            "recipient_id": row["recipient_id"],
            "email": env.settings.unseal(row["destination"])["email"],
            "pin": pin.group(1),
            "links": links,
            "sealed": row["payload"],
            "issuance_id": row["issuance_id"],
        })
    return result


def create(env, *, profile_id=None, kind=None):
    action = (
        {"kind": kind, "target": "test-service", "parameters": {}}
        if kind else env.intake()["action"]
    )
    response = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=profile_id or env.profile["id"],
            action=action,
        ),
    )
    assert response.status_code == 202, response.text
    return response.json()


def group(env, mode="ALL"):
    g = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name="G10A PIN group",
            member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]],
        ),
    )
    p = env.core.create_profile(
        env.admin,
        Profile(
            name="G10A PIN",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            approval_mode=mode,
            approver_group_id=g["id"],
            action_kind="service.pin-group",
        ),
    )
    env.core.transition_profile(env.admin, p["id"], "TESTING")
    env.core.transition_profile(env.admin, p["id"], "ACTIVE")
    return create(env, profile_id=p["id"], kind="service.pin-group")


def preview(env, token):
    return env.api.get("/api/v1/decision-intents/" + token)


def verify(env, token, pin):
    return env.api.post(
        f"/api/v1/decision-intents/{token}/verify",
        json={"pin": pin}, headers={"Origin": env.settings.origin},
    )


def confirm(env, token, context, reason=""):
    return env.api.post(
        f"/api/v1/decision-intents/{token}/confirm",
        json={"confirmation_token": context, "reason": reason},
        headers={"Origin": env.settings.origin},
    )


def complete(env, mailbox, outcome, reason=""):
    token = mailbox["links"][outcome]
    verified = verify(env, token, mailbox["pin"])
    assert verified.status_code == 200, verified.text
    return confirm(env, token, verified.json()["confirmation_token"], reason)


def test_readonly_link_requires_pin_then_explicit_confirm_and_no_execution(env):
    item = create(env)
    mail = messages(env, item["id"])[0]
    token = mail["links"]["APPROVED"]
    with env.db.transaction(write=False) as conn:
        previous = {
            name: conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
            for name in ("audit", "rate_limits", "request_decisions", "outbox")
        }
    first = preview(env, token)
    assert first.status_code == 200, first.text
    assert first.json()["outcome"] == "APPROVED"
    assert first.json()["details_visible"] is False
    assert "test-service" not in first.text
    head = env.api.head("/api/v1/decision-intents/" + token)
    assert head.status_code == 204
    with env.db.transaction(write=False) as conn:
        after = {
            name: conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
            for name in previous
        }
    assert after == previous
    invalid_origin = env.api.post(
        f"/api/v1/decision-intents/{token}/verify", json={"pin": mail["pin"]},
    )
    assert invalid_origin.status_code == 403
    wrong = verify(env, token, "9999" if mail["pin"] != "9999" else "9998")
    assert wrong.status_code == 403
    good = verify(env, token, mail["pin"])
    assert good.status_code == 200, good.text
    assert good.json()["request"]["title"] == item["title"]
    assert good.json()["verified_person_id"] is None
    assert good.json()["execution_allowed"] is False
    assert env.api.get(f"/api/v1/requests/{item['id']}").status_code == 200
    before = env.api.get(f"/api/v1/requests/{item['id']}").json()
    assert before["state"] == "AWAITING"
    saved = confirm(env, token, good.json()["confirmation_token"])
    assert saved.status_code == 200, saved.text
    assert saved.json()["state"] == "APPROVED"
    assert saved.json()["verified_person_id"] is None
    repeat = confirm(env, token, good.json()["confirmation_token"])
    assert repeat.status_code in (404, 409)
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?", (item["id"],)
        ).fetchone()[0] == 1
        updated = conn.execute("SELECT execution_id,decision_actor FROM requests WHERE id=?", (item["id"],)).fetchone()
        assert updated["execution_id"] is None
        assert updated["decision_actor"] is None
        event = conn.execute(
            "SELECT detail FROM audit WHERE request_id=? AND action='request.decision_recorded'",
            (item["id"],),
        ).fetchone()
        data = json.loads(event["detail"])
        assert data["actor_assurance"] == "EMAIL_LINK_PIN"
        assert data["verified_person_id"] is None
        assert data["mailbox_recipient_id"] == env.users["approver"]["id"]
    assert mail["pin"] not in mail["sealed"]
    assert token not in mail["sealed"]


def test_independent_parallel_link_survives_other_seat_revision(env):
    item = group(env)
    people = {m["recipient_id"]: m for m in messages(env, item["id"])}
    assert len(people) == 2
    first = people[env.users["approver"]["id"]]
    second = people[env.users["stranger"]["id"]]
    assert first["pin"] != second["pin"] or first["links"] != second["links"]
    held = complete(env, first, "HELD")
    assert held.status_code == 200, held.text
    assert held.json()["state"] == "HELD"
    one = complete(env, second, "APPROVED")
    assert one.status_code == 200, one.text
    assert one.json()["state"] == "HELD"
    assert preview(env, first["links"]["APPROVED"]).status_code == 200
    two = complete(env, first, "APPROVED")
    assert two.status_code == 200, two.text
    assert two.json()["state"] == "APPROVED"
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?",
            (item["id"],),
        ).fetchone()[0] == 2


def test_original_and_delegate_first_terminal_wins_under_concurrency(env):
    now = time.time()
    delegation = env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1, ends_at=now + 3600,
        ),
    )
    item = create(env)
    mail = messages(env, item["id"])
    assert len(mail) == 2
    assert mail[0]["issuance_id"] != mail[1]["issuance_id"]
    contexts = []
    for mailbox in mail:
        verified = verify(env, mailbox["links"]["APPROVED"], mailbox["pin"])
        assert verified.status_code == 200, verified.text
        contexts.append(verified.json()["confirmation_token"])
    fence = threading.Barrier(2)

    def race(index):
        with TestClient(env.app) as client:
            fence.wait(timeout=10)
            return client.post(
                f"/api/v1/decision-intents/{mail[index]['links']['APPROVED']}/confirm",
                json={"confirmation_token": contexts[index]},
                headers={"Origin": env.settings.origin},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(race, (0, 1)))
    assert results.count(200) == 1, results
    assert any(code in (404, 409) for code in results)
    assert env.core.get(env.admin, item["id"])["state"] == "APPROVED"
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?",
            (item["id"],),
        ).fetchone()[0] == 1
    assert delegation["id"]


def test_delegate_revocation_does_not_remove_original_link(env):
    now = time.time()
    original = Principal(env.users["approver"]["id"], "human", "member")
    delegation = env.core.create_delegation(
        original,
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1, ends_at=now + 3600,
        ),
    )
    item = create(env)
    mail = {m["recipient_id"]: m for m in messages(env, item["id"])}
    env.core.revoke_delegation(original, delegation["id"])
    revoked = preview(env, mail[env.users["stranger"]["id"]]["links"]["APPROVED"])
    assert revoked.status_code == 404
    remaining = mail[env.users["approver"]["id"]]
    assert preview(env, remaining["links"]["APPROVED"]).status_code == 200


def test_wrong_pin_locks_issuance_without_approval(env):
    item = create(env)
    mail = messages(env, item["id"])[0]
    for value in range(5):
        invalid = f"{value:04d}" if f"{value:04d}" != mail["pin"] else "9999"
        assert verify(env, mail["links"]["DENIED"], invalid).status_code == 403
    assert verify(env, mail["links"]["DENIED"], mail["pin"]).status_code == 404
    with env.db.transaction(write=False) as conn:
        state = conn.execute(
            "SELECT state,failed_attempts FROM decision_issuances WHERE id=?",
            (mail["issuance_id"],),
        ).fetchone()
        assert state["state"] == "LOCKED"
        assert state["failed_attempts"] == 5
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?", (item["id"],)
        ).fetchone()[0] == 0


def test_pin_lockout_requires_explicit_admin_reissue_and_keeps_deadline(env):
    item = create(env)
    first = messages(env, item["id"])[0]
    for attempt in range(5):
        guess = f"{attempt:04d}"
        if guess == first["pin"]:
            guess = "9999"
        assert verify(env, first["links"]["APPROVED"], guess).status_code == 403
    with env.db.transaction() as conn:
        conn.execute("UPDATE requests SET next_reminder=0 WHERE id=?", (item["id"],))
    env.core.maintenance()
    # A reminder cannot automatically erase a PIN lockout.
    assert len(messages(env, item["id"])) == 1
    endpoint = f"/api/v1/admin/requests/{item['id']}/decision-links/reissue"
    attempt_by_member = env.human("approver").post(
        endpoint, json={"recipient_user_id": env.users["approver"]["id"],
                        "reason": "Account owner reissue"},
    )
    assert attempt_by_member.status_code == 403
    admin = env.human("admin")
    reissued = admin.post(
        endpoint, json={"recipient_user_id": env.users["approver"]["id"],
                        "reason": "Secure lockout recovery"},
    )
    assert reissued.status_code == 200, reissued.text
    assert reissued.json()["expires_no_later_than"] == item["deadline"]
    updated = messages(env, item["id"])[-1]
    assert updated["issuance_id"] != first["issuance_id"]
    assert updated["links"]["APPROVED"] != first["links"]["APPROVED"]
    assert preview(env, first["links"]["APPROVED"]).status_code == 404
    assert complete(env, updated, "APPROVED").status_code == 200
    with env.db.transaction(write=False) as conn:
        events = conn.execute(
            "SELECT detail FROM audit WHERE request_id=? AND action='decision.issuance_reissued'",
            (item["id"],),
        ).fetchall()
        assert len(events) == 1
        assert json.loads(events[0]["detail"])["reason"] == "Secure lockout recovery"


def test_required_deny_reason_is_server_enforced_before_intent_consumption(env):
    profile = env.core.create_profile(
        env.admin, Profile(
            name="G10A PIN denial",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind="service.pin-denial",
            denial_reason_required=True,
        ),
    )
    env.core.transition_profile(env.admin, profile["id"], "TESTING")
    env.core.transition_profile(env.admin, profile["id"], "ACTIVE")
    item = create(env, profile_id=profile["id"], kind="service.pin-denial")
    mail = messages(env, item["id"])[0]
    denied = mail["links"]["DENIED"]
    verification = verify(env, denied, mail["pin"])
    assert verification.status_code == 200, verification.text
    context = verification.json()["confirmation_token"]
    without = confirm(env, denied, context, "   ")
    assert without.status_code == 422
    assert without.json()["error"]["code"] == "DENIAL_REASON_REQUIRED"
    assert env.core.get(env.admin, item["id"])["state"] == "AWAITING"
    with_reason = confirm(env, denied, context, "Material risk")
    assert with_reason.status_code == 200, with_reason.text
    assert with_reason.json()["state"] == "DENIED"


def test_expired_link_and_old_revoked_mail_do_not_validate(env, monkeypatch):
    from grant.transport import Worker

    now = time.time()
    original = Principal(env.users["approver"]["id"], "human", "member")
    delegation = env.core.create_delegation(
        original,
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1, ends_at=now + 3600,
        ),
    )
    item = create(env)
    mail = {m["recipient_id"]: m for m in messages(env, item["id"])}
    # Same-email PINs and links were sealed in the outbox, not plain JSON.
    with env.db.transaction(write=False) as conn:
        assert all(
            "Four-digit confirmation" not in row["payload"]
            for row in conn.execute(
                "SELECT payload FROM outbox WHERE request_id=? AND kind='email'",
                (item["id"],),
            ).fetchall()
        )
    env.core.revoke_delegation(original, delegation["id"])
    sent = []
    monkeypatch.setattr(
        "grant.transport.send_email",
        lambda _settings, to, payload, _id: sent.append((to["email"], json.loads(payload))),
    )
    monkeypatch.setattr("grant.transport.send_webhook", lambda *args: None)
    Worker(env.db, env.settings).tick()
    assert all(to != env.users["stranger"]["email"] for to, _ in sent)
    assert any(to == env.users["approver"]["email"] for to, _ in sent)
    assert all("html" in content and "_decision_pin" in content for _, content in sent)
    # Explicit token expiry remains read-only and fails closed.
    active = mail[env.users["approver"]["id"]]
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE decision_issuances SET expires_at=? WHERE id=?",
            (now - 1, active["issuance_id"]),
        )
    assert preview(env, active["links"]["APPROVED"]).status_code == 404



def test_disabling_original_revokes_delegate_email_and_authenticated_authority(env):
    now = time.time()
    original = Principal(env.users["approver"]["id"], "human", "member")
    env.core.create_delegation(
        original,
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1, ends_at=now + 3600,
        ),
    )
    item = create(env)
    delegated = {m["recipient_id"]: m for m in messages(env, item["id"])}[
        env.users["stranger"]["id"]
    ]
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE users SET enabled=0 WHERE id=?", (env.users["approver"]["id"],),
        )
    assert preview(env, delegated["links"]["APPROVED"]).status_code == 404
    denied = env.human("stranger").post(
        f"/api/v1/requests/{item['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": item["revision"]},
    )
    # After revocation the substitute cannot even enumerate this request.
    assert denied.status_code == 404, denied.text
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?",
            (item["id"],),
        ).fetchone()[0] == 0


def test_mailbox_address_change_revokes_old_token_and_rotates_on_reminder(env):
    item = create(env)
    old = messages(env, item["id"])[0]
    new_email = "changed-mailbox@example.invalid"
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE users SET email=? WHERE id=?",
            (new_email, env.users["approver"]["id"]),
        )
        conn.execute("UPDATE requests SET next_reminder=0 WHERE id=?", (item["id"],))
    assert preview(env, old["links"]["APPROVED"]).status_code == 404
    env.core.maintenance()
    current = messages(env, item["id"])[-1]
    assert current["email"] == new_email
    assert current["issuance_id"] != old["issuance_id"]
    assert preview(env, current["links"]["APPROVED"]).status_code == 200


def test_sealed_email_materializes_plain_and_html_only_inside_transport(env, monkeypatch):
    from dataclasses import replace

    from grant.transport import send_email

    item = create(env)
    mail = messages(env, item["id"])[0]
    # The encrypted payload is converted to MIME only at delivery time, not
    # in public API, logs, outbox metadata, or plaintext SQLite records.
    with env.db.transaction(write=False) as conn:
        queued = conn.execute(
            "SELECT * FROM outbox WHERE issuance_id=?", (mail["issuance_id"],)
        ).fetchone()
    body = env.settings.unseal(queued["payload"])
    captured = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            assert host == "localhost"
            assert timeout == 10

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def ehlo(self):
            pass

        def send_message(self, message):
            captured.append(message)

    monkeypatch.setattr("grant.transport.smtplib.SMTP", FakeSMTP)
    settings = replace(env.settings, smtp_host="localhost", smtp_starttls=False)
    send_email(settings, {"email": mail["email"]}, json.dumps(body), queued["id"])
    assert len(captured) == 1
    sent = captured[0]
    assert sent["To"] == mail["email"]
    assert sent["Cc"] is None
    assert sent.get_content_type() == "multipart/alternative"
    assert mail["links"]["APPROVED"] in sent.get_body(preferencelist=("plain",)).get_content()
    assert "Four-digit confirmation PIN" in sent.get_body(preferencelist=("html",)).get_content()


def test_restored_backup_never_reactivates_previous_mail_capability(env, tmp_path):
    from dataclasses import replace

    from grant.core import Core
    from grant.db import Database
    from grant.decision_links import DecisionLinks

    item = create(env)
    mail = messages(env, item["id"])[0]
    backup = tmp_path / "g10a-protected-backup.sqlite"
    recovered = tmp_path / "g10a-protected-restored.sqlite"
    env.db.backup(backup)
    Database.restore(backup, recovered)
    restored_db = Database(recovered)
    recovered_settings = replace(env.settings, database=recovered)
    with restored_db.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 11
        stored = conn.execute(
            "SELECT payload FROM outbox WHERE issuance_id=?", (mail["issuance_id"],),
        ).fetchone()[0]
        assert mail["pin"] not in stored
    restored_links = DecisionLinks(restored_db, recovered_settings)
    from grant.errors import GrantError
    with pytest.raises(GrantError, match="RECOVERY_RECONCILIATION_REQUIRED"):
        restored_links.preview(mail["links"]["APPROVED"])
    Core(restored_db, recovered_settings).resume_after_restore(acknowledged=True)
    with pytest.raises(GrantError, match="DECISION_LINK_UNAVAILABLE"):
        restored_links.preview(mail["links"]["APPROVED"])
