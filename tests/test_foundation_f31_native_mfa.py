"""F31 shared MFA primitives with Grant-native sessions and legacy recovery safety.

These tests use the real authenticated Grant API against isolated SQLite.
The Grant decision-email PIN/OTP/MFA authority remains entirely separate.
"""
from __future__ import annotations

import json

import pyotp

from grant.auth import digest


def test_f31_control_login_new_recovery_tokens_have_native_twenty_four_hex_contract(env):
    browser = env.human("requester")
    secret = browser.post("/api/v1/auth/mfa/enroll").json()["secret"]
    response = browser.post("/api/v1/auth/mfa/confirm", json={"code": pyotp.TOTP(secret).now()})
    assert response.status_code == 200, response.text
    codes = response.json()["recovery_codes"]
    assert len(codes) == 8
    assert len(set(codes)) == 8
    assert all(len(code) == 24 and all(c in "0123456789abcdef" for c in code) for code in codes)

    pending = env.human("requester")
    assert pending.get("/api/v1/auth/session").json()["state"] == "mfa_required"
    assert pending.post("/api/v1/auth/mfa/verify", json={"code": codes[0], "recovery": True}).status_code == 200
    replay = env.human("requester")
    assert replay.post("/api/v1/auth/mfa/verify", json={"code": codes[0], "recovery": True}).status_code == 401


def test_grant_native_mfa_preserves_pre_f31_twenty_hex_recovery_codes(env):
    """Already issued 20-hex recovery remains valid, single-use at the server boundary."""
    code = "abcdefabcdefabcdefab"
    assert len(code) == 20
    requester = env.human("requester")
    secret = requester.post("/api/v1/auth/mfa/enroll").json()["secret"]
    assert requester.post(
        "/api/v1/auth/mfa/confirm",
        json={"code": pyotp.TOTP(secret).now()},
    ).status_code == 200
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE users SET recovery_hashes=? WHERE id=?",
            (json.dumps([digest(code)]), env.users["requester"]["id"]),
        )
    pending = env.human("requester")
    assert pending.get("/api/v1/auth/session").json()["state"] == "mfa_required"
    assert pending.post(
        "/api/v1/auth/mfa/verify",
        json={"code": code, "recovery": True},
    ).status_code == 200
    retry = env.human("requester")
    assert retry.post(
        "/api/v1/auth/mfa/verify",
        json={"code": code, "recovery": True},
    ).status_code == 401

def test_f31_enrollment_preserves_exact_current_time_window(env, monkeypatch):
    """Grant enrollment (unlike subsequent login) never accepted an adjacent step."""
    import time as runtime_clock
    from types import SimpleNamespace

    import grant.auth as grant_auth

    client = env.human("requester")
    secret = client.post("/api/v1/auth/mfa/enroll").json()["secret"]
    fixed = int(runtime_clock.time() // 30) * 30 + 5
    previous_code = pyotp.TOTP(secret).at(fixed - 30)
    correct_code = pyotp.TOTP(secret).at(fixed)
    # New shared primitive permits one adjacent step by default; Grant must
    # explicitly retain its original, stronger enrollment contract.
    monkeypatch.setattr(grant_auth, "time", SimpleNamespace(time=lambda: float(fixed)))
    rejected = client.post("/api/v1/auth/mfa/confirm", json={"code": previous_code})
    assert rejected.status_code == 401
    assert rejected.json()["error"]["code"] == "INVALID_MFA_CODE"
    accepted = client.post("/api/v1/auth/mfa/confirm", json={"code": correct_code})
    assert accepted.status_code == 200
    assert len(accepted.json()["recovery_codes"][0]) == 24
