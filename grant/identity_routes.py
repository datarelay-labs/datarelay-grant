"""Authenticated self-service identity adapter routes."""

import time
from datetime import UTC, datetime

from fastapi import Request, Response

from .auth import digest
from .db import audit
from .models import Login, MfaCode, PasswordChange


def iso(value):
    return datetime.fromtimestamp(value, UTC).isoformat()


def register_identity(app, human):
    db, auth, settings = app.state.db, app.state.auth, app.state.settings

    def set_session(response, token, pending=False):
        response.set_cookie(
            "grant_session",
            token,
            httponly=True,
            secure=not settings.dev_mode,
            samesite="strict",
            max_age=300 if pending else settings.session_seconds,
            path="/",
        )

    @app.post("/api/v1/auth/login")
    def login(body: Login, request: Request, response: Response):
        token, pending = auth.login(
            body.username, body.password, request.client.host if request.client else "unknown"
        )
        set_session(response, token, pending)
        return {"state": "mfa_required" if pending else "authenticated", "csrf": auth.csrf(token)}

    @app.get("/api/v1/auth/session")
    def session(request: Request):
        principal = human(request, allow_pending=True)
        token = request.cookies["grant_session"]
        with db.transaction(write=False) as conn:
            pending = conn.execute(
                "SELECT mfa_pending FROM sessions WHERE token_hash=?", (digest(token),)
            ).fetchone()[0]
        return {
            "state": "mfa_required" if pending else "authenticated",
            "user": None if pending else auth.user(principal),
            "csrf": auth.csrf(token),
        }

    @app.post("/api/v1/auth/logout")
    def logout(request: Request, response: Response):
        principal = human(request, allow_pending=True)
        with db.transaction() as conn:
            conn.execute("DELETE FROM sessions WHERE id=?", (principal.session_id,))
        response.delete_cookie("grant_session", path="/")
        return {"state": "signed_out"}

    @app.post("/api/v1/auth/password")
    def password(body: PasswordChange, request: Request, response: Response):
        auth.change_password(human(request), body.current_password, body.new_password)
        response.delete_cookie("grant_session", path="/")
        return {"state": "sign_in_required"}

    @app.post("/api/v1/auth/mfa/enroll")
    def enroll(request: Request):
        return auth.enroll(human(request))

    @app.post("/api/v1/auth/mfa/confirm")
    def confirm(body: MfaCode, request: Request):
        return {"recovery_codes": auth.confirm_enrollment(human(request), body.code)}

    @app.post("/api/v1/auth/mfa/verify")
    def verify(body: MfaCode, request: Request, response: Response):
        human(request, allow_pending=True)
        token = request.cookies["grant_session"]
        auth.verify_mfa(token, body.code, body.recovery)
        set_session(response, token)
        return {"state": "authenticated", "csrf": auth.csrf(token)}

    @app.get("/api/v1/auth/sessions")
    def sessions(request: Request):
        principal = human(request)
        with db.transaction(write=False) as conn:
            rows = conn.execute(
                "SELECT * FROM sessions WHERE user_id=? AND expires_at>? AND mfa_pending=0",
                (principal.id, time.time()),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "createdAt": iso(r["created_at"]),
                "expiresAt": iso(r["expires_at"]),
                "current": r["id"] == principal.session_id,
                "revocable": True,
            }
            for r in rows
        ]

    @app.delete("/api/v1/auth/sessions/{session_id}")
    def revoke_session(session_id: str, request: Request):
        principal = human(request)
        with db.transaction() as conn:
            conn.execute(
                "DELETE FROM sessions WHERE id=? AND user_id=?", (session_id, principal.id)
            )
            audit(conn, None, principal.id, "session.revoked", {"session_id": session_id})
        return {"revoked": True}
