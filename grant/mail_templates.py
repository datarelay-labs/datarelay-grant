"""Bounded plain-text mail templates for approval notifications."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime

ALLOWED_VARIABLES = {
    "request_title",
    "request_url",
    "external_id",
    "action_kind",
    "target",
    "reason",
    "deadline",
}
TOKEN = re.compile(r"\{\{([a-z_]+)\}\}")

DEFAULT_MAIL_TEMPLATE = {
    "subject_template": "[Grant] Approval: {{request_title}}",
    "body_template": (
        "Review the exact action and sign in as the assigned approver.\n\n"
        "Request: {{request_url}}\n"
        "External ID: {{external_id}}\n"
        "Action: {{action_kind}}\n"
        "Target: {{target}}\n"
        "Reason: {{reason}}\n"
        "Deadline: {{deadline}}\n\n"
        "Email previews never authorize execution."
    ),
    "reminder_subject_template": "[Grant] Reminder: {{request_title}}",
    "reminder_body_template": (
        "This approval request is still waiting for your explicit decision.\n\n"
        "Request: {{request_url}}\n"
        "External ID: {{external_id}}\n"
        "Action: {{action_kind}}\n"
        "Target: {{target}}\n"
        "Reason: {{reason}}\n"
        "Deadline: {{deadline}}\n\n"
        "No response is not approval."
    ),
}


def validate_template_text(value: str, *, subject: bool = False) -> str:
    if subject and any(c in value for c in "\r\n"):
        raise ValueError("Mail subject templates must be a single line")
    unknown = set(TOKEN.findall(value)) - ALLOWED_VARIABLES
    if unknown:
        raise ValueError("Unsupported mail template variable: " + ", ".join(sorted(unknown)))
    remainder = TOKEN.sub("", value)
    if "{{" in remainder or "}}" in remainder:
        raise ValueError("Malformed mail template variable")
    return value


def snapshot(row: object | None = None) -> dict[str, str]:
    if row is None:
        return dict(DEFAULT_MAIL_TEMPLATE)
    return {
        "subject_template": row["subject_template"],
        "body_template": row["body_template"],
        "reminder_subject_template": row["reminder_subject_template"],
        "reminder_body_template": row["reminder_body_template"],
    }


def render_mail(template: dict[str, str], row, origin: str, *, reminder: bool) -> dict[str, str]:
    action = json.loads(row["action"])
    context = {
        "request_title": row["title"],
        "request_url": origin.rstrip("/") + "/requests/" + row["id"],
        "external_id": row["external_id"],
        "action_kind": action["kind"],
        "target": action["target"],
        "reason": row["reason"] or "—",
        "deadline": datetime.fromtimestamp(row["deadline"], UTC).isoformat(),
    }
    subject_key = "reminder_subject_template" if reminder else "subject_template"
    body_key = "reminder_body_template" if reminder else "body_template"

    def render(value: str) -> str:
        return TOKEN.sub(lambda match: str(context[match.group(1)]), value)

    return {
        "subject": render(template[subject_key]).replace("\r", " ").replace("\n", " "),
        "body": render(template[body_key]),
    }
