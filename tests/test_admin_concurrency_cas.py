"""B4: two separately signed-in administrators cannot overwrite stale policy or templates.

One SQLite transaction must enforce every submitted revision, with no stale audit
or partially updated denial, verification or nine-event message fields.
"""

from copy import deepcopy

from grant.mail_templates import DEFAULT_EVENT_TEMPLATES


def admin_pair(env):
    env.auth.create_user("admin_b", "admin_b@example.invalid", env.password, "admin")
    return env.human("admin"), env.human("admin_b")


def policy_payload(env, **overrides):
    return {
        "name": "Concurrency approval",
        "integration_id": env.integration["id"],
        "approver_id": env.users["approver"]["id"],
        "action_kind": "service.concurrent",
        "denial_reason_required": False,
        "verification_mode": "EMAIL_PIN",
        **overrides,
    }


def current_policy(client, ident):
    return next(row for row in client.get("/api/v1/profiles").json() if row["id"] == ident)


def template_payload(**overrides):
    templates = deepcopy(DEFAULT_EVENT_TEMPLATES)
    return {"name": "Concurrency template set", "templates": templates, **overrides}


def current_template(client, ident):
    return next(
        row for row in client.get("/api/v1/notification-template-sets").json()
        if row["id"] == ident
    )


def test_policy_two_distinct_admins_stale_draft_save_rejected_without_audit(env):
    admin_a, admin_b = admin_pair(env)
    policy = admin_a.post("/api/v1/profiles", json=policy_payload(env)).json()
    path = f"/api/v1/profiles/{policy['id']}"
    read_a = current_policy(admin_a, policy["id"])
    read_b = current_policy(admin_b, policy["id"])
    assert read_a["updated_at"] == read_b["updated_at"]
    assert admin_b.put(path, json=policy_payload(env, name="Blind overwrite")).status_code == 422

    changed = admin_a.put(path, json=policy_payload(
        env, denial_reason_required=True, verification_mode="EMAIL_PIN_PLUS_OTP",
        expected_version_id=read_a["version_id"],
        expected_updated_at=read_a["updated_at"],
    ))
    assert changed.status_code == 200, changed.text
    assert changed.json()["updated_at"] > read_a["updated_at"]

    with env.db.transaction(write=False) as conn:
        before_audit = conn.execute(
            "SELECT COUNT(*) FROM audit WHERE action='profile.updated' "
            "AND json_extract(detail,'$.profile_id')=?", (policy["id"],)
        ).fetchone()[0]

    stale = admin_b.put(path, json=policy_payload(
        env, name="Stale unsafe name", denial_reason_required=False,
        verification_mode="EMAIL_PIN",
        expected_version_id=read_b["version_id"],
        expected_updated_at=read_b["updated_at"],
    ))
    assert stale.status_code == 409, stale.text
    assert stale.json()["error"]["code"] == "POLICY_STALE"
    current = current_policy(admin_b, policy["id"])
    assert current["denial_reason_required"] is True
    assert current["verification_mode"] == "EMAIL_PIN_PLUS_OTP"
    assert current["name"] == read_a["name"]
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE action='profile.updated' "
            "AND json_extract(detail,'$.profile_id')=?", (policy["id"],)
        ).fetchone()[0] == before_audit

    reviewed = admin_b.put(path, json=policy_payload(
        env, name="Reviewed after refresh", denial_reason_required=True,
        verification_mode="EMAIL_PIN_PLUS_OTP",
        expected_version_id=current["version_id"],
        expected_updated_at=current["updated_at"],
    ))
    assert reviewed.status_code == 200, reviewed.text


def test_policy_activated_version_cannot_be_replaced_by_stale_browser(env):
    admin_a, admin_b = admin_pair(env)
    policy = admin_a.post("/api/v1/profiles", json=policy_payload(env)).json()
    path = f"/api/v1/profiles/{policy['id']}"
    assert admin_a.post(path + "/test").status_code == 200
    assert admin_a.post(path + "/activate").status_code == 200
    original = current_policy(admin_a, policy["id"])
    stale = current_policy(admin_b, policy["id"])
    amended = admin_a.put(path, json=policy_payload(
        env, denial_reason_required=True, verification_mode="EMAIL_PIN_PLUS_MFA",
        expected_version_id=original["version_id"],
        expected_updated_at=original["updated_at"],
    ))
    assert amended.status_code == 200, amended.text
    assert amended.json()["version"] == original["version"] + 1
    fail = admin_b.put(path, json=policy_payload(
        env, name="Stale version overwrite",
        expected_version_id=stale["version_id"],
        expected_updated_at=stale["updated_at"],
    ))
    assert fail.status_code == 409, fail.text
    assert fail.json()["error"]["code"] == "POLICY_STALE"
    current = current_policy(admin_b, policy["id"])
    assert current["denial_reason_required"] is True
    assert current["verification_mode"] == "EMAIL_PIN_PLUS_MFA"
    assert current["version_id"] == amended.json()["version_id"]


