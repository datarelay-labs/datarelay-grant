"""Pure bounded composition into a versioned, build-time MJML shell.

No template compiler, network, filesystem path from input, issuance or transport
runs here. The only runtime substitutions are escaped text and validated tokens.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from importlib.resources import files
from urllib.parse import urlsplit

LAYOUT_BYTES = files("grant").joinpath("email_layout_v1.json").read_bytes()
LAYOUT_DIGEST = hashlib.sha256(LAYOUT_BYTES).hexdigest()
LAYOUTS = json.loads(LAYOUT_BYTES)["layouts"]
SLOT = re.compile(r"@@GRANT_([A-Z_]+)@@")
OUTCOMES = ("APPROVED", "HELD", "DENIED")
MODES = ("EMAIL_PIN", "EMAIL_PIN_PLUS_OTP", "EMAIL_PIN_PLUS_MFA")
PREVIEW_ORIGIN = "https://example.invalid/grant-preview/"
LABELS = {"APPROVED": "Approve", "HELD": "Hold", "DENIED": "Deny"}
GUIDANCE = {
    "EMAIL_PIN": "No account login is required. Enter the four-digit email PIN, review the selected decision, then select Confirm.",
    "EMAIL_PIN_PLUS_OTP": "No account login is required. Enter the four-digit email PIN and the additional email OTP, then select Confirm. An additional email OTP is not an independent MFA factor.",
    "EMAIL_PIN_PLUS_MFA": "Sign in as the assigned approver and complete fresh MFA after verifying the four-digit email PIN, then select Confirm.",
}


@dataclass(frozen=True)
class EmailSecurity:
    """Server-only supplied issuance material, or strictly fixed inert samples."""
    mode: str
    pin: str
    links: Mapping[str, str]
    sample: bool = False


def _safe_url(value: str, *, details: bool = False) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 2048:
        raise ValueError("Invalid email action URL")
    p = urlsplit(value)
    if (p.scheme not in ("https", "http") or not p.hostname or p.username or p.password
            or p.query or p.fragment or any(ord(c) < 33 for c in value) or "\\" in value):
        raise ValueError("Invalid email action URL")
    if details and not re.fullmatch(r"/requests/[A-Za-z0-9_-]+", p.path):
        raise ValueError("View Details requires the authenticated request route")
    return value


def compose_email(
    content: Mapping[str, str], context: Mapping[str, str], event: str,
    *, security: EmailSecurity | None = None, design: Mapping | None = None,
    sample: bool = False,
) -> dict[str, str]:
    """Render all three MIME/preview outputs through the same pure contract."""
    if design is not None:
        # The server design schema is introduced independently in ET-2.
        raise ValueError("Email design schema not supported")
    subject, body = content["subject"], content["body"]
    if len(subject) > 2048 or len(body.encode("utf-8")) > 65536:
        raise ValueError("Rendered email content exceeds size limit")
    if any(not isinstance(v, str) or len(v) > 8192 for v in context.values()):
        raise ValueError("Email context exceeds size limit")
    eligible = event in ("requested", "reminder") and security is not None
    details = PREVIEW_ORIGIN + "details" if sample else _safe_url(context["request_url"], details=True)
    values = {
        "SUBJECT": subject, "BRAND": content["brand_name"], "TITLE": context["request_title"],
        "BODY": body, "CONTEXT": "\n".join([
            "Request: " + context["request_title"], "External ID: " + context["external_id"],
            "Action: " + context["action_kind"], "Target: " + context["target"],
            "Deadline: " + context["deadline"],
        ]),
        "DETAILS_URL": details, "DETAILS_LABEL": "View Details", "LOCALE": "en",
        "FONT_SIZE": "16", "BUTTON_FONT": "16", "BUTTON_Y": "12", "BUTTON_X": "24",
        "GAP": "8", "RADIUS": "6", "APPROVE_COLOR": "#166534",
        "HOLD_COLOR": "#854d0e", "DENY_COLOR": "#991b1b",
        "FOOTER": "View Details requires the existing account read access; it never records a decision. Email previews never authorize execution.",
    }
    segments = [body, values["CONTEXT"]]
    if eligible:
        assert security is not None
        if security.mode not in MODES or not re.fullmatch(r"[0-9]{4}", security.pin):
            raise ValueError("Invalid email verification context")
        if set(security.links) != set(OUTCOMES) or security.sample != sample:
            raise ValueError("Email requires exactly three server-bound actions")
        origin = urlsplit(details)
        for outcome, slot in zip(OUTCOMES, ("APPROVE", "HOLD", "DENY"), strict=True):
            link = security.links[outcome]
            if sample:
                if security.pin != "0000" or link != PREVIEW_ORIGIN + outcome.lower():
                    raise ValueError("Preview action must be inert")
            else:
                _safe_url(link)
                target = urlsplit(link)
                if ((target.scheme, target.netloc) != (origin.scheme, origin.netloc)
                        or not re.fullmatch(r"/api/v1/decision-intents/[A-Za-z0-9_-]{1,128}", target.path)):
                    raise ValueError("Decision action is not server-bound")
            values[slot + "_URL"] = link
            values[slot + "_LABEL"] = LABELS[outcome]
        values["GUIDANCE"] = (
            "Choose a decision. Opening a link never records a vote. " + GUIDANCE[security.mode]
            + " The confirmation page enforces the current policy if requirements become stronger."
        )
        values["PIN"] = "Four-digit confirmation PIN: " + security.pin
        values["FOOTER"] = (
            "The PIN in this same email does not prove personal identity or MFA. Do not forward this message. "
            + values["FOOTER"]
        )
        segments += [values["GUIDANCE"], *[
            LABELS[outcome] + ": " + security.links[outcome] for outcome in OUTCOMES
        ], values["PIN"]]
    if sample:
        values["FOOTER"] = "SAMPLE ONLY. PIN 0000 and all sample links are inert. " + values["FOOTER"]
    segments += ["View Details: " + details, values["FOOTER"]]
    escaped = {key: html.escape(value, quote=True) for key, value in values.items()}
    for key in ("BODY", "CONTEXT", "GUIDANCE", "PIN", "FOOTER"):
        if key in escaped:
            escaped[key] = escaped[key].replace("\n", "<br>")
    # One substitution pass: user text resembling an internal slot is never re-evaluated.
    rendered_html = SLOT.sub(lambda match: escaped[match[1]], LAYOUTS["decision" if eligible else "notice"])
    text = "\n\n".join(segments)
    if len(rendered_html.encode("utf-8")) > 131072:
        raise ValueError("Rendered email HTML exceeds size limit")
    return {**content, "body": text, "text": text, "html": rendered_html,
            "renderer_contract_version": "1", "renderer_revision": "mjml-5.4.1-layout-1",
            "layout_sha256": LAYOUT_DIGEST}
