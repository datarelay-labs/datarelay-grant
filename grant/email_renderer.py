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

LAYOUT_REGISTRY = {}
for _revision in (1, 2, 3, 4):
    _bytes = files("grant").joinpath(f"email_layout_v{_revision}.json").read_bytes()
    LAYOUT_REGISTRY[_revision] = {"sha256": hashlib.sha256(_bytes).hexdigest(),
                                   "layouts": json.loads(_bytes)["layouts"]}
LAYOUT_DIGEST = LAYOUT_REGISTRY[1]["sha256"]
LAYOUTS = LAYOUT_REGISTRY[1]["layouts"]
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
        "DETAILS_URL": details, "DETAILS_LABEL": "View Details", "LOCALE": "en", "ALIGN": "left",
        "FONT_SIZE": "16", "BUTTON_FONT": "16", "BUTTON_Y": "12", "BUTTON_X": "24",
        "GAP": "8", "RADIUS": "6", "APPROVE_COLOR": "#166534",
        "HOLD_COLOR": "#854d0e", "DENY_COLOR": "#991b1b",
        "FOOTER": "View Details requires the existing account read access; it never records a decision. Email previews never authorize execution.",
    }
    if design is not None:
        from .email_design import validate_design
        from .mail_templates import TOKEN

        design = validate_design(design)
        style = design["styles"]
        for key, name in {"FONT_SIZE": "font_size", "BUTTON_FONT": "button_font_size",
                          "BUTTON_X": "button_padding_x", "BUTTON_Y": "button_padding_y",
                          "GAP": "button_gap", "RADIUS": "button_radius",
                          "APPROVE_COLOR": "approve_color", "HOLD_COLOR": "hold_color",
                          "DENY_COLOR": "deny_color"}.items():
            values[key] = str(style[name])
        values["LOCALE"] = design["locale"]
        values["TITLE"] = TOKEN.sub(lambda match: context[match[1]], design["event_headings"].get(event, design["heading"]))
        if design["footer"]:
            values["FOOTER"] += "\n" + TOKEN.sub(lambda match: context[match[1]], design["footer"])
    revision = design["shared_layout_revision"] if design else 1
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
    korean = bool(design and revision >= 2 and design["locale"] == "ko")
    if korean:
        from .email_localization import KO_GUIDANCE

        values["DETAILS_LABEL"] = "상세 보기"
        values["CONTEXT"] = "\n".join([
            "요청: " + context["request_title"], "외부 ID: " + context["external_id"],
            "작업: " + context["action_kind"], "대상: " + context["target"], "마감: " + context["deadline"],
        ])
        values["FOOTER"] = "상세 보기는 기존 계정의 조회 권한을 요구하며 결정을 기록하지 않습니다. 미리보기는 실행을 승인하지 않습니다."
        if eligible:
            values["APPROVE_LABEL"], values["HOLD_LABEL"], values["DENY_LABEL"] = "승인", "보류", "거부"
            values["GUIDANCE"] = ("링크를 여는 것만으로 결정이 기록되지 않습니다. " + KO_GUIDANCE[security.mode]
                + " 확인 화면은 현재 정책이 더 강해진 경우에도 최신 인증 요구사항을 적용합니다.")
            values["PIN"] = "4자리 확인 PIN: " + security.pin
            values["FOOTER"] = "같은 메일에 포함된 PIN은 개인 신원이나 MFA를 증명하지 않습니다. 이 메일을 전달하지 마세요. " + values["FOOTER"]
        if design["footer"]:
            values["FOOTER"] += "\n" + TOKEN.sub(lambda match: context[match[1]], design["footer"])
    if sample:
        prefix = "샘플 전용. PIN 0000과 모든 샘플 링크는 실제 결정에 사용할 수 없습니다. " if korean else "SAMPLE ONLY. PIN 0000 and all sample links are inert. "
        values["FOOTER"] = prefix + values["FOOTER"]
    segments += ["View Details: " + details, values["FOOTER"]]
    if design and revision >= 2:
        values["ALIGN"] = design["paragraph_alignment"]
        for slot, key in (("APPROVE", "approve"), ("HOLD", "hold"), ("DENY", "deny"), ("DETAILS", "details")):
            suffix = design["button_suffixes"][key]
            if slot + "_LABEL" in values and suffix:
                values[slot + "_LABEL"] += " · " + suffix
        # Derive text from the same protected fields, including custom heading.
        segments = [values["TITLE"], body, values["CONTEXT"]]
        if eligible:
            segments += [values["GUIDANCE"], *[
                values[slot + "_LABEL"] + ": " + values[slot + "_URL"]
                for slot in ("APPROVE", "HOLD", "DENY")
            ], values["PIN"]]
        segments += [values["DETAILS_LABEL"] + ": " + details, values["FOOTER"]]
    if design and revision >= 4:
        preheader = TOKEN.sub(lambda match: context[match[1]], design["event_preheaders"].get(event, ""))
        if len(preheader) > 2048 or any(ord(c) < 32 or ord(c) == 127 for c in preheader):
            raise ValueError("Rendered preheader must be bounded one-line text")
        values["PREHEADER"] = preheader
        if preheader:
            segments.insert(0, preheader)
    escaped = {key: html.escape(value, quote=True) for key, value in values.items()}
    for key in ("BODY", "CONTEXT", "GUIDANCE", "PIN", "FOOTER"):
        if key in escaped:
            escaped[key] = escaped[key].replace("\n", "<br>")
    if design and revision >= 2 and design["rich_text"]:
        from .email_rich_text import render_rich_text

        escaped["BODY"] = render_rich_text(body)
    # One substitution pass: user text resembling an internal slot is never re-evaluated.
    rendered_html = SLOT.sub(lambda match: escaped[match[1]], LAYOUT_REGISTRY[revision]["layouts"]["decision" if eligible else "notice"])
    text = "\n\n".join(segments)
    if len(rendered_html.encode("utf-8")) > 131072:
        raise ValueError("Rendered email HTML exceeds size limit")
    return {**content, **({"preheader": values["PREHEADER"]} if design and revision >= 4 else {}),
            "body": text, "text": text, "html": rendered_html,
            "renderer_contract_version": "1", "renderer_revision": f"mjml-5.4.1-layout-{revision}",
            "layout_sha256": LAYOUT_REGISTRY[revision]["sha256"]}
