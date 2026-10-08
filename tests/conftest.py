"""Isolated, disposable identities and database; never uses real integrations."""

import secrets
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from grant.app import create_app
from grant.auth import Principal
from grant.config import Settings
from grant.models import Integration, Profile


@pytest.fixture
def env(tmp_path):
    settings = Settings(
        database=tmp_path / "grant.sqlite",
        encryption_key=Fernet.generate_key().decode(),
        public_url="http://testserver",
        dev_mode=True,
        worker_enabled=False,
        callback_urls=("http://127.0.0.1:18794/callback",),
    )
    app = create_app(settings)
    password = secrets.token_urlsafe(20)
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
            name="Test DataRelay", kind="datarelay", callback_url=settings.callback_urls[0]
        ),
    )
    profile = app.state.core.create_profile(
        admin,
        Profile(
            name="Test approval",
            integration_id=integration["id"],
            approver_id=users["approver"]["id"],
            action_kind="service.restart",
        ),
    )
    app.state.core.transition_profile(admin, profile["id"], "TESTING")
    profile = app.state.core.transition_profile(admin, profile["id"], "ACTIVE")
    issued = app.state.auth.issue_token(
        admin,
        integration["id"],
        ["request:create", "request:read", "grant:consume", "result:write"],
    )
    clients = []

    def human(name):
        client = TestClient(app)
        clients.append(client)
        response = client.post("/api/v1/auth/login", json={"username": name, "password": password})
        assert response.status_code == 200, response.text
        client.headers["x-csrf-token"] = response.json()["csrf"]
        return client

    api = TestClient(app, headers={"authorization": "Bearer " + issued["token"]})
    clients.append(api)

    def intake(**overrides):
        return {
            "external_id": secrets.token_hex(8),
            "profile_id": profile["id"],
            "title": "Restart test service",
            "action": {
                "kind": "service.restart",
                "target": "test-service",
                "parameters": {"reason_code": 1},
            },
            "source": {"case_id": "test-case"},
            **overrides,
        }

    yield SimpleNamespace(
        app=app,
        db=app.state.db,
        core=app.state.core,
        auth=app.state.auth,
        settings=settings,
        users=users,
        password=password,
        admin=admin,
        integration=integration,
        profile=profile,
        token=issued,
        api=api,
        human=human,
        intake=intake,
    )
    for client in clients:
        client.close()
