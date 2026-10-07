"""Read-only common administration projections for Foundation."""

from fastapi import Request

from . import __version__
from .db import audit
from .errors import GrantError
from .models import NewUser


def register_admin(app, actor):
    @app.get("/api/v1/admin/info")
    def info(request: Request):
        actor(request).require_admin()
        return {
            "facts": [
                {"id": "version", "label": "Version", "value": __version__},
                {
                    "id": "deployment",
                    "label": "Deployment",
                    "value": "Single organization; development candidate",
                },
                {"id": "time", "label": "Stored time", "value": "UTC"},
                {"id": "origin", "label": "Service origin", "value": app.state.settings.origin},
            ]
        }

    @app.get("/api/v1/admin/users")
    def users(request: Request):
        actor(request).require_admin()
        with app.state.db.transaction(write=False) as conn:
            rows = conn.execute(
                "SELECT id,username,email,role,enabled FROM users ORDER BY username"
            ).fetchall()
        return [
            {
                "id": r["id"],
                "displayName": r["username"],
                "detail": r["email"],
                "role": {"value": r["role"], "label": r["role"]},
                "status": "enabled" if r["enabled"] else "disabled",
            }
            for r in rows
        ]

    @app.post("/api/v1/admin/users", status_code=201)
    def create_user(body: NewUser, request: Request):
        principal = actor(request)
        principal.require_admin()
        return app.state.auth.create_user(
            body.username, body.email, body.password, body.role, principal.id
        )

    @app.post("/api/v1/admin/users/{ident}/disable")
    def disable_user(ident: str, request: Request):
        principal = actor(request)
        principal.require_admin()
        if ident == principal.id:
            raise GrantError("CANNOT_DISABLE_CURRENT_ACCOUNT", 409)
        with app.state.db.transaction() as conn:
            if not conn.execute("SELECT id FROM users WHERE id=?", (ident,)).fetchone():
                raise GrantError("ACCOUNT_NOT_FOUND", 404)
            conn.execute("UPDATE users SET enabled=0 WHERE id=?", (ident,))
            conn.execute("DELETE FROM sessions WHERE user_id=?", (ident,))
            audit(conn, None, principal.id, "user.disabled", {"user_id": ident})
        return {"id": ident, "enabled": False}

    @app.get("/api/v1/admin/audit")
    def audits(request: Request):
        from .identity_routes import iso

        actor(request).require_admin()
        with app.state.db.transaction(write=False) as conn:
            rows = conn.execute("SELECT * FROM audit ORDER BY at DESC LIMIT 200").fetchall()
        return [
            {
                "id": r["id"],
                "timestamp": iso(r["at"]),
                "action": r["action"],
                "actor": r["actor"],
                "reference": r["request_id"] or "",
                "summary": r["detail"],
            }
            for r in rows
        ]

    @app.get("/api/v1/admin/health")
    def health(request: Request):
        actor(request).require_admin()
        with app.state.db.transaction(write=False) as conn:
            failed = conn.execute("SELECT count(*) FROM outbox WHERE state='FAILED'").fetchone()[0]
            paused = (
                conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"
            )
        smtp = bool(app.state.settings.smtp_host)
        return {
            "status": "healthy" if smtp and not failed and not paused else "degraded",
            "checks": [
                {"id": "database", "label": "Approval database", "status": "healthy"},
                {
                    "id": "mail",
                    "label": "SMTP configured",
                    "status": "healthy" if smtp else "degraded",
                },
                {
                    "id": "delivery",
                    "label": "Failed deliveries",
                    "status": "degraded" if failed else "healthy",
                    "detail": str(failed),
                },
                {
                    "id": "recovery",
                    "label": "Recovery pause",
                    "status": "degraded" if paused else "healthy",
                },
            ],
        }

    @app.get("/api/v1/openapi.json")
    def schema(request: Request):
        actor(request).require_admin()
        return app.openapi()

    @app.post("/api/v1/admin/mail-test")
    def mail_test(request: Request):
        from .db import json_text, uid
        from .transport import send_email

        principal = actor(request)
        principal.require_admin()
        app.state.auth.rate("mail-test:" + principal.id, 5, 60)
        user = app.state.auth.user(principal)
        event_id = uid()
        payload = json_text(
            {
                "subject": "[Grant] Delivery configuration test",
                "body": "This is a test notification. It does not approve or execute any action.",
            }
        )
        try:
            send_email(app.state.settings, {"email": user["email"]}, payload, event_id)
        except Exception as exc:
            raise GrantError("EMAIL_TEST_FAILED", 502) from exc
        with app.state.db.transaction() as conn:
            audit(conn, None, principal.id, "email.test_accepted", {"event_id": event_id})
        return {"smtp_accepted": True, "event_id": event_id}
