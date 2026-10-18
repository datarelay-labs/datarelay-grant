"""SM-2 authenticated IANA display-timezone persistence contracts."""

import json


def test_user_override_and_admin_default_resolve_without_changing_utc_storage(env):
    member = env.human("requester")
    admin = env.human("admin")

    initial = member.get("/api/v1/auth/display-timezone")
    assert initial.status_code == 200, initial.text
    assert initial.json() == {
        "override": None,
        "default": "UTC",
        "effective": "UTC",
        "storage_timezone": "UTC",
    }

    changed_default = admin.put(
        "/api/v1/admin/display-timezone",
        json={"timezone": "Asia/Seoul", "expected_timezone": "UTC"},
    )
    assert changed_default.status_code == 200, changed_default.text
    assert changed_default.json()["default"] == "Asia/Seoul"

    inherited = member.get("/api/v1/auth/display-timezone").json()
    assert inherited["override"] is None
    assert inherited["effective"] == "Asia/Seoul"
    assert inherited["storage_timezone"] == "UTC"

    override = member.put(
        "/api/v1/auth/display-timezone",
        json={"timezone": "America/New_York", "expected_timezone": None},
    )
    assert override.status_code == 200, override.text
    assert override.json()["override"] == "America/New_York"
    assert override.json()["default"] == "Asia/Seoul"
    assert override.json()["effective"] == "America/New_York"
    assert override.json()["storage_timezone"] == "UTC"

    cleared = member.put(
        "/api/v1/auth/display-timezone",
        json={"timezone": None, "expected_timezone": "America/New_York"},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["override"] is None
    assert cleared.json()["effective"] == "Asia/Seoul"

    info = admin.get("/api/v1/admin/info")
    assert info.status_code == 200
    facts = {row["id"]: row["value"] for row in info.json()["facts"]}
    assert facts["time"] == "UTC"
    assert facts["display_timezone_default"] == "Asia/Seoul"

    with env.db.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 15
        row = conn.execute(
            "SELECT display_timezone FROM users WHERE id=?",
            (env.users["requester"]["id"],),
        ).fetchone()
        assert row["display_timezone"] is None
        assert conn.execute(
            "SELECT value FROM runtime WHERE key='display_timezone_default'"
        ).fetchone()[0] == "Asia/Seoul"
        events = conn.execute(
            """SELECT actor,action,detail FROM audit
               WHERE action IN ('display_timezone.user_updated',
                                'display_timezone.default_updated')
               ORDER BY at,id"""
        ).fetchall()
        assert [event["action"] for event in events] == [
            "display_timezone.default_updated",
            "display_timezone.user_updated",
            "display_timezone.user_updated",
        ]
        assert all("password" not in event["detail"].lower() for event in events)
        assert json.loads(events[0]["detail"])["timezone"] == "Asia/Seoul"


def test_timezone_validation_cas_and_roles_fail_closed(env):
    member = env.human("requester")
    admin = env.human("admin")

    for bad in ("Seoul", "../UTC", "Etc/Not_A_Zone", "Asia/Seoul\x00"):
        response = member.put(
            "/api/v1/auth/display-timezone",
            json={"timezone": bad, "expected_timezone": None},
        )
        assert response.status_code == 422, (bad, response.text)

    assert member.get("/api/v1/admin/display-timezone").status_code == 403
    assert member.put(
        "/api/v1/admin/display-timezone",
        json={"timezone": "UTC", "expected_timezone": "UTC"},
    ).status_code == 403

    first = member.put(
        "/api/v1/auth/display-timezone",
        json={"timezone": "Asia/Seoul", "expected_timezone": None},
    )
    assert first.status_code == 200
    stale = member.put(
        "/api/v1/auth/display-timezone",
        json={"timezone": "Europe/London", "expected_timezone": None},
    )
    assert stale.status_code == 409

    admin_first = admin.put(
        "/api/v1/admin/display-timezone",
        json={"timezone": "Europe/London", "expected_timezone": "UTC"},
    )
    assert admin_first.status_code == 200
    admin_stale = admin.put(
        "/api/v1/admin/display-timezone",
        json={"timezone": "UTC", "expected_timezone": "UTC"},
    )
    assert admin_stale.status_code == 409
