"""Bounded plain-text notification template sets for Grant events."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from copy import deepcopy
from datetime import UTC, datetime

NOTIFICATION_EVENTS = (
    "requested",
    "reminder",
    "approved",
    "denied",
    "expired",
    "cancelled",
    "execution_succeeded",
    "execution_failed",
    "execution_unknown",
)

ALLOWED_VARIABLES = {
    "request_title",
    "request_url",
    "external_id",
    "action_kind",
    "target",
    "reason",
    "deadline",
    "decision_state",
    "execution_state",
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

DEFAULT_EVENT_TEMPLATES = {
    "requested": {
        "subject": DEFAULT_MAIL_TEMPLATE["subject_template"],
        "body": DEFAULT_MAIL_TEMPLATE["body_template"],
    },
    "reminder": {
        "subject": DEFAULT_MAIL_TEMPLATE["reminder_subject_template"],
        "body": DEFAULT_MAIL_TEMPLATE["reminder_body_template"],
    },
    "approved": {
        "subject": "[Grant] Approved: {{request_title}}",
        "body": (
            "The request was explicitly approved.\n\n"
            "Request: {{request_url}}\nExternal ID: {{external_id}}\n"
            "Decision: {{decision_state}}\nExecution: {{execution_state}}"
        ),
    },
    "denied": {
        "subject": "[Grant] Denied: {{request_title}}",
        "body": (
            "The request was explicitly denied.\n\n"
            "Request: {{request_url}}\nExternal ID: {{external_id}}\n"
            "Decision: {{decision_state}}"
        ),
    },
    "expired": {
        "subject": "[Grant] Expired: {{request_title}}",
        "body": (
            "The request expired without a valid executable approval.\n\n"
            "Request: {{request_url}}\nExternal ID: {{external_id}}\n"
            "Decision: {{decision_state}}"
        ),
    },
    "cancelled": {
        "subject": "[Grant] Cancelled: {{request_title}}",
        "body": (
            "The request was cancelled.\n\n"
            "Request: {{request_url}}\nExternal ID: {{external_id}}\n"
            "Decision: {{decision_state}}"
        ),
    },
    "execution_succeeded": {
        "subject": "[Grant] Execution succeeded: {{request_title}}",
        "body": (
            "The connected executor reported success.\n\n"
            "Request: {{request_url}}\nExternal ID: {{external_id}}\n"
            "Execution: {{execution_state}}"
        ),
    },
    "execution_failed": {
        "subject": "[Grant] Execution failed: {{request_title}}",
        "body": (
            "The connected executor reported failure.\n\n"
            "Request: {{request_url}}\nExternal ID: {{external_id}}\n"
            "Execution: {{execution_state}}"
        ),
    },
    "execution_unknown": {
        "subject": "[Grant] Execution state unknown: {{request_title}}",
        "body": (
            "Execution requires reconciliation because its final state is unknown.\n\n"
            "Request: {{request_url}}\nExternal ID: {{external_id}}\n"
            "Execution: {{execution_state}}"
        ),
    },
}

DEFAULT_BRANDING = {
    "brand_name": "DataRelay Grant",
    "sender_display_name": "DataRelay Grant",
    "logo_asset": "/assets/datarelay-grant-icon.svg",
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


def validate_event_templates(templates: Mapping[str, Mapping[str, str]]) -> dict[str, dict[str, str]]:
    if set(templates) != set(NOTIFICATION_EVENTS):
        missing = sorted(set(NOTIFICATION_EVENTS) - set(templates))
        extra = sorted(set(templates) - set(NOTIFICATION_EVENTS))
        detail = []
        if missing:
            detail.append("missing=" + ",".join(missing))
        if extra:
            detail.append("unsupported=" + ",".join(extra))
        raise ValueError("Notification event template set must be complete (" + "; ".join(detail) + ")")
    out: dict[str, dict[str, str]] = {}
    for event in NOTIFICATION_EVENTS:
        item = templates[event]
        if set(item) != {"subject", "body"}:
            raise ValueError(f"Invalid notification template fields for {event}")
        subject = validate_template_text(str(item["subject"]), subject=True)
        body = validate_template_text(str(item["body"]))
        if not subject or len(subject) > 250 or not body or len(body) > 8000:
            raise ValueError(f"Notification template size outside bounds for {event}")
        out[event] = {"subject": subject, "body": body}
    return out


def _legacy_to_events(template: Mapping[str, object]) -> dict[str, dict[str, str]]:
    events = deepcopy(DEFAULT_EVENT_TEMPLATES)
    if "subject_template" in template:
        events["requested"] = {
            "subject": str(template["subject_template"]),
            "body": str(template["body_template"]),
        }
    if "reminder_subject_template" in template:
        events["reminder"] = {
            "subject": str(template["reminder_subject_template"]),
            "body": str(template["reminder_body_template"]),
        }
    return events


def normalize_snapshot(template: Mapping[str, object] | None) -> dict[str, object]:
    if template is None:
        return {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "branding": dict(DEFAULT_BRANDING)}
    if "templates" in template:
        events = validate_event_templates(template["templates"])  # type: ignore[arg-type]
        branding = dict(DEFAULT_BRANDING)
        raw_branding = template.get("branding")
        if isinstance(raw_branding, Mapping):
            for key in ("brand_name", "sender_display_name", "logo_asset"):
                value = raw_branding.get(key)
                if isinstance(value, str) and value:
                    branding[key] = value
        return {"templates": events, "branding": branding}
    return {"templates": _legacy_to_events(template), "branding": dict(DEFAULT_BRANDING)}


def snapshot(row: object | None = None, *, branding: Mapping[str, str] | None = None) -> dict[str, object]:
    if row is None:
        result = normalize_snapshot(None)
    else:
        raw = None
        try:
            raw = row["event_templates"]
        except (KeyError, IndexError, TypeError):
            raw = None
        if raw:
            events = json.loads(raw)
        else:
            events = _legacy_to_events(
                {
                    "subject_template": row["subject_template"],
                    "body_template": row["body_template"],
                    "reminder_subject_template": row["reminder_subject_template"],
                    "reminder_body_template": row["reminder_body_template"],
                }
            )
        result = {"templates": validate_event_templates(events), "branding": dict(DEFAULT_BRANDING)}
        try:
            sender = row["sender_display_name"]
        except (KeyError, IndexError, TypeError):
            sender = ""
        if sender:
            result["branding"]["sender_display_name"] = sender  # type: ignore[index]
    if branding:
        for key in ("brand_name", "sender_display_name", "logo_asset"):
            if branding.get(key):
                result["branding"][key] = branding[key]  # type: ignore[index]
    return result


def request_context(row, origin: str) -> dict[str, str]:
    action = json.loads(row["action"])
    return {
        "request_title": row["title"],
        "request_url": origin.rstrip("/") + "/requests/" + row["id"],
        "external_id": row["external_id"],
        "action_kind": action["kind"],
        "target": action["target"],
        "reason": row["reason"] or "—",
        "deadline": datetime.fromtimestamp(row["deadline"], UTC).isoformat(),
        "decision_state": row["state"],
        "execution_state": row["execution_state"],
    }


def render_from_context(
    template: Mapping[str, object], event: str, context: Mapping[str, str]
) -> dict[str, str]:
    if event not in NOTIFICATION_EVENTS:
        raise ValueError("Unsupported notification event")
    normalized = normalize_snapshot(template)
    event_template = normalized["templates"][event]  # type: ignore[index]
    missing = ALLOWED_VARIABLES - set(context)
    if missing:
        raise ValueError("Missing notification preview variables: " + ", ".join(sorted(missing)))

    def render(value: str) -> str:
        return TOKEN.sub(lambda match: str(context[match.group(1)]), value)

    branding = normalized["branding"]  # type: ignore[assignment]
    return {
        "subject": render(event_template["subject"]).replace("\r", " ").replace("\n", " "),
        "body": render(event_template["body"]),
        "sender_display_name": branding["sender_display_name"],
        "brand_name": branding["brand_name"],
    }


def render_notification(template: Mapping[str, object], row, origin: str, *, event: str) -> dict[str, str]:
    return render_from_context(template, event, request_context(row, origin))


def render_mail(template: dict[str, object], row, origin: str, *, reminder: bool) -> dict[str, str]:
    """Compatibility wrapper for the pre-1.0 requested/reminder path."""
    return render_notification(template, row, origin, event="reminder" if reminder else "requested")
