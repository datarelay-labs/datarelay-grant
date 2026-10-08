"""Read-only common administration projections for Foundation."""

from typing import Literal

from fastapi import Query, Request, Response

from . import __version__
from .audit_evidence import audit_export, audit_search, request_chain, sanitized_detail
from .auth import require_current_authority
from .configuration_preview import preview_configuration
from .db import audit
from .errors import GrantError
from .models import NewUser
from .operations import operations_summary


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
            body.username, body.email, body.password, body.role, principal
        )

    @app.post("/api/v1/admin/users/{ident}/disable")
    def disable_user(ident: str, request: Request):
        principal = actor(request)
        principal.require_admin()
        if ident == principal.id:
            raise GrantError("CANNOT_DISABLE_CURRENT_ACCOUNT", 409)
        with app.state.db.transaction() as conn:
            require_current_authority(conn, principal)
            if not conn.execute("SELECT id FROM users WHERE id=?", (ident,)).fetchone():
                raise GrantError("ACCOUNT_NOT_FOUND", 404)
            conn.execute("UPDATE users SET enabled=0 WHERE id=?", (ident,))
            conn.execute("DELETE FROM sessions WHERE user_id=?", (ident,))
            audit(conn, None, principal.id, "user.disabled", {"user_id": ident})
        return {"id": ident, "enabled": False}

    @app.get("/api/v1/admin/audit")
    def audits(request: Request):
        from .identity_routes import iso

        principal = actor(request)
        principal.require_admin()
        with app.state.db.transaction(write=False) as conn:
            require_current_authority(conn, principal)
            rows = conn.execute(
                "SELECT * FROM audit ORDER BY at DESC,id DESC LIMIT 200"
            ).fetchall()
        # Retain the Foundation AuditList adapter shape but do not leak
        # untrusted free-text audit details into that older projection.
        import json

        return [
            {
                "id": row["id"],
                "timestamp": iso(row["at"]),
                "action": row["action"],
                "actor": row["actor"],
                "reference": row["request_id"] or "",
                "summary": json.dumps(sanitized_detail(row["detail"]), sort_keys=True),
            }
            for row in rows
        ]

    @app.get("/api/v1/admin/audit/search")
    def search_audit(
        request: Request,
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0, le=100000),
        action: str | None = Query(None, max_length=128),
        actor_id: str | None = Query(None, alias="actor", max_length=128),
        request_id: str | None = Query(None, max_length=100),
        search: str = Query("", max_length=100),
        since: float | None = Query(None, ge=0),
        until: float | None = Query(None, ge=0),
    ):
        return audit_search(
            app.state.db, actor(request),
            limit=limit, offset=offset, action=action, actor=actor_id,
            request_id=request_id, search=search, since=since, until=until,
        )

    @app.get("/api/v1/admin/audit/export")
    def export_audit(
        request: Request,
        format: Literal["csv", "json"] = "json",
        limit: int = Query(1000, ge=1, le=1000),
        offset: int = Query(0, ge=0, le=100000),
        action: str | None = Query(None, max_length=128),
        actor_id: str | None = Query(None, alias="actor", max_length=128),
        request_id: str | None = Query(None, max_length=100),
        search: str = Query("", max_length=100),
        since: float | None = Query(None, ge=0),
        until: float | None = Query(None, ge=0),
    ):
        content = audit_export(
            app.state.db, actor(request),
            fmt=format, limit=limit, offset=offset,
            action=action, actor=actor_id, request_id=request_id,
            search=search, since=since, until=until,
        )
        return Response(
            content=content,
            media_type="text/csv; charset=utf-8" if format == "csv" else "application/json",
            headers={
                "Content-Disposition": f'attachment; filename="grant-audit-export.{format}"',
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    @app.get("/api/v1/admin/audit/chain/{ident}")
    def audit_chain(ident: str, request: Request):
        return request_chain(app.state.db, actor(request), ident)

    @app.post("/api/v1/admin/configuration/preview")
    def configuration_import_preview(payload: dict, request: Request):
        return preview_configuration(app.state.db, actor(request), payload)

    @app.get("/api/v1/admin/operations")
    def operations(request: Request):
        principal = actor(request)
        principal.require_admin()
        # Maintenance can transition expired requests and schedule notifications.
        # Revalidate the current session before allowing those side effects.
        with app.state.db.transaction(write=False) as conn:
            require_current_authority(conn, principal)
        app.state.core.maintenance()
        return operations_summary(app.state.db, principal)

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
        # Revocation or role changes after session validation must not leave
        # the test-mail endpoint with authority to send a new message.
        with app.state.db.transaction(write=False) as conn:
            require_current_authority(conn, principal)
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
