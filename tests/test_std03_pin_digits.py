"""STD-03 optional six-digit email PIN with legacy four-digit continuity."""

from dataclasses import replace

import pytest
from pydantic import ValidationError

from grant.core import Core
from grant.decision_links import DecisionLinks
from grant.models import Intake, IntentPin


def test_pin_digits_installation_policy_rejects_unsupported_lengths(env):
    from grant.config import Settings

    for digits in (0, 3, 5, 7, 10):
        with pytest.raises(ValueError, match="decision_pin_digits"):
            replace(env.settings, decision_pin_digits=digits)
    assert Settings.__dataclass_fields__["decision_pin_digits"].default == 4
    for code in ("0000", "000000"):
        assert IntentPin(pin=code).pin == code
    for code in ("123", "12345", "1234567", "1234x6", "１２３４５６"):
        with pytest.raises(ValidationError):
            IntentPin(pin=code)


def test_new_six_digit_pin_remains_bound_after_operator_setting_returns_to_four(env):
    settings = replace(env.settings, decision_pin_digits=6)
    core = Core(env.db, settings)
    actor = env.auth.api_token(env.token["token"])
    request = core.create_request(actor, Intake(**env.intake()))
    with env.db.transaction(write=False) as conn:
        mail = conn.execute(
            """SELECT payload,issuance_id FROM outbox
               WHERE request_id=? AND issuance_id IS NOT NULL
               ORDER BY created_at LIMIT 1""",
            (request["id"],),
        ).fetchone()
        digest = conn.execute(
            "SELECT pin_digest FROM decision_issuances WHERE id=?",
            (mail["issuance_id"],),
        ).fetchone()[0]
    raw = settings.unseal(mail["payload"])
    pin = raw["_decision_pin"]
    token = raw["_decision_tokens"]["APPROVED"]
    assert len(pin) == 6 and pin.isascii() and pin.isdigit()
    assert digest.startswith("6:") and pin not in digest
    assert "Six-digit confirmation PIN: " + pin in raw["body"]

    # Operator settings are not allowed to retroactively relabel an issued PIN.
    legacy_settings = replace(settings, decision_pin_digits=4)
    preview = DecisionLinks(env.db, legacy_settings).preview(token)
    assert preview["pin_digits"] == 6
    assert preview["details_visible"] is False
    assert preview["execution_allowed"] is False
    assert env.api.post(
        f"/api/v1/decision-intents/{token}/verify",
        json={"pin": pin[:4]}, headers={"Origin": env.settings.origin},
    ).status_code == 403
    verified = env.api.post(
        f"/api/v1/decision-intents/{token}/verify",
        json={"pin": pin}, headers={"Origin": env.settings.origin},
    )
    assert verified.status_code == 200, verified.text
    saved = env.api.post(
        f"/api/v1/decision-intents/{token}/confirm",
        json={"confirmation_token": verified.json()["confirmation_token"]},
        headers={"Origin": env.settings.origin},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["state"] == "APPROVED"
    assert core.get(env.admin, request["id"])["execution_state"] == "NOT_STARTED"


def test_existing_four_digit_digest_format_unchanged(env):
    core = Core(env.db, env.settings)
    row = core.create_request(env.auth.api_token(env.token["token"]), Intake(**env.intake()))
    with env.db.transaction(write=False) as conn:
        mail = conn.execute(
            "SELECT issuance_id,payload FROM outbox WHERE request_id=? "
            "AND issuance_id IS NOT NULL LIMIT 1", (row["id"],),
        ).fetchone()
        digest = conn.execute(
            "SELECT pin_digest FROM decision_issuances WHERE id=?", (mail["issuance_id"],),
        ).fetchone()[0]
    material = env.settings.unseal(mail["payload"])
    assert len(material["_decision_pin"]) == 4
    assert len(digest) == 64 and ":" not in digest
    assert DecisionLinks(env.db, env.settings).preview(
        material["_decision_tokens"]["APPROVED"],
    )["pin_digits"] == 4
