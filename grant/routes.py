"""Product API route composition and authentication dependencies."""

import hmac

from fastapi import Request

from .auth import Principal
from .errors import GrantError


def register(app):
    auth = app.state.auth

    def actor(request: Request, *, allow_pending: bool = False) -> Principal:
        authorization = request.headers.get("authorization", "")
        cookie = request.cookies.get("grant_session", "")
        if authorization:
            if cookie or not authorization.startswith("Bearer "):
                raise GrantError("AMBIGUOUS_AUTHENTICATION", 401)
            return auth.api_token(authorization[7:])
        if not cookie:
            raise GrantError("AUTHENTICATION_REQUIRED", 401)
        principal = auth.session(cookie, allow_pending=allow_pending)
        if request.method not in ("GET", "HEAD", "OPTIONS") and not hmac.compare_digest(
            auth.csrf(cookie), request.headers.get("x-csrf-token", "")
        ):
            raise GrantError("CSRF_REQUIRED", 403)
        return principal

    def human(request: Request, *, allow_pending: bool = False) -> Principal:
        principal = actor(request, allow_pending=allow_pending)
        if principal.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        return principal

    def reader(request: Request) -> Principal:
        principal = actor(request)
        if principal.kind == "integration":
            principal.require_scope("request:read")
        return principal

    from .admin import register_admin
    from .domain_routes import register_domain
    from .identity_routes import register_identity

    register_identity(app, human)
    register_domain(app, actor, human, reader)
    register_admin(app, actor)
