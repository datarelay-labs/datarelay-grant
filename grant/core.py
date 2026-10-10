"""Approval authority and execution gate. All transitions serialize with the outbox."""

from __future__ import annotations

import hashlib
import json
import math
import sqlite3
import time
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from .auth import Principal, require_current_authority
from .config import Settings
from .db import Database, audit, json_text, uid
from .errors import GrantError
from .mail_templates import (
    ALLOWED_VARIABLES,
    DEFAULT_EVENT_TEMPLATES,
    render_from_context,
    render_notification,
    snapshot,
)
from .models import (
    ApproverGroup,
    ApproverGroupUpdate,
    Cancel,
    Consume,
    Decision,
    Delegation,
    EmailTemplate,
    EmailTemplateUpdate,
    Escalation,
    Intake,
    Integration,
    NotificationBrandingUpdate,
    NotificationPreview,
    NotificationTemplateSet,
    NotificationTemplateSetUpdate,
    NotificationTestSend,
    PolicySample,
    Profile,
    ProfileUpdate,
    Reassign,
    RequestComment,
    Result,
)
from .policy import (
    active_version,
    latest_version,
    resolve_policy,
    selector_evaluation,
    version_view,
)
from .policy import history as policy_versions


def bounded_json(value: Any, depth: int = 0) -> None:
    if depth > 8:
        raise GrantError("JSON_TOO_DEEP", 422)
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str) and len(value) <= 4000:
        return
    if isinstance(value, int) and -(2**53) < value < 2**53:
        return
    if isinstance(value, list) and len(value) <= 100:
        for item in value:
            bounded_json(item, depth + 1)
        return
    if isinstance(value, dict) and len(value) <= 100:
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 100:
                raise GrantError("INVALID_JSON_KEY", 422)
            if key.lower().replace("-", "_") in {
                "password",
                "secret",
                "token",
                "access_token",
                "api_key",
                "authorization",
                "private_key",
            }:
                raise GrantError("USE_SECRET_REFERENCES_NOT_VALUES", 422)
            bounded_json(item, depth + 1)
        return
    raise GrantError("UNSUPPORTED_JSON_VALUE", 422)


def fingerprint(value: object) -> str:
    return hashlib.sha256(json_text(value).encode()).hexdigest()


