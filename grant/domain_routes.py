"""Small request, profile and integration HTTP surface."""

from fastapi import Query, Request

from .models import Cancel, Consume, Decision, Intake, Integration, Profile, Result, Token


def register_domain(app, actor, human, reader):
    core, auth, worker = app.state.core, app.state.auth, app.state.worker

    @app.get("/api/v1/requests")
    def requests(
        request: Request, limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0)
    ):
        return core.list_requests(reader(request), limit, offset)

    @app.post("/api/v1/requests", status_code=202)
    def create_request(body: Intake, request: Request):
        return core.create_request(actor(request), body)

    @app.get("/api/v1/requests/{ident}")
    def get_request(ident: str, request: Request):
        return core.get(reader(request), ident)

    @app.post("/api/v1/requests/{ident}/decision")
    def decision(ident: str, body: Decision, request: Request):
        return core.decide(human(request), ident, body)

    @app.post("/api/v1/requests/{ident}/cancel")
    def cancel(ident: str, body: Cancel, request: Request):
        return core.cancel(actor(request), ident, body)

    @app.post("/api/v1/requests/{ident}/consume")
    def consume(ident: str, body: Consume, request: Request):
        return core.consume(actor(request), ident, body)

    @app.post("/api/v1/requests/{ident}/result")
    def result(ident: str, body: Result, request: Request):
        return core.report(actor(request), ident, body)

    @app.get("/api/v1/profiles")
    def profiles(request: Request):
        return core.profiles(reader(request))

    @app.post("/api/v1/profiles", status_code=201)
    def add_profile(body: Profile, request: Request):
        return core.create_profile(actor(request), body)

    @app.get("/api/v1/integrations")
    def integrations(request: Request):
        return core.integrations(actor(request))

    @app.post("/api/v1/integrations", status_code=201)
    def add_integration(body: Integration, request: Request):
        return core.create_integration(actor(request), body)

    @app.post("/api/v1/integrations/tokens", status_code=201)
    def add_token(body: Token, request: Request):
        return auth.issue_token(actor(request), body.integration_id, body.scopes)

    @app.post("/api/v1/deliveries/{ident}/resend")
    def resend(ident: str, request: Request):
        return worker.resend(actor(request), ident)

    @app.post("/api/v1/integrations/{ident}/test")
    def test_connection(ident: str, request: Request):
        import time

        from .db import audit, json_text, uid
        from .errors import GrantError
        from .transport import send_webhook

        principal = actor(request)
        principal.require_admin()
        auth.rate("connection-test:" + principal.id, 5, 60)
        with app.state.db.transaction(write=False) as conn:
            row = conn.execute(
                "SELECT destination FROM integrations WHERE id=? AND enabled=1", (ident,)
            ).fetchone()
        if not row:
            raise GrantError("INTEGRATION_NOT_FOUND", 404)
        event_id = uid()
        payload = json_text(
            {
                "schema_version": 1,
                "event_type": "grant.connection.test",
                "event_id": event_id,
                "at": time.time(),
                "execution_allowed": False,
            }
        )
        try:
            send_webhook(app.state.settings, app.state.settings.unseal(row[0]), payload, event_id)
        except Exception as exc:
            raise GrantError("CONNECTION_TEST_FAILED", 502) from exc
        with app.state.db.transaction() as conn:
            audit(
                conn,
                None,
                principal.id,
                "integration.test_accepted",
                {"integration_id": ident, "event_id": event_id},
            )
        return {"transport_accepted": True, "execution_allowed": False, "event_id": event_id}
