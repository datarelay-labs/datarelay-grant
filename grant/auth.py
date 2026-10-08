"""Product-owned identity, scoped integration credentials and MFA.

Only token digests are stored. Administrative role never bypasses assigned approval.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
import time
from dataclasses import dataclass

import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from .config import Settings
from .db import Database, audit, json_text, uid
from .errors import GrantError

PASSWORDS = PasswordHasher()
DUMMY_HASH = PASSWORDS.hash(secrets.token_urlsafe(32))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def verify_password(encoded: str, password: str) -> bool:
    try:
        return PASSWORDS.verify(encoded, password)
    except (VerificationError, InvalidHashError):
        return False


@dataclass(frozen=True)
class Principal:
    id: str
    kind: str
    role: str = ""
    integration_id: str = ""
    scopes: tuple[str, ...] = ()
    session_id: str = ""

    def require_admin(self) -> None:
        if self.kind != "human" or self.role != "admin":
            raise GrantError("ADMIN_REQUIRED", 403)

    def require_scope(self, scope: str) -> None:
        if self.kind != "integration" or scope not in self.scopes:
            raise GrantError("SCOPE_REQUIRED", 403)


def require_current_authority(conn: sqlite3.Connection, actor: Principal, scope: str = "") -> None:
    """Revalidate within the domain transaction, closing revocation/commit races."""
    if actor.kind == "integration":
        row = conn.execute(
            "SELECT t.enabled,t.scopes,i.enabled AS integration_enabled FROM api_tokens t JOIN integrations i ON i.id=t.integration_id WHERE t.id=? AND t.integration_id=?",
            (actor.id, actor.integration_id),
        ).fetchone()
        if not row or not row["enabled"] or not row["integration_enabled"]:
            raise GrantError("AUTHENTICATION_REQUIRED", 401)
        if scope and scope not in json.loads(row["scopes"]):
            raise GrantError("SCOPE_REQUIRED", 403)
    elif actor.kind == "human":
        row = conn.execute(
            "SELECT enabled,role FROM users WHERE id=?", (actor.id,)
        ).fetchone()
        if not row or not row["enabled"] or row["role"] != actor.role:
            # Cached admin/member claims must not survive a role change.
            raise GrantError("AUTHENTICATION_REQUIRED", 401)
        if (
            actor.session_id
            and not conn.execute(
                "SELECT id FROM sessions WHERE id=? AND user_id=? AND expires_at>? AND mfa_pending=0",
                (actor.session_id, actor.id, time.time()),
            ).fetchone()
        ):
            raise GrantError("AUTHENTICATION_REQUIRED", 401)
    else:
        raise GrantError("AUTHENTICATION_REQUIRED", 401)


class Auth:
    def __init__(self, db: Database, settings: Settings):
        self.db = db
        self.settings = settings

    def rate(self, key: str, limit: int = 120, seconds: int = 60) -> None:
        now = time.time()
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM rate_limits WHERE until<?", (now,))
            conn.execute(
                "INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1",
                (digest(key), now + seconds),
            )
            hits = conn.execute(
                "SELECT hits FROM rate_limits WHERE key=?", (digest(key),)
            ).fetchone()[0]
        if hits > limit:
            raise GrantError("RATE_LIMITED", 429)

    def create_user(
        self,
        username: str,
        email: str,
        password: str,
        role: str = "member",
        actor: str | Principal = "bootstrap",
    ) -> dict:
        if len(password) < 12 or len(password) > 256 or role not in ("admin", "member"):
            raise GrantError("INVALID_ACCOUNT", 422)
        hashed = PASSWORDS.hash(password)
        user_id = uid()
        try:
            with self.db.transaction() as conn:
                actor_id = actor.id if isinstance(actor, Principal) else actor
                if isinstance(actor, Principal):
                    actor.require_admin()
                    require_current_authority(conn, actor)
                conn.execute(
                    "INSERT INTO users(id,username,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
                    (user_id, username.strip(), email, hashed, role, time.time()),
                )
                audit(conn, None, actor_id, "user.created", {"user_id": user_id})
        except sqlite3.IntegrityError as exc:
            raise GrantError("ACCOUNT_EXISTS", 409) from exc
        return {"id": user_id, "username": username, "email": email, "role": role}

    def login(self, username: str, password: str, peer: str) -> tuple[str, bool]:
        # In supported HTTPS deployments the direct peer is the loopback reverse proxy,
        # not a trustworthy browser identity. Keep brute-force protection per account
        # and use only a short, coarse installation-wide breaker for Argon2 load.
        self.rate("login-installation", 120, 60)
        self.rate("login-user:" + username.lower(), 15, 300)
        with self.db.transaction(write=False) as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username=?", (username.strip(),)
            ).fetchone()
        valid = verify_password(row["password_hash"] if row else DUMMY_HASH, password)
        if not row or not valid or not row["enabled"]:
            raise GrantError("INVALID_CREDENTIALS", 401)
        token, now = secrets.token_urlsafe(32), time.time()
        pending = bool(row["totp_secret"])
        with self.db.transaction() as conn:
            # A concurrent password/disable operation invalidates this login.
            current = conn.execute(
                "SELECT enabled,password_hash,totp_secret FROM users WHERE id=?", (row["id"],)
            ).fetchone()
            if not current["enabled"] or current["password_hash"] != row["password_hash"]:
                raise GrantError("INVALID_CREDENTIALS", 401)
            pending = bool(current["totp_secret"])  # Recheck MFA under the write lock.
            conn.execute("DELETE FROM sessions WHERE expires_at<?", (now,))
            conn.execute(
                "INSERT INTO sessions VALUES(?,?,?,?,?,?,?)",
                (
                    digest(token),
                    uid(),
                    row["id"],
                    now,
                    now + (300 if pending else self.settings.session_seconds),
                    now,
                    int(pending),
                ),
            )
            audit(
                conn, None, row["id"], "session.password_verified" if pending else "session.created"
            )
        return token, pending

    def csrf(self, session_token: str) -> str:
        return hmac.new(
            self.settings.encryption_key.encode(),
            ("csrf:" + session_token).encode(),
            hashlib.sha256,
        ).hexdigest()

    def session(self, token: str, *, allow_pending: bool = False) -> Principal:
        with self.db.transaction(write=False) as conn:
            row = conn.execute(
                "SELECT s.*,u.role,u.enabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
                (digest(token), time.time()),
            ).fetchone()
        if not row or not row["enabled"]:
            raise GrantError("AUTHENTICATION_REQUIRED", 401)
        if row["mfa_pending"] and not allow_pending:
            raise GrantError("MFA_REQUIRED", 401)
        return Principal(row["user_id"], "human", row["role"], session_id=row["id"])

    def api_token(self, raw: str) -> Principal:
        with self.db.transaction(write=False) as conn:
            row = conn.execute(
                "SELECT t.*,i.enabled AS integration_enabled FROM api_tokens t JOIN integrations i ON i.id=t.integration_id WHERE t.token_hash=?",
                (digest(raw),),
            ).fetchone()
        if not row or not row["enabled"] or not row["integration_enabled"]:
            raise GrantError("AUTHENTICATION_REQUIRED", 401)
        self.rate("integration:" + row["integration_id"])
        return Principal(
            row["id"],
            "integration",
            integration_id=row["integration_id"],
            scopes=tuple(json.loads(row["scopes"])),
        )

    def issue_token(self, actor: Principal, integration_id: str, scopes: list[str]) -> dict:
        actor.require_admin()
        raw, token_id = secrets.token_urlsafe(40), uid()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            if not conn.execute(
                "SELECT id FROM integrations WHERE id=? AND enabled=1", (integration_id,)
            ).fetchone():
                raise GrantError("INTEGRATION_NOT_FOUND", 404)
            conn.execute(
                "INSERT INTO api_tokens VALUES(?,?,?,?,1,?)",
                (
                    token_id,
                    digest(raw),
                    integration_id,
                    json_text(sorted(set(scopes))),
                    time.time(),
                ),
            )
            audit(
                conn,
                None,
                actor.id,
                "integration.token_created",
                {"token_id": token_id, "integration_id": integration_id, "scopes": scopes},
            )
        return {"id": token_id, "token": raw, "scopes": scopes}

    def list_tokens(self, actor: Principal, integration_id: str) -> list[dict]:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            if not conn.execute(
                "SELECT id FROM integrations WHERE id=?", (integration_id,)
            ).fetchone():
                raise GrantError("INTEGRATION_NOT_FOUND", 404)
            rows = conn.execute(
                "SELECT id,scopes,enabled,created_at FROM api_tokens WHERE integration_id=? ORDER BY created_at DESC",
                (integration_id,),
            ).fetchall()
        return [
            {**dict(row), "scopes": json.loads(row["scopes"]), "enabled": bool(row["enabled"])}
            for row in rows
        ]

    def revoke_token(self, actor: Principal, ident: str) -> dict:
        actor.require_admin()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = conn.execute("SELECT enabled FROM api_tokens WHERE id=?", (ident,)).fetchone()
            if not row:
                raise GrantError("TOKEN_NOT_FOUND", 404)
            if row["enabled"]:
                conn.execute("UPDATE api_tokens SET enabled=0 WHERE id=?", (ident,))
                audit(conn, None, actor.id, "integration.token_revoked", {"token_id": ident})
        return {"id": ident, "enabled": False}

    def user(self, principal: Principal) -> dict:
        with self.db.transaction(write=False) as conn:
            row = conn.execute(
                "SELECT id,username,email,role,enabled,totp_secret FROM users WHERE id=?",
                (principal.id,),
            ).fetchone()
        return {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "role": row["role"],
            "mfa_enabled": bool(row["totp_secret"]),
        }

    def change_password(self, actor: Principal, current: str, new: str) -> None:
        if actor.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        self.rate("password:" + actor.id, 10, 300)
        with self.db.transaction(write=False) as conn:
            row = conn.execute("SELECT password_hash FROM users WHERE id=?", (actor.id,)).fetchone()
        if not verify_password(row[0], current) or len(new) < 12:
            raise GrantError("PASSWORD_CHANGE_REJECTED", 422)
        hashed = PASSWORDS.hash(new)
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            if not conn.execute(
                "UPDATE users SET password_hash=? WHERE id=? AND password_hash=?",
                (hashed, actor.id, row[0]),
            ).rowcount:
                raise GrantError("STALE_PASSWORD", 409)
            conn.execute("DELETE FROM sessions WHERE user_id=?", (actor.id,))
            audit(conn, None, actor.id, "password.changed")

    def enroll(self, actor: Principal) -> dict:
        self.rate("enroll:" + actor.id, 5, 300)
        secret = pyotp.random_base32()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            user = conn.execute("SELECT * FROM users WHERE id=?", (actor.id,)).fetchone()
            if user["totp_secret"]:
                raise GrantError("MFA_ALREADY_ENABLED")
            material = self.settings.seal({"secret": secret, "until": time.time() + 300})
            conn.execute(
                "INSERT OR REPLACE INTO runtime VALUES(?,?)", ("enroll:" + actor.id, material)
            )
        return {
            "secret": secret,
            "otpauth_uri": pyotp.TOTP(secret).provisioning_uri(
                user["username"], issuer_name="DataRelay Grant"
            ),
        }

    def confirm_enrollment(self, actor: Principal, code: str) -> list[str]:
        self.rate("mfa:" + actor.id, 10, 300)
        recovery = [secrets.token_hex(10) for _ in range(8)]
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = conn.execute(
                "SELECT value FROM runtime WHERE key=?", ("enroll:" + actor.id,)
            ).fetchone()
            user = conn.execute("SELECT totp_secret FROM users WHERE id=?", (actor.id,)).fetchone()
            if not row or user[0]:
                raise GrantError("NO_PENDING_ENROLLMENT")
            pending = self.settings.unseal(row[0])
            step = int(time.time() // 30)
            if pending["until"] < time.time() or not pyotp.TOTP(pending["secret"]).verify(code):
                raise GrantError("INVALID_MFA_CODE", 401)
            conn.execute(
                "UPDATE users SET totp_secret=?,totp_last_step=?,recovery_hashes=? WHERE id=?",
                (
                    self.settings.seal(pending["secret"]),
                    step,
                    json_text([digest(v) for v in recovery]),
                    actor.id,
                ),
            )
            conn.execute("DELETE FROM runtime WHERE key=?", ("enroll:" + actor.id,))
            conn.execute(
                "DELETE FROM sessions WHERE user_id=? AND id<>?", (actor.id, actor.session_id)
            )
            audit(conn, None, actor.id, "mfa.enabled")
        return recovery

    def verify_mfa(self, token: str, code: str, recovery: bool = False) -> None:
        actor = self.session(token, allow_pending=True)
        self.rate("mfa:" + actor.id, 10, 300)
        now = time.time()
        with self.db.transaction() as conn:
            session = conn.execute(
                "SELECT mfa_pending,expires_at FROM sessions WHERE token_hash=?", (digest(token),)
            ).fetchone()
            user = conn.execute("SELECT * FROM users WHERE id=?", (actor.id,)).fetchone()
            if not session or not session[0] or session[1] <= now or not user["enabled"]:
                raise GrantError("MFA_CHALLENGE_EXPIRED", 401)
            if recovery:
                hashes = json.loads(user["recovery_hashes"])
                hashed = digest(code)
                if hashed not in hashes:
                    raise GrantError("INVALID_MFA_CODE", 401)
                hashes.remove(hashed)
                conn.execute(
                    "UPDATE users SET recovery_hashes=? WHERE id=?", (json_text(hashes), actor.id)
                )
            else:
                totp = pyotp.TOTP(self.settings.unseal(user["totp_secret"]))
                current = int(now // 30)
                matching = [
                    s
                    for s in (current - 1, current, current + 1)
                    if s > user["totp_last_step"] and hmac.compare_digest(totp.at(s * 30), code)
                ]
                if not matching:
                    raise GrantError("INVALID_MFA_CODE", 401)
                conn.execute(
                    "UPDATE users SET totp_last_step=? WHERE id=?", (max(matching), actor.id)
                )
            conn.execute(
                "UPDATE sessions SET mfa_pending=0,expires_at=? WHERE token_hash=?",
                (now + self.settings.session_seconds, digest(token)),
            )
            audit(conn, None, actor.id, "session.mfa_verified")