class Core:
    def __init__(self, db: Database, settings: Settings):
        self.db, self.settings = db, settings

    def create_integration(self, actor: Principal, body: Integration) -> dict:
        actor.require_admin()
        from .transport import validate_destination

        validate_destination(body.callback_url, self.settings, resolve=False)
        forbidden = {
            "host",
            "content-length",
            "connection",
            "transfer-encoding",
            "content-type",
            "x-grant-event-id",
            "x-grant-signature",
            "x-grant-timestamp",
        }
        for key, value in body.callback_headers.items():
            if (
                key.lower() in forbidden
                or not key
                or len(key) > 100
                or len(value) > 2048
                or any(c in key + value for c in "\r\n\x00")
            ):
                raise GrantError("INVALID_CALLBACK_HEADER", 422)
        if len(body.callback_headers) > 10:
            raise GrantError("TOO_MANY_HEADERS", 422)
        if body.kind == "stellar" and not body.tenant:
            raise GrantError("STELLAR_TENANT_REQUIRED", 422)
        ident = uid()
        destination = self.settings.seal(
            {
                "url": body.callback_url,
                "headers": body.callback_headers,
                "hmac_secret": body.hmac_secret,
            }
        )
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            conn.execute(
                "INSERT INTO integrations VALUES(?,?,?,1,?,?,?)",
                (ident, body.name, body.kind, body.tenant, destination, time.time()),
            )
            audit(conn, None, actor.id, "integration.created", {"integration_id": ident})
        return {"id": ident, "name": body.name, "kind": body.kind}

    def integrations(self, actor: Principal) -> list[dict]:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            rows = conn.execute("SELECT * FROM integrations ORDER BY name").fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "kind": r["kind"],
                "tenant": r["tenant"],
                "enabled": bool(r["enabled"]),
                "callback_origin": self._origin(r["destination"]),
            }
            for r in rows
        ]

    def _origin(self, sealed: str) -> str:
        parsed = urlsplit(self.settings.unseal(sealed)["url"])
        return f"{parsed.scheme}://{parsed.netloc}"

    @staticmethod
    def _validate_approval_refs(
        conn: sqlite3.Connection,
        *,
        approval_mode: str,
        approver_id: str,
        approver_group_id: str | None,
        approvals_required: int | None,
    ) -> None:
        if approval_mode == "SINGLE":
            if not conn.execute(
                "SELECT id FROM users WHERE id=? AND enabled=1", (approver_id,)
            ).fetchone():
                raise GrantError("APPROVER_NOT_FOUND", 404)
            return
        if not approver_group_id:
            raise GrantError("APPROVER_GROUP_REQUIRED", 422)
        group = conn.execute(
            "SELECT enabled FROM approver_groups WHERE id=?", (approver_group_id,)
        ).fetchone()
        if not group or not group["enabled"]:
            raise GrantError("APPROVER_GROUP_UNAVAILABLE", 409)
        members = [
            r["user_id"]
            for r in conn.execute(
                "SELECT user_id FROM approver_group_members WHERE group_id=? ORDER BY position",
                (approver_group_id,),
            ).fetchall()
        ]
        if not members:
            raise GrantError("APPROVER_GROUP_UNAVAILABLE", 409)
        for member_id in members:
            member = conn.execute(
                "SELECT enabled FROM users WHERE id=?", (member_id,)
            ).fetchone()
            if not member or not member["enabled"]:
                raise GrantError("GROUP_MEMBER_UNAVAILABLE", 409)
        if approval_mode == "N_OF_M" and (
            approvals_required is None
            or approvals_required < 1
            or approvals_required > len(members)
        ):
            raise GrantError("APPROVAL_QUORUM_INVALID", 422)

    def _validate_profile_refs(self, conn: sqlite3.Connection, body: Profile) -> None:
        if not conn.execute(
            "SELECT id FROM integrations WHERE id=? AND enabled=1", (body.integration_id,)
        ).fetchone():
            raise GrantError("INTEGRATION_NOT_FOUND", 404)
        self._validate_approval_refs(
            conn,
            approval_mode=body.approval_mode,
            approver_id=body.approver_id,
            approver_group_id=body.approver_group_id,
            approvals_required=body.approvals_required,
        )
        if body.email_template_id and not conn.execute(
            "SELECT id FROM email_templates WHERE id=? AND enabled=1",
            (body.email_template_id,),
        ).fetchone():
            raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)

    @staticmethod
    def _validate_version_refs(conn: sqlite3.Connection, row: sqlite3.Row) -> None:
        if not conn.execute(
            "SELECT id FROM integrations WHERE id=? AND enabled=1", (row["integration_id"],)
        ).fetchone():
            raise GrantError("INTEGRATION_NOT_FOUND", 404)
        Core._validate_approval_refs(
            conn,
            approval_mode=row["approval_mode"],
            approver_id=row["approver_id"],
            approver_group_id=row["approver_group_id"],
            approvals_required=row["approvals_required"],
        )
        if row["email_template_id"] and not conn.execute(
            "SELECT id FROM email_templates WHERE id=? AND enabled=1",
            (row["email_template_id"],),
        ).fetchone():
            raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)

    @staticmethod
    def _branding(conn: sqlite3.Connection) -> dict[str, str]:
        values = {
            row["key"]: row["value"]
            for row in conn.execute(
                "SELECT key,value FROM runtime WHERE key IN ('notification_brand_name','notification_sender_display_name')"
            ).fetchall()
        }
        return {
            "brand_name": values.get("notification_brand_name", "DataRelay Grant"),
            "sender_display_name": values.get(
                "notification_sender_display_name", "DataRelay Grant"
            ),
            "logo_asset": "/assets/datarelay-grant-icon.svg",
        }

    def notification_branding(self, actor: Principal) -> dict[str, str]:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            return self._branding(conn)

    def update_notification_branding(
        self, actor: Principal, body: NotificationBrandingUpdate
    ) -> dict[str, str]:
        actor.require_admin()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            conn.execute(
                "INSERT OR REPLACE INTO runtime(key,value) VALUES('notification_brand_name',?)",
                (body.brand_name,),
            )
            conn.execute(
                "INSERT OR REPLACE INTO runtime(key,value) VALUES('notification_sender_display_name',?)",
                (body.sender_display_name,),
            )
            audit(
                conn,
                None,
                actor.id,
                "notification.branding_updated",
                {
                    "brand_name": body.brand_name,
                    "sender_display_name": body.sender_display_name,
                },
            )
        return {
            "brand_name": body.brand_name,
            "sender_display_name": body.sender_display_name,
            "logo_asset": "/assets/datarelay-grant-icon.svg",
        }

    @staticmethod
    def _template_set_view(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "name": row["name"],
            "templates": json.loads(row["event_templates"]),
            "enabled": bool(row["enabled"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def create_notification_template_set(
        self, actor: Principal, body: NotificationTemplateSet
    ) -> dict:
        actor.require_admin()
        ident, now = uid(), time.time()
        templates = {key: value.model_dump() for key, value in body.templates.items()}
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            branding = self._branding(conn)
            try:
                conn.execute(
                    """INSERT INTO email_templates(
                       id,name,subject_template,body_template,reminder_subject_template,
                       reminder_body_template,event_templates,sender_display_name,
                       enabled,created_at,updated_at
                    ) VALUES(?,?,?,?,?,?,?,?,1,?,?)""",
                    (
                        ident,
                        body.name,
                        templates["requested"]["subject"],
                        templates["requested"]["body"],
                        templates["reminder"]["subject"],
                        templates["reminder"]["body"],
                        json_text(templates),
                        branding["sender_display_name"],
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise GrantError("EMAIL_TEMPLATE_NAME_EXISTS", 409) from exc
            audit(
                conn,
                None,
                actor.id,
                "notification_template_set.created",
                {"template_set_id": ident},
            )
            row = conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone()
        return self._template_set_view(row)

    def notification_template_sets(self, actor: Principal) -> list[dict]:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            rows = conn.execute("SELECT * FROM email_templates ORDER BY name").fetchall()
        return [self._template_set_view(row) for row in rows]

    def update_notification_template_set(
        self, actor: Principal, ident: str, body: NotificationTemplateSetUpdate
    ) -> dict:
        actor.require_admin()
        templates = {key: value.model_dump() for key, value in body.templates.items()}
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            if not conn.execute(
                "SELECT id FROM email_templates WHERE id=?", (ident,)
            ).fetchone():
                raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)
            if not body.enabled and conn.execute(
                """SELECT 1 FROM profile_versions
                   WHERE email_template_id=? AND lifecycle='ACTIVE' LIMIT 1""",
                (ident,),
            ).fetchone():
                raise GrantError("EMAIL_TEMPLATE_IN_USE", 409)
            try:
                conn.execute(
                    """UPDATE email_templates
                       SET name=?,subject_template=?,body_template=?,
                           reminder_subject_template=?,reminder_body_template=?,
                           event_templates=?,enabled=?,updated_at=?
                       WHERE id=?""",
                    (
                        body.name,
                        templates["requested"]["subject"],
                        templates["requested"]["body"],
                        templates["reminder"]["subject"],
                        templates["reminder"]["body"],
                        json_text(templates),
                        int(body.enabled),
                        time.time(),
                        ident,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise GrantError("EMAIL_TEMPLATE_NAME_EXISTS", 409) from exc
            audit(
                conn,
                None,
                actor.id,
                "notification_template_set.updated",
                {"template_set_id": ident, "enabled": body.enabled},
            )
            row = conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone()
        return self._template_set_view(row)

    def create_email_template(self, actor: Principal, body: EmailTemplate) -> dict:
        templates = {event: dict(value) for event, value in DEFAULT_EVENT_TEMPLATES.items()}
        templates["requested"] = {
            "subject": body.subject_template,
            "body": body.body_template,
        }
        templates["reminder"] = {
            "subject": body.reminder_subject_template,
            "body": body.reminder_body_template,
        }
        created = self.create_notification_template_set(
            actor, NotificationTemplateSet(name=body.name, templates=templates)
        )
        return {"id": created["id"], **body.model_dump(), "enabled": True}

    def email_templates(self, actor: Principal) -> list[dict]:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            rows = conn.execute(
                """SELECT id,name,subject_template,body_template,reminder_subject_template,
                          reminder_body_template,enabled,created_at,updated_at
                   FROM email_templates ORDER BY name"""
            ).fetchall()
        return [{**dict(row), "enabled": bool(row["enabled"])} for row in rows]

    def update_email_template(
        self, actor: Principal, ident: str, body: EmailTemplateUpdate
    ) -> dict:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            row = conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone()
            if not row:
                raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)
            templates = json.loads(row["event_templates"])
        templates["requested"] = {
            "subject": body.subject_template,
            "body": body.body_template,
        }
        templates["reminder"] = {
            "subject": body.reminder_subject_template,
            "body": body.reminder_body_template,
        }
        self.update_notification_template_set(
            actor,
            ident,
            NotificationTemplateSetUpdate(
                name=body.name, templates=templates, enabled=body.enabled
            ),
        )
        return {"id": ident, **body.model_dump()}

    def notification_variables(self, actor: Principal) -> dict:
        actor.require_admin()
        return {"variables": sorted(ALLOWED_VARIABLES)}

    def preview_notification(
        self, actor: Principal, ident: str, body: NotificationPreview
    ) -> dict:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            row = conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone()
            if not row:
                raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)
            template = snapshot(row, branding=self._branding(conn))
        rendered = render_from_context(template, body.event, body.sample.model_dump())
        return {
            "template_set_id": ident,
            "event": body.event,
            "rendered": rendered,
            "transport_accepted": False,
            "receipt_confirmed": False,
            "execution_allowed": False,
        }

    def test_notification(
        self, actor: Principal, ident: str, body: NotificationTestSend
    ) -> dict:
        from .transport import send_email

        actor.require_admin()
        principal = actor
        with self.db.transaction(write=False) as conn:
            require_current_authority(conn, principal)
            row = conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone()
            if not row:
                raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)
            template = snapshot(row, branding=self._branding(conn))
            recipient_id = body.recipient_user_id or principal.id
            # No designated-safe-recipient registry exists yet. Do not let an
            # administrator turn test delivery into unsolicited mail to users.
            if recipient_id != principal.id:
                raise GrantError("TEST_RECIPIENT_NOT_ALLOWED", 403)
            recipient = conn.execute(
                "SELECT id,email,enabled FROM users WHERE id=?", (recipient_id,)
            ).fetchone()
            if not recipient or not recipient["enabled"]:
                raise GrantError("TEST_RECIPIENT_NOT_FOUND", 404)
        rendered = render_from_context(template, body.event, body.sample.model_dump())
        event_id = uid()
        with self.db.transaction(write=False) as conn:
            require_current_authority(conn, principal)
        send_email(
            self.settings,
            {"email": recipient["email"]},
            json_text(rendered),
            event_id,
        )
        with self.db.transaction() as conn:
            require_current_authority(conn, principal)
            audit(
                conn,
                None,
                principal.id,
                "notification.test_accepted",
                {
                    "template_set_id": ident,
                    "event": body.event,
                    "recipient_user_id": recipient_id,
                    "event_id": event_id,
                },
            )
        return {
            "transport_accepted": True,
            "receipt_confirmed": False,
            "execution_allowed": False,
            "event_id": event_id,
        }

    def notification_deliveries(self, actor: Principal) -> dict:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            rows = conn.execute(
                """SELECT id,request_id,event_type,state,attempts,last_error,
                          available_at,delivered_at,created_at
                   FROM outbox WHERE kind='email'
                   ORDER BY created_at DESC,id DESC LIMIT 200"""
            ).fetchall()
        return {
            "deliveries": [
                {
                    **dict(row),
                    "transport_accepted": row["state"] == "DELIVERED",
                    "receipt_confirmed": False,
                }
                for row in rows
            ]
        }

    def _insert_profile_version(
        self,
        conn: sqlite3.Connection,
        profile_id: str,
        version: int,
        body: Profile,
        *,
        lifecycle: str = "DRAFT",
    ) -> str:
        version_id, now = uid(), time.time()
        conn.execute(
            """INSERT INTO profile_versions(
               id,profile_id,version,name,integration_id,approver_id,approval_mode,approver_group_id,approvals_required,action_kind,email_template_id,
               deadline_seconds,reminder_seconds,max_reminders,grant_seconds,
               tenant_selector,environment,severity,risk_level,lifecycle,
               created_at,updated_at,activated_at,disabled_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)""",
            (
                version_id,
                profile_id,
                version,
                body.name,
                body.integration_id,
                body.approver_id,
                body.approval_mode,
                body.approver_group_id,
                body.approvals_required,
                body.action_kind,
                body.email_template_id,
                body.deadline_seconds,
                body.reminder_seconds,
                body.max_reminders,
                body.grant_seconds,
                body.tenant_selector,
                body.environment,
                body.severity,
                body.risk_level,
                lifecycle,
                now,
                now,
            ),
        )
        return version_id

    @staticmethod
    def _mirror_profile(
        conn: sqlite3.Connection, ident: str, body: Profile, *, enabled: bool
    ) -> None:
        conn.execute(
            """UPDATE profiles
               SET name=?,integration_id=?,approver_id=?,approval_mode=?,approver_group_id=?,approvals_required=?,action_kind=?,email_template_id=?,
                   deadline_seconds=?,reminder_seconds=?,max_reminders=?,grant_seconds=?,enabled=?
               WHERE id=?""",
            (
                body.name,
                body.integration_id,
                body.approver_id,
                body.approval_mode,
                body.approver_group_id,
                body.approvals_required,
                body.action_kind,
                body.email_template_id,
                body.deadline_seconds,
                body.reminder_seconds,
                body.max_reminders,
                body.grant_seconds,
                int(enabled),
                ident,
            ),
        )

    def create_delegation(self, actor: Principal, body: Delegation) -> dict:
        if actor.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        if body.ends_at <= body.starts_at or body.ends_at <= time.time():
            raise GrantError("DELEGATION_WINDOW_INVALID", 422)
        if body.substitute_id == actor.id:
            raise GrantError("DELEGATION_SELF_INVALID", 422)
        ident, now = uid(), time.time()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            target = conn.execute("SELECT enabled FROM users WHERE id=?", (body.substitute_id,)).fetchone()
            if not target or not target["enabled"]:
                raise GrantError("DELEGATE_UNAVAILABLE", 409)
            conn.execute(
                "INSERT INTO delegations(id,delegator_id,substitute_id,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?)",
                (ident, actor.id, body.substitute_id, body.starts_at, body.ends_at, now),
            )
            audit(conn, None, actor.id, "delegation.created", {"delegation_id": ident, "substitute_id": body.substitute_id, "starts_at": body.starts_at, "ends_at": body.ends_at}, now)
        return {"id": ident, "delegator_id": actor.id, **body.model_dump(), "revoked_at": None}

    def delegations(self, actor: Principal) -> list[dict]:
        if actor.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        with self.db.transaction(write=False) as conn:
            if actor.role == "admin":
                rows = conn.execute("SELECT * FROM delegations ORDER BY created_at DESC").fetchall()
            else:
                rows = conn.execute("SELECT * FROM delegations WHERE delegator_id=? OR substitute_id=? ORDER BY created_at DESC", (actor.id, actor.id)).fetchall()
            return [dict(row) for row in rows]

    def approver_directory(self, actor: Principal) -> list[dict]:
        if actor.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        with self.db.transaction(write=False) as conn:
            rows = conn.execute(
                "SELECT id,username FROM users WHERE enabled=1 AND id<>? ORDER BY username",
                (actor.id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def revoke_delegation(self, actor: Principal, ident: str) -> dict:
        if actor.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = conn.execute("SELECT * FROM delegations WHERE id=?", (ident,)).fetchone()
            if not row:
                raise GrantError("DELEGATION_NOT_FOUND", 404)
            if actor.role != "admin" and row["delegator_id"] != actor.id:
                raise GrantError("DELEGATION_REVOKE_FORBIDDEN", 403)
            if row["revoked_at"] is None:
                now = time.time()
                conn.execute("UPDATE delegations SET revoked_at=? WHERE id=?", (now, ident))
                audit(
                    conn,
                    None,
                    actor.id,
                    "delegation.revoked",
                    {"delegation_id": ident, "delegator_id": row["delegator_id"]},
                    now,
                )
            current = conn.execute("SELECT * FROM delegations WHERE id=?", (ident,)).fetchone()
        return dict(current)

    @staticmethod
    def _delegated_from(conn: sqlite3.Connection, actor_id: str, members: list[str], now: float) -> str | None:
        if actor_id in members:
            return actor_id
        rows = conn.execute(
            """SELECT delegator_id FROM delegations
               WHERE substitute_id=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>?
               ORDER BY created_at DESC""",
            (actor_id, now, now),
        ).fetchall()
        return next(
            (row["delegator_id"] for row in rows if row["delegator_id"] in members),
            None,
        )

    def configure_escalation(self, actor: Principal, ident: str, body: Escalation) -> dict:
        actor.require_admin()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = self._load(conn, ident)
            if row["revision"] != body.expected_revision:
                raise GrantError("STALE_OR_FINAL_REQUEST", 409)
            if row["state"] not in ("AWAITING", "HELD") or row["execution_id"]:
                raise GrantError("ESCALATION_NOT_ALLOWED", 409)
            if body.target_user_id:
                target = conn.execute(
                    "SELECT enabled FROM users WHERE id=?", (body.target_user_id,)
                ).fetchone()
                if (
                    not target
                    or not target["enabled"]
                    or body.target_user_id == row["requester_id"]
                ):
                    raise GrantError("ESCALATION_TARGET_UNAVAILABLE", 409)
                members = [body.target_user_id]
            else:
                group = conn.execute(
                    "SELECT enabled FROM approver_groups WHERE id=?", (body.target_group_id,)
                ).fetchone()
                if not group or not group["enabled"]:
                    raise GrantError("ESCALATION_TARGET_UNAVAILABLE", 409)
                members = [
                    member["user_id"]
                    for member in conn.execute(
                        """SELECT gm.user_id
                           FROM approver_group_members gm
                           JOIN users u ON u.id=gm.user_id
                           WHERE gm.group_id=? AND u.enabled=1
                           ORDER BY gm.position""",
                        (body.target_group_id,),
                    ).fetchall()
                ]
                if not members or row["requester_id"] in members:
                    raise GrantError("ESCALATION_TARGET_UNAVAILABLE", 409)
            due = row["created_at"] + body.after_seconds
            conn.execute(
                """INSERT INTO escalations(
                       request_id,target_user_id,target_group_id,target_members,due_at,fired_at
                   ) VALUES(?,?,?,?,?,NULL)
                   ON CONFLICT(request_id) DO UPDATE SET
                   target_user_id=excluded.target_user_id,
                   target_group_id=excluded.target_group_id,
                   target_members=excluded.target_members,
                   due_at=excluded.due_at,
                   fired_at=NULL""",
                (
                    ident,
                    body.target_user_id,
                    body.target_group_id,
                    json_text(members),
                    due,
                ),
            )
            changed = conn.execute(
                "UPDATE requests SET revision=revision+1 WHERE id=? AND revision=?",
                (ident, body.expected_revision),
            )
            if changed.rowcount != 1:
                raise GrantError("STALE_OR_FINAL_REQUEST", 409)
            detail = {
                "target_user_id": body.target_user_id,
                "target_group_id": body.target_group_id,
                "target_members": members,
                "due_at": due,
                "request_revision": body.expected_revision + 1,
            }
            audit(conn, ident, actor.id, "request.escalation_configured", detail)
            return {"request_id": ident, "revision": body.expected_revision + 1, **detail}

    def reassign_request(self, actor: Principal, ident: str, body: Reassign) -> dict:
        actor.require_admin()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = self._load(conn, ident)
            if row["revision"] != body.expected_revision or row["state"] not in ("AWAITING", "HELD"):
                raise GrantError("STALE_OR_FINAL_REQUEST", 409)
            plan = json.loads(row["approval_plan"] or "{}")
            members = list(plan.get("members", [row["approver_id"]]))
            if body.from_approver_id not in members or body.to_approver_id in members:
                raise GrantError("REASSIGNMENT_INVALID", 422)
            existing_decision = conn.execute(
                "SELECT decision FROM request_decisions WHERE request_id=? AND actor_id=?",
                (ident, body.from_approver_id),
            ).fetchone()
            if existing_decision:
                # Never carry a replaced member's vote into the new approval plan.
                # Even HELD is a recorded decision; require a separate, auditable
                # recovery workflow instead of silently discarding the ledger.
                raise GrantError("REASSIGNMENT_ALREADY_DECIDED", 409)
            target = conn.execute("SELECT enabled FROM users WHERE id=?", (body.to_approver_id,)).fetchone()
            if not target or not target["enabled"] or body.to_approver_id == row["requester_id"]:
                raise GrantError("REASSIGNMENT_TARGET_UNAVAILABLE", 409)
            members[members.index(body.from_approver_id)] = body.to_approver_id
            plan["members"] = members
            conn.execute("UPDATE requests SET approval_plan=?,approver_id=?,revision=revision+1 WHERE id=?",
                         (json_text(plan), members[0], ident))
            audit(conn, ident, actor.id, "request.reassigned", {"from": body.from_approver_id, "to": body.to_approver_id, "reason": body.reason})
            return self._project(conn, self._load(conn, ident))

    def create_approver_group(self, actor: Principal, body: ApproverGroup) -> dict:
        actor.require_admin()
        ident, now = uid(), time.time()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            for member_id in body.member_ids:
                row = conn.execute("SELECT enabled FROM users WHERE id=?", (member_id,)).fetchone()
                if not row or not row["enabled"]:
                    raise GrantError("GROUP_MEMBER_UNAVAILABLE", 409)
            conn.execute("INSERT INTO approver_groups VALUES(?,?,1,?,?)", (ident, body.name, now, now))
            conn.executemany(
                "INSERT INTO approver_group_members(group_id,user_id,position) VALUES(?,?,?)",
                [(ident, member, pos) for pos, member in enumerate(body.member_ids)],
            )
            audit(conn, None, actor.id, "approver_group.created", {"group_id": ident, "member_ids": body.member_ids})
        return {"id": ident, "name": body.name, "member_ids": body.member_ids, "enabled": True, "updated_at": now}

    def approver_groups(self, actor: Principal) -> list[dict]:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            groups = conn.execute("SELECT * FROM approver_groups ORDER BY name,id").fetchall()
            return [{**dict(group), "member_ids": [r["user_id"] for r in conn.execute(
                "SELECT user_id FROM approver_group_members WHERE group_id=? ORDER BY position", (group["id"],)
            ).fetchall()]} for group in groups]

    def update_approver_group(self, actor: Principal, ident: str, body: ApproverGroupUpdate) -> dict:
        actor.require_admin()
        # BEGIN IMMEDIATE makes the review and write one serialized decision.
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            current = conn.execute(
                "SELECT updated_at FROM approver_groups WHERE id=?", (ident,)
            ).fetchone()
            if not current:
                raise GrantError("APPROVER_GROUP_NOT_FOUND", 404)
            if current["updated_at"] != body.expected_updated_at:
                raise GrantError("APPROVER_GROUP_STALE", 409)
            for member_id in body.member_ids:
                row = conn.execute("SELECT enabled FROM users WHERE id=?", (member_id,)).fetchone()
                if not row or not row["enabled"]:
                    raise GrantError("GROUP_MEMBER_UNAVAILABLE", 409)
            # Advance the revision even if two edits occur at the same clock tick.
            updated_at = max(time.time(), math.nextafter(current["updated_at"], math.inf))
            changed = conn.execute(
                "UPDATE approver_groups SET name=?,updated_at=? WHERE id=? AND updated_at=?",
                (body.name, updated_at, ident, body.expected_updated_at),
            )
            if changed.rowcount != 1:
                raise GrantError("APPROVER_GROUP_STALE", 409)
            conn.execute("DELETE FROM approver_group_members WHERE group_id=?", (ident,))
            conn.executemany("INSERT INTO approver_group_members(group_id,user_id,position) VALUES(?,?,?)",
                             [(ident, member, pos) for pos, member in enumerate(body.member_ids)])
            audit(conn, None, actor.id, "approver_group.updated", {
                "group_id": ident, "member_ids": body.member_ids,
                "previous_revision": body.expected_updated_at,
                "updated_revision": updated_at,
            })
        return {"id": ident, "name": body.name, "member_ids": body.member_ids,
                "enabled": True, "updated_at": updated_at}

    @staticmethod
    def _approval_plan(conn: sqlite3.Connection, profile: sqlite3.Row) -> dict:
        mode = profile["approval_mode"]
        if mode == "SINGLE":
            return {"mode": "SINGLE", "members": [profile["approver_id"]], "required": 1}
        group = conn.execute(
            "SELECT enabled FROM approver_groups WHERE id=?", (profile["approver_group_id"],)
        ).fetchone()
        if not group or not group["enabled"]:
            raise GrantError("APPROVER_GROUP_UNAVAILABLE", 409)
        members = [r["user_id"] for r in conn.execute(
            "SELECT user_id FROM approver_group_members WHERE group_id=? ORDER BY position", (profile["approver_group_id"],)
        ).fetchall()]
        if not members:
            raise GrantError("APPROVER_GROUP_UNAVAILABLE", 409)
        required = {"ANY_ONE": 1, "ALL": len(members), "SEQUENTIAL": len(members)}.get(mode, profile["approvals_required"])
        if mode == "N_OF_M" and (
            required is None or required < 1 or required > len(members)
        ):
            raise GrantError("APPROVAL_QUORUM_INVALID", 422)
        return {"mode": mode, "group_id": profile["approver_group_id"], "members": members, "required": required}

    def create_profile(self, actor: Principal, body: Profile) -> dict:
        actor.require_admin()
        ident = uid()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            self._validate_profile_refs(conn, body)
            conn.execute(
                """INSERT INTO profiles(
                   id,name,integration_id,approver_id,approval_mode,approver_group_id,approvals_required,action_kind,email_template_id,
                   deadline_seconds,reminder_seconds,max_reminders,grant_seconds,enabled
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)""",
                (
                    ident,
                    body.name,
                    body.integration_id,
                    body.approver_id,
                    body.approval_mode,
                    body.approver_group_id,
                    body.approvals_required,
                    body.action_kind,
                    body.email_template_id,
                    body.deadline_seconds,
                    body.reminder_seconds,
                    body.max_reminders,
                    body.grant_seconds,
                ),
            )
            version_id = self._insert_profile_version(conn, ident, 1, body)
            audit(
                conn,
                None,
                actor.id,
                "profile.created",
                {
                    "profile_id": ident,
                    "version_id": version_id,
                    "version": 1,
                    "lifecycle": "DRAFT",
                },
            )
            row = latest_version(conn, ident)
        return version_view(row)

    def update_profile(self, actor: Principal, ident: str, body: ProfileUpdate) -> dict:
        actor.require_admin()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            if not conn.execute("SELECT id FROM profiles WHERE id=?", (ident,)).fetchone():
                raise GrantError("PROFILE_NOT_FOUND", 404)
            self._validate_profile_refs(conn, body)
            current = latest_version(conn, ident)
            active = active_version(conn, ident)
            if current["lifecycle"] in ("DRAFT", "TESTING"):
                conn.execute(
                    """UPDATE profile_versions
                       SET name=?,integration_id=?,approver_id=?,approval_mode=?,approver_group_id=?,approvals_required=?,action_kind=?,email_template_id=?,
                           deadline_seconds=?,reminder_seconds=?,max_reminders=?,grant_seconds=?,
                           tenant_selector=?,environment=?,severity=?,risk_level=?,
                           lifecycle='DRAFT',updated_at=?,activated_at=NULL,disabled_at=NULL
                       WHERE id=?""",
                    (
                        body.name,
                        body.integration_id,
                        body.approver_id,
                        body.approval_mode,
                        body.approver_group_id,
                        body.approvals_required,
                        body.action_kind,
                        body.email_template_id,
                        body.deadline_seconds,
                        body.reminder_seconds,
                        body.max_reminders,
                        body.grant_seconds,
                        body.tenant_selector,
                        body.environment,
                        body.severity,
                        body.risk_level,
                        time.time(),
                        current["id"],
                    ),
                )
                version_id = current["id"]
                version = current["version"]
            else:
                version = current["version"] + 1
                version_id = self._insert_profile_version(conn, ident, version, body)
            self._mirror_profile(conn, ident, body, enabled=active is not None)
            audit(
                conn,
                None,
                actor.id,
                "profile.updated",
                {
                    "profile_id": ident,
                    "version_id": version_id,
                    "version": version,
                    "lifecycle": "DRAFT",
                },
            )
            row = latest_version(conn, ident)
        return version_view(row)

    def profiles(self, actor: Principal) -> list[dict]:
        with self.db.transaction(write=False) as conn:
            if actor.role == "admin":
                profile_ids = [
                    row["id"]
                    for row in conn.execute("SELECT id FROM profiles ORDER BY name,id").fetchall()
                ]
                rows = [latest_version(conn, ident) for ident in profile_ids]
            else:
                query = """SELECT pv.*,t.name AS email_template_name
                           FROM profile_versions pv
                           JOIN integrations i ON i.id=pv.integration_id
                           LEFT JOIN email_templates t ON t.id=pv.email_template_id
                           WHERE pv.lifecycle='ACTIVE' AND i.enabled=1"""
                args: tuple = ()
                if actor.kind == "integration":
                    query += " AND pv.integration_id=?"
                    args = (actor.integration_id,)
                query += " ORDER BY pv.name,pv.profile_id"
                rows = conn.execute(query, args).fetchall()
            result = []
            for row in rows:
                view = version_view(row)
                integration = conn.execute(
                    "SELECT kind,tenant FROM integrations WHERE id=?", (row["integration_id"],)
                ).fetchone()
                if integration:
                    view["integration_kind"] = integration["kind"]
                    view["tenant"] = integration["tenant"]
                if actor.role == "admin":
                    active = active_version(conn, row["profile_id"])
                    view["active_version"] = active["version"] if active else None
                    view["active_version_id"] = active["id"] if active else None
                result.append(view)
        return result

    def transition_profile(self, actor: Principal, ident: str, target: str) -> dict:
        actor.require_admin()
        now = time.time()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            if target == "TESTING":
                row = latest_version(conn, ident)
                if row["lifecycle"] != "DRAFT":
                    raise GrantError("POLICY_TRANSITION_INVALID", 409)
                conn.execute(
                    "UPDATE profile_versions SET lifecycle='TESTING',updated_at=? WHERE id=?",
                    (now, row["id"]),
                )
                action = "profile.testing"
                version_id = row["id"]
            elif target == "ACTIVE":
                row = latest_version(conn, ident)
                if row["lifecycle"] != "TESTING":
                    raise GrantError("POLICY_TRANSITION_INVALID", 409)
                self._validate_version_refs(conn, row)
                conn.execute(
                    """UPDATE profile_versions
                       SET lifecycle='DISABLED',disabled_at=?,updated_at=?
                       WHERE profile_id=? AND lifecycle='ACTIVE' AND id<>?""",
                    (now, now, ident, row["id"]),
                )
                conn.execute(
                    """UPDATE profile_versions
                       SET lifecycle='ACTIVE',activated_at=?,disabled_at=NULL,updated_at=?
                       WHERE id=?""",
                    (now, now, row["id"]),
                )
                conn.execute("UPDATE profiles SET enabled=1 WHERE id=?", (ident,))
                action = "profile.activated"
                version_id = row["id"]
            elif target == "DISABLED":
                row = active_version(conn, ident)
                if not row:
                    raise GrantError("POLICY_TRANSITION_INVALID", 409)
                conn.execute(
                    """UPDATE profile_versions
                       SET lifecycle='DISABLED',disabled_at=?,updated_at=? WHERE id=?""",
                    (now, now, row["id"]),
                )
                conn.execute("UPDATE profiles SET enabled=0 WHERE id=?", (ident,))
                action = "profile.disabled"
                version_id = row["id"]
            else:
                raise GrantError("POLICY_TRANSITION_INVALID", 409)
            current = conn.execute(
                """SELECT pv.*,t.name AS email_template_name
                   FROM profile_versions pv
                   LEFT JOIN email_templates t ON t.id=pv.email_template_id
                   WHERE pv.id=?""",
                (version_id,),
            ).fetchone()
            audit(
                conn,
                None,
                actor.id,
                action,
                {
                    "profile_id": ident,
                    "version_id": version_id,
                    "version": current["version"],
                    "lifecycle": target,
                },
                now,
            )
        return version_view(current)

    def clone_profile(self, actor: Principal, ident: str) -> dict:
        actor.require_admin()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = latest_version(conn, ident)
            new_id = uid()
            cloned = Profile(
                name=row["name"] + " copy",
                integration_id=row["integration_id"],
                approver_id=row["approver_id"],
                approval_mode=row["approval_mode"],
                approver_group_id=row["approver_group_id"],
                approvals_required=row["approvals_required"],
                action_kind=row["action_kind"],
                email_template_id=row["email_template_id"],
                deadline_seconds=row["deadline_seconds"],
                reminder_seconds=row["reminder_seconds"],
                max_reminders=row["max_reminders"],
                grant_seconds=row["grant_seconds"],
                tenant_selector=row["tenant_selector"],
                environment=row["environment"],
                severity=row["severity"],
                risk_level=row["risk_level"],
            )
            conn.execute(
                """INSERT INTO profiles(
                   id,name,integration_id,approver_id,approval_mode,approver_group_id,approvals_required,action_kind,email_template_id,
                   deadline_seconds,reminder_seconds,max_reminders,grant_seconds,enabled
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)""",
                (
                    new_id,
                    cloned.name,
                    cloned.integration_id,
                    cloned.approver_id,
                    cloned.approval_mode,
                    cloned.approver_group_id,
                    cloned.approvals_required,
                    cloned.action_kind,
                    cloned.email_template_id,
                    cloned.deadline_seconds,
                    cloned.reminder_seconds,
                    cloned.max_reminders,
                    cloned.grant_seconds,
                ),
            )
            version_id = self._insert_profile_version(conn, new_id, 1, cloned)
            audit(
                conn,
                None,
                actor.id,
                "profile.cloned",
                {
                    "profile_id": new_id,
                    "source_profile_id": ident,
                    "version_id": version_id,
                },
            )
            current = latest_version(conn, new_id)
        return version_view(current)

    def profile_history(self, actor: Principal, ident: str) -> dict:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            versions = policy_versions(conn, ident)
            events = []
            for row in conn.execute(
                "SELECT id,at,actor,action,detail FROM audit WHERE action LIKE 'profile.%' ORDER BY at DESC,id DESC"
            ).fetchall():
                detail = json.loads(row["detail"])
                if detail.get("profile_id") == ident:
                    events.append({**dict(row), "detail": detail})
        return {"profile_id": ident, "versions": versions, "events": events}

    def preview_policy(self, actor: Principal, body: PolicySample) -> dict:
        actor.require_admin()
        bounded_json(body.source)
        with self.db.transaction(write=False) as conn:
            row, resolution = resolve_policy(
                conn,
                integration_id=body.integration_id,
                action_kind=body.action_kind,
                source=body.source,
            )
            template = self._notification_snapshot(conn, row)
            context = {
                "request_title": body.title,
                "request_url": self.settings.origin + "/requests/preview",
                "external_id": "policy-preview",
                "action_kind": body.action_kind,
                "target": body.target,
                "reason": body.reason or "—",
                "deadline": datetime.fromtimestamp(
                    time.time() + row["deadline_seconds"], UTC
                ).isoformat(),
                "decision_state": "AWAITING",
                "execution_state": "NOT_STARTED",
            }
            rendered = render_from_context(template, "requested", context)
            approval_plan = self._approval_plan(conn, row)
        return {
            "policy": version_view(row),
            "resolution": resolution,
            "approver_id": row["approver_id"],
            "approval_plan": approval_plan,
            "timing": {
                "deadline_seconds": row["deadline_seconds"],
                "reminder_seconds": row["reminder_seconds"],
                "max_reminders": row["max_reminders"],
            },
            "execution_grant": {
                "action_kind": row["action_kind"],
                "validity_seconds": row["grant_seconds"],
            },
            "notification": rendered,
            "execution_allowed": False,
        }

    def test_profile_request(self, actor: Principal, ident: str, body: PolicySample) -> dict:
        actor.require_admin()
        bounded_json(body.source)
        with self.db.transaction(write=False) as conn:
            row = latest_version(conn, ident)
            if row["lifecycle"] != "TESTING":
                raise GrantError("POLICY_TESTING_REQUIRED", 409)
            matched = row["integration_id"] == body.integration_id and row["action_kind"] == body.action_kind
            selectors_match, details, specificity = selector_evaluation(row, body.source)
            matched = matched and selectors_match
            template = self._notification_snapshot(conn, row)
            context = {
                "request_title": body.title,
                "request_url": self.settings.origin + "/requests/test",
                "external_id": "isolated-test",
                "action_kind": body.action_kind,
                "target": body.target,
                "reason": body.reason or "—",
                "deadline": datetime.fromtimestamp(
                    time.time() + row["deadline_seconds"], UTC
                ).isoformat(),
                "decision_state": "AWAITING",
                "execution_state": "NOT_STARTED",
            }
            rendered = render_from_context(template, "requested", context)
        return {
            "test_mode": True,
            "execution_allowed": False,
            "policy": version_view(row),
            "resolution": {
                "matched": matched,
                "specificity": specificity,
                "selectors": details,
            },
            "notification": rendered,
        }

    def _notification_snapshot(
        self, conn: sqlite3.Connection, profile_version: sqlite3.Row
    ) -> dict:
        branding = self._branding(conn)
        if profile_version["email_template_id"]:
            row = conn.execute(
                "SELECT * FROM email_templates WHERE id=? AND enabled=1",
                (profile_version["email_template_id"],),
            ).fetchone()
            if not row:
                raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 409)
            return snapshot(row, branding=branding)
        return snapshot(None, branding=branding)

    def _visible(self, conn: sqlite3.Connection, row: sqlite3.Row, actor: Principal) -> None:
        if actor.kind == "integration":
            if row["integration_id"] != actor.integration_id:
                raise GrantError("REQUEST_NOT_FOUND", 404)
        elif actor.role != "admin":
            plan = json.loads(row["approval_plan"] or "{}")
            members = plan.get("members", [row["approver_id"]])
            if actor.id != row["requester_id"] and not self._delegated_from(conn, actor.id, members, time.time()):
                raise GrantError("REQUEST_NOT_FOUND", 404)

    def _load(
        self, conn: sqlite3.Connection, ident: str, actor: Principal | None = None
    ) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM requests WHERE id=?", (ident,)).fetchone()
        if not row:
            raise GrantError("REQUEST_NOT_FOUND", 404)
        if actor:
            self._visible(conn, row, actor)
        return row

    def _mail_event(
        self,
        conn: sqlite3.Connection,
        row: sqlite3.Row,
        now: float,
        event: str,
    ) -> None:
        recipient_id = (
            row["approver_id"]
            if event in ("requested", "reminder")
            else (row["requester_id"] or row["approver_id"])
        )
        user = conn.execute(
            "SELECT email,enabled FROM users WHERE id=?", (recipient_id,)
        ).fetchone()
        if not user or not user["enabled"]:
            audit(
                conn,
                row["id"],
                "policy",
                "notification.recipient_unavailable",
                {"event_type": event, "recipient_id": recipient_id},
                now,
            )
            return
        ident = uid()
        template = json.loads(row["mail_template"])
        payload = render_notification(template, row, self.settings.origin, event=event)
        conn.execute(
            """INSERT INTO outbox(
               id,request_id,kind,event_type,revision,payload,destination,available_at,created_at
            ) VALUES(?,?,'email',?,?,?,?,?,?)""",
            (
                ident,
                row["id"],
                event,
                row["revision"],
                json_text(payload),
                self.settings.seal({"email": user["email"]}),
                now,
                now,
            ),
        )

    def _mail(
        self, conn: sqlite3.Connection, row: sqlite3.Row, now: float, reminder: bool = False
    ) -> None:
        self._mail_event(conn, row, now, "reminder" if reminder else "requested")

    def _event(
        self, conn: sqlite3.Connection, row: sqlite3.Row, now: float, reason: str = ""
    ) -> None:
        integration = conn.execute(
            "SELECT destination FROM integrations WHERE id=?", (row["integration_id"],)
        ).fetchone()
        ident = uid()
        payload = {
            "schema_version": 1,
            "event_type": "grant.approval.outcome",
            "occurred_at": now,
            "event_id": ident,
            "state_revision": row["revision"],
            "request_id": row["id"],
            "external_id": row["external_id"],
            "source": json.loads(row["source"]),
            "state": row["state"],
            "decision": row["decision"],
            "decision_actor": row["decision_actor"],
            "decision_at": row["decision_at"],
            "action_hash": row["action_hash"],
            "grant_until": row["grant_until"],
            "execution_state": row["execution_state"],
            "reason": reason,
            "request_url": self.settings.origin + "/requests/" + row["id"],
        }
        conn.execute(
            """INSERT INTO outbox(
               id,request_id,kind,event_type,revision,payload,destination,available_at,created_at
            ) VALUES(?,?,'webhook','approval_outcome',?,?,?,?,?)""",
            (ident, row["id"], row["revision"], json_text(payload), integration[0], now, now),
        )

    @staticmethod
    def _paused(conn: sqlite3.Connection) -> bool:
        return conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"

    def _expire(self, conn: sqlite3.Connection, row: sqlite3.Row, now: float) -> bool:
        if self._paused(conn):
            return False
        due = (row["state"] in ("AWAITING", "HELD") and row["deadline"] <= now) or (
            row["state"] == "APPROVED" and row["grant_until"] <= now and not row["execution_id"]
        )
        if not due:
            return False
        conn.execute(
            "UPDATE requests SET state='EXPIRED',revision=revision+1 WHERE id=?", (row["id"],)
        )
        updated = self._load(conn, row["id"])
        audit(conn, row["id"], "policy", "request.expired", now=now)
        self._event(
            conn, updated, now, "Deadline or execution validity elapsed; not a human denial"
        )
        self._mail_event(conn, updated, now, "expired")
        return True

    def create_request(self, actor: Principal, body: Intake) -> dict:
        if actor.kind == "integration":
            actor.require_scope("request:create")
        data = body.model_dump()
        bounded_json(data)
        if len(json_text(data).encode()) > 32768:
            raise GrantError("REQUEST_TOO_LARGE", 413)
        action = body.action.model_dump()
        action_hash, intake_hash = fingerprint(action), fingerprint(data)
        now, ident = time.time(), uid()
        requester = actor.id if actor.kind == "human" else None
        with self.db.transaction() as conn:
            require_current_authority(conn, actor, "request:create")

            if actor.kind == "integration":
                existing = conn.execute(
                    "SELECT * FROM requests WHERE integration_id=? AND external_id=?",
                    (actor.integration_id, body.external_id),
                ).fetchone()
            else:
                selected_profile = conn.execute(
                    "SELECT integration_id FROM profiles WHERE id=?", (body.profile_id,)
                ).fetchone()
                if not selected_profile:
                    raise GrantError("PROFILE_NOT_FOUND", 404)
                expected_active = active_version(conn, body.profile_id)
                idempotency_integration_id = (
                    expected_active["integration_id"]
                    if expected_active
                    else selected_profile["integration_id"]
                )
                existing = conn.execute(
                    "SELECT * FROM requests WHERE integration_id=? AND external_id=?",
                    (idempotency_integration_id, body.external_id),
                ).fetchone()
            if existing:
                self._visible(conn, existing, actor)
                if (
                    existing["intake_hash"] != intake_hash
                    or existing["requester_id"] != requester
                    or existing["profile_id"] != body.profile_id
                ):
                    raise GrantError("IDEMPOTENCY_CONFLICT", 409)
                return self._project(conn, existing)

            if str(body.source.get("event_type", "")).startswith("grant."):
                raise GrantError("OUTCOME_FEEDBACK_LOOP", 422)

            selected_profile = conn.execute(
                "SELECT id,integration_id FROM profiles WHERE id=?", (body.profile_id,)
            ).fetchone()
            if not selected_profile:
                raise GrantError("PROFILE_NOT_FOUND", 404)
            expected_active = active_version(conn, body.profile_id)
            if actor.kind == "integration":
                integration_id = actor.integration_id
            elif expected_active:
                integration_id = expected_active["integration_id"]
            else:
                integration_id = selected_profile["integration_id"]

            integration = conn.execute(
                "SELECT enabled,tenant FROM integrations WHERE id=?",
                (integration_id,),
            ).fetchone()
            if not integration or not integration["enabled"]:
                raise GrantError("PROFILE_NOT_FOUND", 404)
            if integration["tenant"] and body.source.get("tenant_id") != integration["tenant"]:
                raise GrantError("SOURCE_TENANT_MISMATCH", 403)

            try:
                profile, resolution = resolve_policy(
                    conn,
                    integration_id=integration_id,
                    action_kind=action["kind"],
                    source=body.source,
                )
            except GrantError as exc:
                if exc.code == "POLICY_NO_MATCH" and expected_active is None:
                    raise GrantError("PROFILE_SELECTION_MISMATCH", 409) from exc
                raise
            if profile["profile_id"] != body.profile_id:
                raise GrantError("PROFILE_SELECTION_MISMATCH", 409)

            mail_template = self._notification_snapshot(conn, profile)
            approval_plan = self._approval_plan(conn, profile)
            if requester in approval_plan["members"]:
                raise GrantError("SELF_APPROVAL_PROHIBITED", 403)
            for member_id in approval_plan["members"]:
                approver = conn.execute(
                    "SELECT enabled FROM users WHERE id=?", (member_id,)
                ).fetchone()
                if not approver or not approver["enabled"]:
                    raise GrantError("APPROVER_UNAVAILABLE", 409)

            if body.predecessor_id:
                previous = self._load(conn, body.predecessor_id, actor)
                if (
                    previous["integration_id"] != integration_id
                    or not (
                        previous["state"] == "CANCELLED"
                        or (
                            previous["state"] == "EXPIRED"
                            and previous["collaboration_state"] == "CHANGES_REQUESTED"
                        )
                    )
                ):
                    raise GrantError("PREDECESSOR_NOT_REPLACEABLE", 409)
                if previous["requester_id"] != requester:
                    raise GrantError("PREDECESSOR_OWNER_MISMATCH", 403)

            values = {
                "id": ident,
                "integration_id": integration_id,
                "external_id": body.external_id,
                "profile_id": body.profile_id,
                "profile_version_id": profile["id"],
                "requester_id": requester,
                "approver_id": approval_plan["members"][0],
                "approval_plan": json_text(approval_plan),
                "title": body.title,
                "action": json_text(action),
                "action_hash": action_hash,
                "intake_hash": intake_hash,
                "source": json_text(body.source),
                "reason": body.reason,
                "predecessor_id": body.predecessor_id,
                "mail_template": json_text(mail_template),
                "state": "AWAITING",
                "created_at": now,
                "deadline": now + profile["deadline_seconds"],
                "grant_seconds": profile["grant_seconds"],
                "next_reminder": now + profile["reminder_seconds"],
                "reminder_seconds": profile["reminder_seconds"],
                "max_reminders": profile["max_reminders"],
            }
            columns = ",".join(values)
            conn.execute(
                f"INSERT INTO requests({columns}) VALUES({','.join('?' for _ in values)})",
                tuple(values.values()),
            )
            row = self._load(conn, ident)
            audit(
                conn,
                ident,
                actor.id,
                "request.created",
                {
                    "action_hash": action_hash,
                    "policy_version_id": profile["id"],
                    "policy_version": profile["version"],
                    "policy_resolution": resolution,
                },
                now,
            )
            self._mail_event(conn, row, now, "requested")
            return self._project(conn, row)

    @classmethod
    def _viewer_assignment(
        cls, conn: sqlite3.Connection, row: sqlite3.Row, actor: Principal, now: float
    ) -> dict:
        if actor.kind != "human":
            return {"viewer_assigned": False, "viewer_can_decide": False, "viewer_delegated_for": None}
        plan = json.loads(row["approval_plan"] or "{}")
        members = plan.get("members", [row["approver_id"]])
        represented = cls._delegated_from(conn, actor.id, members, now)
        assigned = bool(represented) and actor.id != row["requester_id"]
        can_decide = (
            assigned
            and row["state"] in ("AWAITING", "HELD")
            and row["deadline"] > now
            and row["collaboration_state"] == "OPEN"
        )
        if can_decide:
            decisions = {
                decision["actor_id"]: decision["decision"]
                for decision in conn.execute(
                    "SELECT actor_id,decision FROM request_decisions WHERE request_id=?",
                    (row["id"],),
                ).fetchall()
            }
            if decisions.get(represented) in ("APPROVED", "DENIED"):
                can_decide = False
            elif plan.get("mode") == "SEQUENTIAL":
                pending = [
                    member for member in members
                    if decisions.get(member) not in ("APPROVED", "DENIED")
                ]
                can_decide = bool(pending) and pending[0] == represented
        return {
            "viewer_assigned": assigned,
            "viewer_can_decide": can_decide,
            "viewer_delegated_for": represented if represented != actor.id else None,
        }

    def get(self, actor: Principal, ident: str) -> dict:
        with self.db.transaction() as conn:
            row = self._load(conn, ident, actor)
            now = time.time()
            self._expire(conn, row, now)
            current = self._load(conn, ident)
            return {
                **self._project(conn, current),
                **self._viewer_assignment(conn, current, actor, now),
            }

    def compare_replacement(self, actor: Principal, ident: str) -> dict:
        with self.db.transaction(write=False) as conn:
            latest = self._load(conn, ident, actor)
            if not latest["predecessor_id"]:
                raise GrantError("REVISION_COMPARISON_NOT_AVAILABLE", 409)
            # A new approver has authority over the replacement even if the
            # prior request was assigned to a different approval group.
            # Cross-request access is permitted only by verified lineage.
            previous = self._load(conn, latest["predecessor_id"])
            if (
                previous["integration_id"] != latest["integration_id"]
                or previous["requester_id"] != latest["requester_id"]
            ):
                raise GrantError("REVISION_LINEAGE_INVALID", 409)

            old_action = json.loads(previous["action"])
            new_action = json.loads(latest["action"])
            candidates = {
                "title": (previous["title"], latest["title"]),
                "reason": (previous["reason"], latest["reason"]),
                "action.kind": (old_action["kind"], new_action["kind"]),
                "action.target": (old_action["target"], new_action["target"]),
                "action.parameters": (
                    old_action["parameters"], new_action["parameters"],
                ),
                "source": (json.loads(previous["source"]), json.loads(latest["source"])),
            }
            changes = {
                field: {"before": old, "after": new}
                for field, (old, new) in candidates.items()
                if old != new
            }
            return {
                "request_id": latest["id"],
                "predecessor_id": previous["id"],
                "predecessor_state": previous["state"],
                "action_changed": previous["action_hash"] != latest["action_hash"],
                "fresh_approval_required": True,
                "changes": changes,
            }

    def add_request_comment(
        self, actor: Principal, ident: str, body: RequestComment
    ) -> dict:
        if actor.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        now = time.time()
        expired = False
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = self._load(conn, ident, actor)
            if row["revision"] != body.expected_revision:
                raise GrantError("STALE_OR_FINAL_REQUEST", 409)
            if self._paused(conn):
                raise GrantError("RECOVERY_PAUSED", 409)
            progress = row["collaboration_state"]
            if body.kind in ("REQUEST_INFO", "REQUEST_CHANGES", "INFO_RESPONSE"):
                if row["state"] not in ("AWAITING", "HELD") or row["execution_id"]:
                    raise GrantError("COLLABORATION_NOT_ALLOWED", 409)
                expired = self._expire(conn, row, now)
                if not expired:
                    if body.kind == "INFO_RESPONSE":
                        if actor.id != row["requester_id"]:
                            raise GrantError("REQUESTER_REQUIRED", 403)
                        if progress != "INFO_REQUESTED":
                            raise GrantError("COLLABORATION_RESPONSE_NOT_PENDING", 409)
                        progress = "OPEN"
                    else:
                        if actor.id == row["requester_id"] or not self._viewer_assignment(
                            conn, row, actor, now
                        )["viewer_can_decide"]:
                            raise GrantError("ASSIGNED_APPROVER_REQUIRED", 403)
                        if progress == "CHANGES_REQUESTED":
                            raise GrantError("REPLACEMENT_REQUIRED", 409)
                        if body.kind == "REQUEST_INFO" and not row["requester_id"]:
                            raise GrantError("REQUESTER_UNAVAILABLE", 409)
                        progress = (
                            "INFO_REQUESTED"
                            if body.kind == "REQUEST_INFO"
                            else "CHANGES_REQUESTED"
                        )
            if not expired:
                if not body.body.strip():
                    raise GrantError("COMMENT_EMPTY", 422)
                count = conn.execute(
                    "SELECT count(*) FROM request_comments WHERE request_id=?", (ident,)
                ).fetchone()[0]
                if count >= 200:
                    raise GrantError("COMMENT_LIMIT_REACHED", 409)
                comment_id = uid()
                conn.execute(
                    """INSERT INTO request_comments(id,request_id,author_id,kind,body,created_at)
                       VALUES(?,?,?,?,?,?)""",
                    (comment_id, ident, actor.id, body.kind, body.body, now),
                )
                conn.execute(
                    "UPDATE requests SET collaboration_state=?,revision=revision+1 WHERE id=?",
                    (progress, ident),
                )
                if body.kind in ("REQUEST_INFO", "REQUEST_CHANGES"):
                    # Queued approval reminders would mislead approvers when
                    # they currently cannot decide. Already-in-flight SMTP is
                    # not retractable; the transport revalidates before leasing.
                    conn.execute(
                        """UPDATE outbox SET state='SUPERSEDED',lease_token=NULL,
                              lease_until=NULL,last_error=NULL
                           WHERE request_id=? AND kind='email'
                             AND event_type='reminder' AND state IN ('PENDING','FAILED')""",
                        (ident,),
                    )
                elif body.kind == "INFO_RESPONSE":
                    # Restart the reminder schedule after a requester response.
                    conn.execute(
                        "UPDATE requests SET next_reminder=? WHERE id=?",
                        (now + row["reminder_seconds"], ident),
                    )
                audit(
                    conn, ident, actor.id, "request.collaboration",
                    {
                        "comment_id": comment_id,
                        "kind": body.kind,
                        "collaboration_state": progress,
                    },
                    now,
                )
                result = self._project(conn, self._load(conn, ident))
        if expired:
            # _expire wrote audit, outbox and terminal state in the committed
            # transaction. Raising inside it would roll all of that back.
            raise GrantError("REQUEST_EXPIRED", 409)
        return result

    def list_requests(
        self,
        actor: Principal,
        limit: int = 100,
        offset: int = 0,
        *,
        view: str = "all",
        search: str = "",
        state: str | None = None,
        collaboration_state: str | None = None,
        policy_id: str | None = None,
        requester_id: str | None = None,
        approver_id: str | None = None,
        group_id: str | None = None,
        integration_id: str | None = None,
        action_kind: str | None = None,
        created_after: float | None = None,
        created_before: float | None = None,
        delivery_state: str | None = None,
        execution_state: str | None = None,
    ) -> list[dict]:
        """Stream role-visible rows and page *after* all server-side filters."""
        allowed_views = {
            "all", "needs", "overdue", "held", "delegated",
            "recent", "requester", "escalated",
            "ops_pending", "ops_overdue", "ops_approved_unused",
            "ops_execution_unknown", "ops_execution_failed",
            "ops_email_failed", "ops_webhook_failed", "ops_delivery_failed",
            "ops_decided",
        }
        if (
            view not in allowed_views
            or (state is not None and state not in {
                "AWAITING", "HELD", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"
            })
            or (
                collaboration_state is not None
                and collaboration_state not in {
                    "OPEN", "INFO_REQUESTED", "CHANGES_REQUESTED"
                }
            )
            or limit < 1 or limit > 100 or offset < 0
        ):
            raise GrantError("REQUEST_FILTER_INVALID", 422)
        if view.startswith("ops_"):
            actor.require_admin()
        if actor.kind == "integration" and view != "all":
            raise GrantError("HUMAN_REQUIRED", 403)
        if actor.kind not in ("human", "integration"):
            raise GrantError("AUTHENTICATION_REQUIRED", 401)

        self.maintenance()
        now = time.time()
        clauses: list[str] = []
        args: list[Any] = []

        if actor.kind == "integration":
            clauses.append("requests.integration_id=?")
            args.append(actor.integration_id)
        elif actor.role != "admin":
            clauses.append(
                """(requests.requester_id=? OR requests.approver_id=?
                    OR requests.approval_plan LIKE ?
                    OR EXISTS (
                        SELECT 1 FROM delegations d
                        WHERE d.substitute_id=?
                          AND d.revoked_at IS NULL
                          AND d.starts_at<=? AND d.ends_at>?
                          AND (
                            d.delegator_id=requests.approver_id
                            OR requests.approval_plan LIKE '%"' || d.delegator_id || '"%'
                          )
                    ))"""
            )
            args.extend([
                actor.id, actor.id, f'%"{actor.id}"%', actor.id, now, now,
            ])

        for value, column in (
            (state, "requests.state"),
            (collaboration_state, "requests.collaboration_state"),
            (policy_id, "requests.profile_id"),
            (requester_id, "requests.requester_id"),
            (integration_id, "requests.integration_id"),
            (execution_state, "requests.execution_state"),
        ):
            if value is not None:
                clauses.append(f"{column}=?")
                args.append(value)
        if action_kind is not None:
            clauses.append("json_extract(requests.action,'$.kind')=?")
            args.append(action_kind)
        if approver_id is not None:
            clauses.append(
                """(requests.approver_id=? OR EXISTS (
                    SELECT 1 FROM json_each(requests.approval_plan,'$.members')
                    WHERE value=?
                ))"""
            )
            args.extend([approver_id, approver_id])
        if group_id is not None:
            clauses.append("json_extract(requests.approval_plan,'$.group_id')=?")
            args.append(group_id)
        if created_after is not None:
            clauses.append("requests.created_at>=?")
            args.append(created_after)
        if created_before is not None:
            clauses.append("requests.created_at<=?")
            args.append(created_before)
        if search:
            # A search term is literal text; percent/underscore must not
            # silently become arbitrary SQL LIKE wildcards.
            term = search.lower().replace("!", "!!").replace("%", "!%").replace("_", "!_")
            clauses.append(
                """(LOWER(requests.title) LIKE ? ESCAPE '!'
                    OR LOWER(requests.external_id) LIKE ? ESCAPE '!')"""
            )
            args.extend([f"%{term}%", f"%{term}%"])

        query = "SELECT requests.* FROM requests"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY requests.created_at DESC, requests.id DESC LIMIT ? OFFSET ?"

        def included(row: dict) -> bool:
            if delivery_state is not None and row["delivery_state"] != delivery_state:
                return False
            if view.startswith("ops_"):
                if view == "ops_pending":
                    return row["state"] in ("AWAITING", "HELD")
                if view == "ops_overdue":
                    return bool(
                        row["overdue"]
                        or (
                            row["state"] == "EXPIRED"
                            and row["decision"] is None
                            and row["deadline"] <= now
                        )
                    )
                if view == "ops_approved_unused":
                    return row["state"] == "APPROVED" and row["execution_state"] == "NOT_STARTED"
                if view == "ops_execution_unknown":
                    return row["execution_state"] == "UNKNOWN"
                if view == "ops_execution_failed":
                    return row["execution_state"] == "REPORTED_FAILED"
                if view == "ops_email_failed":
                    return row["notification_failure_count"] > 0
                if view == "ops_webhook_failed":
                    return row["delivery_state"] == "FAILED"
                if view == "ops_delivery_failed":
                    return row["delivery_state"] == "FAILED" or row["notification_failure_count"] > 0
                if view == "ops_decided":
                    return row["decision_at"] is not None
            assigned = row["viewer_assigned"]
            if view == "needs":
                return bool(row["viewer_can_decide"])
            if view == "held":
                return bool(assigned and row["state"] == "HELD")
            if view == "delegated":
                return bool(row["viewer_delegated_for"])
            if view == "requester":
                return actor.kind == "human" and row["requester_id"] == actor.id
            if view == "recent":
                represented = row["viewer_delegated_for"] or actor.id
                return bool(
                    assigned and any(
                        item["actor_id"] == represented
                        and item["decision"] in ("APPROVED", "DENIED")
                        for item in row["decisions"]
                    )
                )
            if view == "overdue":
                return bool(row["overdue"] or row["state"] == "EXPIRED")
            if view == "escalated":
                return bool(row["escalation"] and row["escalation"]["fired_at"] is not None)
            return True

        result: list[dict] = []
        matched = 0
        cursor = 0
        chunk = max(100, min(200, limit * 2))
        with self.db.transaction(write=False) as conn:
            # Streaming bounded fetches keep page results correct even when
            # viewer/delegation/outbox filters are computed after SQL predicates.
            while len(result) < limit:
                page = conn.execute(query, (*args, chunk, cursor)).fetchall()
                if not page:
                    break
                cursor += len(page)
                for source in page:
                    try:
                        self._visible(conn, source, actor)
                    except GrantError as exc:
                        if exc.code == "REQUEST_NOT_FOUND":
                            continue
                        raise
                    item = {
                        **self._project(conn, source, detail=False),
                        **self._viewer_assignment(conn, source, actor, now),
                    }
                    if not included(item):
                        continue
                    if matched >= offset:
                        result.append(item)
                        if len(result) == limit:
                            break
                    matched += 1
                if len(page) < chunk:
                    break
        return result

    def decide(self, actor: Principal, ident: str, body: Decision) -> dict:
        if actor.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        self.get(actor, ident)
        error = None
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = self._load(conn, ident, actor)
            now = time.time()
            if row["collaboration_state"] != "OPEN":
                raise GrantError("COLLABORATION_RESPONSE_REQUIRED", 409)
            plan = json.loads(row["approval_plan"] or "{}") or {
                "mode": "SINGLE", "members": [row["approver_id"]], "required": 1
            }
            members = plan.get("members", [row["approver_id"]])
            represented = self._delegated_from(conn, actor.id, members, now)
            if not represented or actor.id == row["requester_id"]:
                raise GrantError("ASSIGNED_APPROVER_REQUIRED", 403)
            prior = conn.execute(
                "SELECT decision FROM request_decisions WHERE request_id=? AND actor_id=?",
                (ident, represented),
            ).fetchone()
            if prior and prior["decision"] == body.decision:
                return self._project(conn, row)
            if prior and prior["decision"] != "HELD":
                raise GrantError("DECISION_ALREADY_RECORDED", 409)
            if self._expire(conn, row, now):
                error = GrantError("REQUEST_EXPIRED")
            elif row["revision"] != body.expected_revision or row["state"] not in ("AWAITING", "HELD"):
                raise GrantError("STALE_OR_FINAL_DECISION")
            else:
                mode = plan.get("mode", "SINGLE")
                decisions = {r["actor_id"]: r["decision"] for r in conn.execute(
                    "SELECT actor_id,decision FROM request_decisions WHERE request_id=?", (ident,)
                ).fetchall()}
                if mode == "SEQUENTIAL":
                    pending = [
                        member
                        for member in members
                        if decisions.get(member) not in ("APPROVED", "DENIED")
                    ]
                    if not pending or pending[0] != represented:
                        raise GrantError("APPROVAL_STEP_NOT_CURRENT", 409)
                conn.execute(
                    """INSERT INTO request_decisions(request_id,actor_id,decision,reason,decided_at)
                       VALUES(?,?,?,?,?) ON CONFLICT(request_id,actor_id) DO UPDATE SET
                       decision=excluded.decision,reason=excluded.reason,decided_at=excluded.decided_at""",
                    (ident, represented, body.decision, body.reason, now),
                )
                decisions[represented] = body.decision
                approvals = sum(value == "APPROVED" for value in decisions.values())
                denials = sum(value == "DENIED" for value in decisions.values())
                holds = sum(value == "HELD" for value in decisions.values())
                required = int(plan.get("required") or 1)
                if denials:
                    state, until = "DENIED", None
                elif approvals >= required:
                    state, until = "APPROVED", now + row["grant_seconds"]
                elif holds:
                    state, until = "HELD", None
                else:
                    state, until = "AWAITING", None
                conn.execute(
                    "UPDATE requests SET state=?,decision=?,decision_actor=?,decision_at=?,grant_until=?,revision=revision+1 WHERE id=?",
                    (state, state if state in ("APPROVED","DENIED") else None,
                     actor.id if state in ("APPROVED","DENIED") else None,
                     now if state in ("APPROVED","DENIED") else None, until, ident),
                )
                audit(conn, ident, actor.id, "request.decision_recorded", {
                    "decision": body.decision, "reason": body.reason, "mode": mode, "represented_approver": represented,
                    "approvals": approvals, "required": required, "final_state": state,
                }, now)
                updated = self._load(conn, ident)
                self._event(conn, updated, now, body.reason)
                if state in ("APPROVED", "DENIED"):
                    self._mail_event(conn, updated, now, state.lower())
            result = self._project(conn, self._load(conn, ident))
        if error:
            raise error
        return result

    def cancel(self, actor: Principal, ident: str, body: Cancel) -> dict:
        error = None
        with self.db.transaction() as conn:
            require_current_authority(conn, actor, "request:create")
            row = self._load(conn, ident, actor)
            allowed = (actor.kind == "integration" and "request:create" in actor.scopes) or (
                actor.kind == "human" and (actor.role == "admin" or actor.id == row["requester_id"])
            )
            if not allowed:
                raise GrantError("CANCELLATION_FORBIDDEN", 403)
            if row["execution_id"]:
                raise GrantError("EXECUTION_ALREADY_COMMITTED")
            if row["state"] == "CANCELLED":
                return self._project(conn, row)
            now = time.time()
            if self._expire(conn, row, now):
                error = GrantError("REQUEST_EXPIRED")
            elif row["revision"] != body.expected_revision or row["state"] in ("DENIED", "EXPIRED"):
                raise GrantError("STALE_OR_FINAL_REQUEST")
            else:
                conn.execute(
                    "UPDATE requests SET state='CANCELLED',revision=revision+1 WHERE id=?", (ident,)
                )
                audit(conn, ident, actor.id, "request.cancelled", {"reason": body.reason}, now)
                updated = self._load(conn, ident)
                self._event(conn, updated, now, body.reason)
                self._mail_event(conn, updated, now, "cancelled")
            result = self._project(conn, self._load(conn, ident))
        if error:
            raise error
        return result

    def consume(self, actor: Principal, ident: str, body: Consume) -> dict:
        actor.require_scope("grant:consume")
        self.get(actor, ident)
        error = None
        with self.db.transaction() as conn:
            require_current_authority(conn, actor, "grant:consume")
            row, now = self._load(conn, ident, actor), time.time()
            if conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1":
                raise GrantError("RECOVERY_RECONCILIATION_REQUIRED", 503)
            if row["action_hash"] != body.action_hash:
                raise GrantError("ACTION_FINGERPRINT_MISMATCH")
            if row["execution_id"]:
                if row["execution_id"] != body.execution_id:
                    raise GrantError("EXECUTION_ALREADY_COMMITTED")
                return {
                    "request_id": ident,
                    "execution_id": body.execution_id,
                    "committed": True,
                    "replay": True,
                    "action_hash": row["action_hash"],
                }
            if self._expire(conn, row, now):
                error = GrantError("GRANT_EXPIRED")
            elif row["state"] != "APPROVED" or not row["grant_until"] or row["grant_until"] <= now:
                raise GrantError("VALID_APPROVAL_REQUIRED", 409)
            else:
                conn.execute(
                    "UPDATE requests SET execution_id=?,execution_state='COMMITTED',committed_at=?,revision=revision+1 WHERE id=?",
                    (body.execution_id, now, ident),
                )
                audit(
                    conn,
                    ident,
                    actor.id,
                    "execution.committed",
                    {"execution_id": body.execution_id, "action_hash": body.action_hash},
                    now,
                )
        if error:
            raise error
        return {
            "request_id": ident,
            "execution_id": body.execution_id,
            "committed": True,
            "replay": False,
            "action_hash": body.action_hash,
        }

    def report(self, actor: Principal, ident: str, body: Result) -> dict:
        actor.require_scope("result:write")
        encoded = json_text(body.model_dump())
        with self.db.transaction() as conn:
            require_current_authority(conn, actor, "result:write")
            row = self._load(conn, ident, actor)
            if row["execution_id"] != body.execution_id or row["action_hash"] != body.action_hash:
                raise GrantError("EXECUTION_BINDING_MISMATCH")
            if row["execution_result"] == encoded:
                return self._project(conn, row)
            if row["execution_state"] in ("REPORTED_SUCCEEDED", "REPORTED_FAILED"):
                raise GrantError("RESULT_ALREADY_FINAL")
            if row["execution_state"] == "UNKNOWN" and body.status == "RUNNING":
                raise GrantError("RESULT_REGRESSION")
            conn.execute(
                "UPDATE requests SET execution_state=?,execution_result=?,revision=revision+1 WHERE id=?",
                (body.status, encoded, ident),
            )
            audit(
                conn,
                ident,
                actor.id,
                "execution.result_reported",
                {"status": body.status, "evidence": body.evidence},
            )
            updated = self._load(conn, ident)
            event = {
                "REPORTED_SUCCEEDED": "execution_succeeded",
                "REPORTED_FAILED": "execution_failed",
                "UNKNOWN": "execution_unknown",
            }.get(body.status)
            if event:
                self._mail_event(conn, updated, time.time(), event)
            return self._project(conn, updated)

    def resume_after_restore(self, *, acknowledged: bool) -> dict:
        """Conservative local recovery: no restored pending approval can be reused."""
        if not acknowledged:
            raise GrantError("EXTERNAL_RECONCILIATION_ACK_REQUIRED", 422)
        now = time.time()
        with self.db.transaction() as conn:
            if conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] != "1":
                raise GrantError("NOT_IN_RECOVERY", 409)
            rows = conn.execute(
                "SELECT * FROM requests WHERE execution_id IS NULL AND state IN ('AWAITING','HELD','APPROVED')"
            ).fetchall()
            for row in rows:
                conn.execute(
                    "UPDATE requests SET state='CANCELLED',revision=revision+1 WHERE id=?",
                    (row["id"],),
                )
                audit(
                    conn,
                    row["id"],
                    "recovery-operator",
                    "request.cancelled_after_restore",
                    {"prior_state": row["state"]},
                    now,
                )
                self._event(
                    conn,
                    self._load(conn, row["id"]),
                    now,
                    "Restored open request invalidated; create a fresh request after reconciliation",
                )
            in_flight = conn.execute(
                "SELECT id FROM requests WHERE execution_id IS NOT NULL AND execution_state IN ('COMMITTED','RUNNING')"
            ).fetchall()
            for row in in_flight:
                conn.execute(
                    "UPDATE requests SET execution_state='UNKNOWN',execution_result=NULL,revision=revision+1 WHERE id=?",
                    (row["id"],),
                )
                audit(
                    conn,
                    row["id"],
                    "recovery-operator",
                    "execution.reconciliation_required",
                    now=now,
                )
            conn.execute("UPDATE runtime SET value='0' WHERE key='paused'")
            audit(
                conn,
                None,
                "recovery-operator",
                "recovery.resumed",
                {"cancelled_open_requests": len(rows), "unknown_executions": len(in_flight)},
                now,
            )
        return {
            "cancelled_open_requests": len(rows),
            "unknown_executions": len(in_flight),
            "paused": False,
        }

    def maintenance(self) -> None:
        now = time.time()
        with self.db.transaction() as conn:
            if self._paused(conn):
                return
            rows = conn.execute(
                "SELECT * FROM requests WHERE state IN ('AWAITING','HELD','APPROVED') AND execution_id IS NULL"
            ).fetchall()
            for escalation in conn.execute(
                "SELECT * FROM escalations WHERE fired_at IS NULL AND due_at<=?", (now,)
            ).fetchall():
                current = conn.execute(
                    "SELECT * FROM requests WHERE id=?", (escalation["request_id"],)
                ).fetchone()
                if (
                    not current
                    or current["state"] not in ("AWAITING", "HELD")
                    or current["deadline"] <= now
                ):
                    continue
                plan = json.loads(current["approval_plan"] or "{}")
                members = list(plan.get("members", [current["approver_id"]]))
                targets = json.loads(escalation["target_members"] or "[]")
                added: list[str] = []
                for target in targets:
                    available = conn.execute(
                        "SELECT enabled FROM users WHERE id=?", (target,)
                    ).fetchone()
                    if (
                        available
                        and available["enabled"]
                        and target != current["requester_id"]
                        and target not in members
                    ):
                        members.append(target)
                        added.append(target)
                if added:
                    plan["members"] = members
                    conn.execute(
                        "UPDATE requests SET approval_plan=?,revision=revision+1 WHERE id=?",
                        (json_text(plan), current["id"]),
                    )
                conn.execute(
                    "UPDATE escalations SET fired_at=? WHERE request_id=?",
                    (now, current["id"]),
                )
                audit(
                    conn,
                    current["id"],
                    "policy",
                    "request.escalated",
                    {
                        "target_user_id": escalation["target_user_id"],
                        "target_group_id": escalation["target_group_id"],
                        "target_members": targets,
                        "added_members": added,
                    },
                    now,
                )
            for row in rows:
                if self._expire(conn, row, now):
                    continue
                if (
                    row["state"] in ("AWAITING", "HELD")
                    and row["collaboration_state"] == "OPEN"
                    and row["next_reminder"] <= now
                    and row["reminder_count"] < row["max_reminders"]
                ):
                    self._mail_event(conn, row, now, "reminder")
                    conn.execute(
                        "UPDATE requests SET reminder_count=reminder_count+1,next_reminder=? WHERE id=?",
                        (now + row["reminder_seconds"], row["id"]),
                    )
                    audit(conn, row["id"], "policy", "request.reminded", now=now)

    def _project(self, conn: sqlite3.Connection, row: sqlite3.Row, detail: bool = True) -> dict:
        out = dict(row)
        for field in ("action", "source", "execution_result", "approval_plan"):
            out[field] = json.loads(out[field]) if out[field] else None
        for field in (
            "intake_hash",
            "next_reminder",
            "grant_seconds",
            "reminder_seconds",
            "mail_template",
        ):
            out.pop(field, None)
        version = None
        if out.get("profile_version_id"):
            version_row = conn.execute(
                "SELECT version FROM profile_versions WHERE id=?", (out["profile_version_id"],)
            ).fetchone()
            version = version_row["version"] if version_row else None
        out["policy_version"] = version
        out["decisions"] = [dict(r) for r in conn.execute("SELECT actor_id,decision,reason,decided_at FROM request_decisions WHERE request_id=? ORDER BY decided_at,actor_id", (row["id"],)).fetchall()]
        plan = out["approval_plan"] or {
            "mode": "SINGLE", "members": [row["approver_id"]], "required": 1,
        }
        votes = {vote["actor_id"]: vote["decision"] for vote in out["decisions"]}
        members = plan.get("members", [row["approver_id"]])
        approved_count = sum(votes.get(member) == "APPROVED" for member in members)
        undecided_members = [
            member for member in members
            if votes.get(member) not in ("APPROVED", "DENIED")
        ]
        waiting_members = (
            undecided_members[:1]
            if plan.get("mode") == "SEQUENTIAL"
            else undecided_members
        )
        waiting_on = "CLOSED"
        if row["state"] in ("AWAITING", "HELD"):
            waiting_on = {
                "OPEN": "APPROVERS",
                "INFO_REQUESTED": "REQUESTER_INFO",
                "CHANGES_REQUESTED": "REQUESTER_REVISION",
            }[row["collaboration_state"]]
        elif row["state"] == "APPROVED":
            if row["execution_state"] == "NOT_STARTED":
                waiting_on = "EXECUTOR"
            elif row["execution_state"] in ("REPORTED_SUCCEEDED", "REPORTED_FAILED"):
                waiting_on = "CLOSED"
            else:
                waiting_on = "EXECUTION_RESULT"
        visible_waiting = waiting_members if waiting_on == "APPROVERS" else []
        names = {}
        if visible_waiting:
            placeholders = ",".join("?" for _ in visible_waiting)
            names = {
                person["id"]: person["username"]
                for person in conn.execute(
                    f"SELECT id,username FROM users WHERE id IN ({placeholders})",
                    visible_waiting,
                ).fetchall()
            }
        group_name = None
        if plan.get("group_id"):
            group = conn.execute(
                "SELECT name FROM approver_groups WHERE id=?", (plan["group_id"],)
            ).fetchone()
            group_name = group["name"] if group else None
        out["approval_progress"] = {
            "mode": plan.get("mode", "SINGLE"),
            "approved_count": approved_count,
            "required_count": int(plan.get("required") or 1),
            "total_members": len(members),
            "waiting_approver_ids": visible_waiting,
            "waiting_approvers": [
                {"id": member, "username": names.get(member, "Unavailable approver")}
                for member in visible_waiting
            ],
            "group_name": group_name,
            "waiting_on": waiting_on,
        }
        escalation = conn.execute(
            """SELECT target_user_id,target_group_id,target_members,due_at,fired_at
               FROM escalations WHERE request_id=?""",
            (row["id"],),
        ).fetchone()
        out["escalation"] = (
            {
                **dict(escalation),
                "target_members": json.loads(escalation["target_members"] or "[]"),
            }
            if escalation
            else None
        )
        out["overdue"] = bool(
            escalation
            and row["state"] in ("AWAITING", "HELD")
            and escalation["due_at"] <= time.time()
        )
        deliveries = [
            dict(r)
            for r in conn.execute(
                "SELECT id,kind,revision,state,attempts,last_error,delivered_at FROM outbox WHERE request_id=? ORDER BY created_at,id",
                (row["id"],),
            ).fetchall()
        ]
        out["delivery_state"] = next(
            (d["state"] for d in reversed(deliveries) if d["kind"] == "webhook"), "NOT_SCHEDULED"
        )
        # The callback channel is not the notification channel. A failed SMTP
        # outbox attempt must be visible independently in the action center.
        out["notification_failure_count"] = sum(
            d["kind"] == "email" and d["state"] == "FAILED" for d in deliveries
        )
        if detail:
            out["comments"] = [
                dict(comment)
                for comment in conn.execute(
                    """SELECT id,author_id,kind,body,created_at FROM request_comments
                       WHERE request_id=? ORDER BY created_at,id""",
                    (row["id"],),
                ).fetchall()
            ]
            out["deliveries"] = deliveries
            out["timeline"] = [
                {**dict(r), "detail": json.loads(r["detail"])}
                for r in conn.execute(
                    "SELECT * FROM audit WHERE request_id=? ORDER BY at,id", (row["id"],)
                ).fetchall()
            ]
        return out