def test_nine_event_template_two_admin_stale_update_rejected_atomically(env):
    admin_a, admin_b = admin_pair(env)
    saved = admin_a.post("/api/v1/notification-template-sets", json=template_payload())
    assert saved.status_code == 201, saved.text
    ident = saved.json()["id"]
    path = "/api/v1/notification-template-sets/" + ident
    read_a, read_b = current_template(admin_a, ident), current_template(admin_b, ident)
    assert admin_a.put(path, json=template_payload()).status_code == 422
    modified = deepcopy(read_a["templates"])
    modified["denied"]["body"] = "Deny reason for {{request_title}}"
    first = admin_a.put(path, json=template_payload(
        templates=modified, expected_updated_at=read_a["updated_at"],
    ))
    assert first.status_code == 200, first.text
    assert first.json()["updated_at"] > read_a["updated_at"]
    with env.db.transaction(write=False) as conn:
        audits = conn.execute(
            "SELECT COUNT(*) FROM audit WHERE action='notification_template_set.updated' "
            "AND json_extract(detail,'$.template_set_id')=?", (ident,)
        ).fetchone()[0]
    stale = admin_b.put(path, json=template_payload(
        name="B stale rename", expected_updated_at=read_b["updated_at"],
    ))
    assert stale.status_code == 409, stale.text
    assert stale.json()["error"]["code"] == "EMAIL_TEMPLATE_STALE"
    current = current_template(admin_b, ident)
    assert current["templates"]["denied"]["body"] == modified["denied"]["body"]
    assert current["name"] == read_a["name"]
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE action='notification_template_set.updated' "
            "AND json_extract(detail,'$.template_set_id')=?", (ident,)
        ).fetchone()[0] == audits


def test_legacy_template_edit_requires_revision_and_preserves_other_seven_events(env):
    admin_a, admin_b = admin_pair(env)
    payload = {
        "name": "Legacy email",
        "subject_template": "Legacy {{request_title}}",
        "body_template": "Message {{request_url}}",
        "reminder_subject_template": "Reminder {{request_title}}",
        "reminder_body_template": "Reminder {{request_url}}",
    }
    created = admin_a.post("/api/v1/email-templates", json=payload)
    assert created.status_code == 201, created.text
    ident = created.json()["id"]
    path = f"/api/v1/email-templates/{ident}"
    baseline = next(row for row in admin_b.get("/api/v1/email-templates").json()
                    if row["id"] == ident)
    assert admin_b.put(path, json=payload).status_code == 422
    saved = admin_a.put(path, json={
        **payload, "body_template": "Updated {{request_url}}",
        "expected_updated_at": baseline["updated_at"],
    })
    assert saved.status_code == 200, saved.text
    stale = admin_b.put(path, json={
        **payload, "body_template": "Stale overwrite {{request_url}}",
        "expected_updated_at": baseline["updated_at"],
    })
    assert stale.status_code == 409, stale.text
    assert stale.json()["error"]["code"] == "EMAIL_TEMPLATE_STALE"
    new = current_template(admin_b, ident)
    assert new["templates"]["requested"]["body"] == "Updated {{request_url}}"
    assert len(new["templates"]) == 9



def test_simultaneous_admin_policy_writes_allow_only_one_commit(env):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    admin_a, admin_b = admin_pair(env)
    policy = admin_a.post("/api/v1/profiles", json=policy_payload(env)).json()
    baseline = current_policy(admin_a, policy["id"])
    path = f"/api/v1/profiles/{policy['id']}"
    barrier = Barrier(2)

    def save(client, name):
        barrier.wait(timeout=5)
        return client.put(path, json=policy_payload(
            env, name=name, expected_version_id=baseline["version_id"],
            expected_updated_at=baseline["updated_at"],
        ))

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(save, admin_a, "Admin A safely edited")
        second = pool.submit(save, admin_b, "Admin B safely edited")
        results = [first.result(), second.result()]
    assert sorted(result.status_code for result in results) == [200, 409]
    assert next(result for result in results if result.status_code == 409).json()["error"]["code"] == "POLICY_STALE"
    saved = current_policy(admin_a, policy["id"])
    assert saved["name"] in ("Admin A safely edited", "Admin B safely edited")
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE action='profile.updated' "
            "AND json_extract(detail,'$.profile_id')=?", (policy["id"],)
        ).fetchone()[0] == 1


def test_simultaneous_admin_template_writes_allow_one_nine_event_set(env):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    admin_a, admin_b = admin_pair(env)
    created = admin_a.post("/api/v1/notification-template-sets", json=template_payload())
    assert created.status_code == 201, created.text
    ident = created.json()["id"]
    baseline = current_template(admin_a, ident)
    path = "/api/v1/notification-template-sets/" + ident
    barrier = Barrier(2)

    def save(client, label):
        template = deepcopy(baseline["templates"])
        template["approved"]["body"] = f"{label} approval event {{{{request_title}}}}"
        barrier.wait(timeout=5)
        return client.put(path, json=template_payload(
            templates=template, expected_updated_at=baseline["updated_at"],
        ))

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(save, admin_a, "Admin A")
        second = pool.submit(save, admin_b, "Admin B")
        results = [first.result(), second.result()]
    assert sorted(result.status_code for result in results) == [200, 409]
    assert next(result for result in results if result.status_code == 409).json()["error"]["code"] == "EMAIL_TEMPLATE_STALE"
    saved = current_template(admin_b, ident)
    assert saved["templates"]["approved"]["body"] in (
        "Admin A approval event {{request_title}}",
        "Admin B approval event {{request_title}}",
    )
    assert len(saved["templates"]) == 9
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE action='notification_template_set.updated' "
            "AND json_extract(detail,'$.template_set_id')=?", (ident,)
        ).fetchone()[0] == 1
