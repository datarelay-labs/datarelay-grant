"""Grant HTTP boundary. The product API, not its UI, authorizes every operation."""

from __future__ import annotations

import json
import logging
import threading
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from . import __version__
from .auth import Auth
from .config import Settings
from .core import Core
from .db import Database
from .errors import GrantError
from .transport import Worker


def unique_object(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("duplicate JSON key")
        out[key] = value
    return out


def create_app(settings: Settings) -> FastAPI:
    db = Database(settings.database)
    auth, core, worker = Auth(db, settings), Core(db, settings), Worker(db, settings)
    stop = threading.Event()

    def worker_loop():
        while not stop.is_set():
            try:
                worker.tick(limit=5)
            except Exception as exc:  # noqa: BLE001 - isolate worker failures; never log secret values
                logging.getLogger("grant").error("Worker cycle: %s", type(exc).__name__)
            stop.wait(1)

    @asynccontextmanager
    async def lifespan(app):
        thread = None
        if settings.worker_enabled:
            thread = threading.Thread(target=worker_loop, name="grant-outbox", daemon=True)
            thread.start()
        yield
        stop.set()
        if thread:
            thread.join(timeout=12)

    app = FastAPI(
        title="DataRelay Grant",
        version=__version__,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.db, app.state.auth, app.state.core, app.state.worker = db, auth, core, worker
    app.state.settings = settings

    @app.exception_handler(GrantError)
    async def grant_error(request: Request, exc: GrantError):
        category = {
            401: "unauthenticated",
            403: "forbidden",
            409: "conflict",
            422: "validation",
            429: "unavailable",
            503: "unavailable",
        }.get(exc.status, "failed")
        return JSONResponse(
            {"error": {"code": exc.code, "category": category}}, status_code=exc.status
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(
            {
                "error": {
                    "code": "INVALID_INPUT",
                    "category": "validation",
                    "fields": [".".join(map(str, e["loc"])) for e in exc.errors()],
                }
            },
            status_code=422,
        )

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        try:
            if request.url.path.startswith("/api/"):
                if request.headers.get("host", "") != urlsplit(settings.origin).netloc:
                    raise GrantError("UNTRUSTED_HOST", 400)
                if request.method not in ("GET", "HEAD", "OPTIONS"):
                    if request.headers.get("origin") not in (None, settings.origin):
                        raise GrantError("CROSS_ORIGIN_REJECTED", 403)
                    length = request.headers.get("content-length")
                    if length and (not length.isdigit() or int(length) > settings.max_body_bytes):
                        raise GrantError("BODY_TOO_LARGE", 413)
                    chunks, size = [], 0
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > settings.max_body_bytes:
                            raise GrantError("BODY_TOO_LARGE", 413)
                        chunks.append(chunk)
                    body = b"".join(chunks)
                    request._body = body
                    if body:
                        if (
                            request.headers.get("content-type", "").split(";")[0]
                            != "application/json"
                        ):
                            raise GrantError("JSON_REQUIRED", 415)
                        try:
                            json.loads(body, object_pairs_hook=unique_object)
                        except (ValueError, RecursionError, UnicodeError) as exc:
                            raise GrantError("INVALID_JSON", 422) from exc
                if request.url.path != "/api/v1/auth/login":
                    auth.rate("http:" + (request.client.host if request.client else "unknown"), 600)
            response = await call_next(request)
        except GrantError as exc:
            response = await grant_error(request, exc)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        )
        return response

    from .routes import register

    register(app)

    @app.get("/{path:path}")
    def web(path: str):
        if path.startswith("api/"):
            raise GrantError("ENDPOINT_NOT_FOUND", 404)
        root = settings.web_root.resolve()
        target = (root / path).resolve()
        if target.is_relative_to(root) and target.is_file():
            return FileResponse(target)
        if (root / "index.html").is_file():
            return FileResponse(root / "index.html")
        return JSONResponse({"error": {"code": "FRONTEND_NOT_BUILT"}}, status_code=503)

    return app
