"""Versioned bounded authoring schema; authority and action binding are not inputs."""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .email_palette import DEFAULT_PALETTE, EmailPalette

BLOCKS = ["brand", "heading", "message", "request_context", "actions", "verification", "footer"]


class StrictDesign(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def _white_contrast(color: str) -> float:
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    luminance = sum(c * weight for c, weight in zip(linear, (0.2126, 0.7152, 0.0722), strict=True))
    return 1.05 / (luminance + 0.05)


class EmailStyles(StrictDesign):
    font_size: int = Field(default=16, ge=14, le=20)
    button_font_size: int = Field(default=16, ge=14, le=20)
    button_padding_x: int = Field(default=24, ge=16, le=32)
    button_padding_y: int = Field(default=12, ge=10, le=20)
    button_gap: int = Field(default=8, ge=8, le=24)
    button_radius: int = Field(default=6, ge=0, le=16)
    approve_color: str = "#166534"
    hold_color: str = "#854d0e"
    deny_color: str = "#991b1b"

    @field_validator("approve_color", "hold_color", "deny_color")
    @classmethod
    def readable_color(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value) or _white_contrast(value) < 4.5:
            raise ValueError("Use a six-digit color with white-text contrast of at least 4.5:1")
        return value.lower()


class ButtonSuffixes(StrictDesign):
    approve: str = Field(default="", max_length=40)
    hold: str = Field(default="", max_length=40)
    deny: str = Field(default="", max_length=40)
    details: str = Field(default="", max_length=40)

    @field_validator("approve", "hold", "deny", "details")
    @classmethod
    def literal_suffix(cls, value: str) -> str:
        if "{{" in value or any(ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF
                or 0x200B <= ord(c) <= 0x200F or 0x202A <= ord(c) <= 0x202E
                or 0x2066 <= ord(c) <= 0x2069 for c in value):
            raise ValueError("Button descriptions must be plain one-line text without control characters")
        return value


class EmailDesign(StrictDesign):
    schema_version: Literal[1] = 1
    renderer_contract_version: Literal[1] = 1
    shared_layout_revision: Literal[1, 2, 3, 4, 5] = 2
    locale: Literal["en", "ko"] = "en"
    preset: Literal["standard", "compact", "high_visibility"] = "standard"
    button_size: Literal["S", "M", "L"] = "M"
    heading: str = Field(default="{{request_title}}", min_length=1, max_length=250)
    event_headings: dict[str, str] = Field(default_factory=dict, max_length=9)
    event_preheaders: dict[str, str] = Field(default_factory=dict, max_length=9)
    footer: str = Field(default="", max_length=1000)
    # Asset pipeline is not available: fail closed, never silently ignore a logo.
    logo_asset_id: None = None
    blocks: list[str] = Field(default_factory=lambda: list(BLOCKS), min_length=7, max_length=7)
    styles: EmailStyles = Field(default_factory=EmailStyles)
    palette: EmailPalette = Field(default_factory=EmailPalette)
    rich_text: bool = False
    paragraph_alignment: Literal["left", "center", "right"] = "left"
    button_suffixes: ButtonSuffixes = Field(default_factory=ButtonSuffixes)

    @field_validator("schema_version", "renderer_contract_version", "shared_layout_revision", mode="before")
    @classmethod
    def integer_version(cls, value):
        if type(value) is not int:
            raise ValueError("Email schema and layout versions must be integers")
        return value

    @model_validator(mode="after")
    def immutable_legacy_layout(self):
        if self.shared_layout_revision == 1 and (self.rich_text
                or self.paragraph_alignment != "left" or any(self.button_suffixes.model_dump().values())):
            raise ValueError("These new authoring features require shared layout revision 2")
        if self.shared_layout_revision < 3 and self.event_headings:
            raise ValueError("Per-event headings require shared layout revision 3")
        if self.shared_layout_revision < 4 and self.event_preheaders:
            raise ValueError("Per-event preheaders require shared layout revision 4")
        if self.shared_layout_revision < 5 and self.palette.model_dump() != DEFAULT_PALETTE:
            raise ValueError("Mail color palettes require shared layout revision 5")
        return self

    @field_validator("event_preheaders")
    @classmethod
    def safe_event_preheaders(cls, values: dict[str, str]) -> dict[str, str]:
        from .mail_templates import DEFAULT_EVENT_TEMPLATES

        for event, value in values.items():
            if event not in DEFAULT_EVENT_TEMPLATES or len(value) > 200:
                raise ValueError("Use a supported event and a preheader of at most 200 characters")
            if any(ord(c) < 32 or ord(c) == 127 or 0x200B <= ord(c) <= 0x200F
                    or 0x2028 <= ord(c) <= 0x202E or 0x2066 <= ord(c) <= 0x2069 for c in value):
                raise ValueError("Preheaders must be one-line text without control characters")
            cls.safe_text(value)
        return values

    @field_validator("event_headings")
    @classmethod
    def safe_event_headings(cls, values: dict[str, str]) -> dict[str, str]:
        from .mail_templates import DEFAULT_EVENT_TEMPLATES

        for event, value in values.items():
            if event not in DEFAULT_EVENT_TEMPLATES or not 1 <= len(value) <= 250:
                raise ValueError("Use a supported event and a heading of 1 to 250 characters")
            cls.safe_text(value)
        return values

    @field_validator("blocks")
    @classmethod
    def protected_structure(cls, value: list[str]) -> list[str]:
        if value != BLOCKS:
            raise ValueError("Protected email blocks cannot be removed, reordered, hidden or duplicated")
        return value

    @field_validator("heading", "footer")
    @classmethod
    def safe_text(cls, value: str) -> str:
        from .mail_templates import validate_template_text

        if any(0xD800 <= ord(c) <= 0xDFFF or ord(c) < 32 and c not in "\n\t" for c in value):
            raise ValueError("Unsupported text control character")
        return validate_template_text(value)


def validate_design(value: object) -> dict:
    return EmailDesign.model_validate(value).model_dump()


def renderer_snapshot(design: dict | None = None) -> dict:
    from .email_renderer import LAYOUT_REGISTRY

    revision = design["shared_layout_revision"] if design else 1
    return {"contract_version": 1, "layout_revision": revision, "compiler": "mjml@5.4.1",
            "layout_sha256": LAYOUT_REGISTRY[revision]["sha256"]}
