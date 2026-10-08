"""Disposable loopback-only browser fixture. Never creates real user credentials."""

from __future__ import annotations

import json
import os
import secrets
import socketserver
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import uvicorn
from cryptography.fernet import Fernet

from grant.app import create_app
from grant.auth import Principal
from grant.config import Settings
from grant.models import Integration, Profile

ROOT = Path(__file__).resolve().parents[1]
received = {"events": [], "mail": []}
lock = threading.Lock()


class Callback(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with lock:
            received["events"].append(json.loads(body))
        self.send_response(202)
        self.end_headers()

    def do_GET(self):
        with lock:
            body = json.dumps(received).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


class Mail(socketserver.StreamRequestHandler):
    def handle(self):
        self.wfile.write(b"220 fixture ESMTP\r\n")
        while True:
            line = self.rfile.readline(8192)
            if not line:
                return
            command = line.upper().split(b" ", 1)[0].strip()
            if command in (b"EHLO", b"HELO"):
                self.wfile.write(b"250 fixture\r\n")
            elif command == b"DATA":
                self.wfile.write(b"354 End with dot\r\n")
                data = []
                while True:
                    chunk = self.rfile.readline(8192)
                    if chunk in (b".\r\n", b""):
                        break
                    data.append(chunk)
                with lock:
                    received["mail"].append(b"".join(data).decode(errors="replace"))
                self.wfile.write(b"250 accepted\r\n")
            elif command == b"QUIT":
                self.wfile.write(b"221 closing\r\n")
                return
            else:
                self.wfile.write(b"250 ok\r\n")


def main():
    os.umask(0o077)
    port = int(os.environ.get("GRANT_E2E_PORT", "18974"))
    callback = ThreadingHTTPServer(("127.0.0.1", 0), Callback)
    smtp = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Mail)
    smtp.daemon_threads = True
    for server in (callback, smtp):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix="grant-browser-") as scratch:
        url = f"http://127.0.0.1:{callback.server_port}/callback"
        settings = Settings(
            database=Path(scratch) / "grant.sqlite",
            encryption_key=Fernet.generate_key().decode(),
            public_url=f"http://127.0.0.1:{port}",
            dev_mode=True,
            callback_urls=(url,),
            smtp_host="127.0.0.1",
            smtp_port=smtp.server_address[1],
            smtp_starttls=False,
            smtp_from="grant@example.invalid",
            web_root=ROOT / "web/dist",
        )
        app = create_app(settings)
        password = secrets.token_urlsafe(24)
        users = {
            name: app.state.auth.create_user(
                name, name + "@example.invalid", password, "admin" if name == "admin" else "member"
            )
            for name in ("admin", "requester", "approver", "stranger")
        }
        admin = Principal(users["admin"]["id"], "human", "admin")
        integration = app.state.core.create_integration(
            admin,
            Integration(
                name="Isolated DataRelay fixture",
                kind="datarelay",
                callback_url=url,
                hmac_secret=secrets.token_urlsafe(32),
            ),
        )
        profile = app.state.core.create_profile(
            admin,
            Profile(
                name="Test operation approval",
                integration_id=integration["id"],
                approver_id=users["approver"]["id"],
                action_kind="test.operation",
            ),
        )
        app.state.core.transition_profile(admin, profile["id"], "TESTING")
        profile = app.state.core.transition_profile(admin, profile["id"], "ACTIVE")
        token = app.state.auth.issue_token(
            admin,
            integration["id"],
            ["request:create", "request:read", "grant:consume", "result:write"],
        )
        fixtures = ROOT / ".e2e"
        fixtures.mkdir(exist_ok=True, mode=0o700)
        (fixtures / "fixture.json").write_text(
            json.dumps(
                {
                    "password": password,
                    "users": users,
                    "profile_id": profile["id"],
                    "integration_id": integration["id"],
                    "token": token["token"],
                    "receiver": url,
                    "base_url": settings.origin,
                }
            )
        )
        try:
            uvicorn.run(
                app,
                host="127.0.0.1",
                port=port,
                access_log=False,
                proxy_headers=False,
                log_level="warning",
            )
        finally:
            callback.shutdown()
            callback.server_close()
            smtp.shutdown()
            smtp.server_close()


if __name__ == "__main__":
    main()
