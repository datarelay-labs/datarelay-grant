"""Versioned bounded authoring schema; authority and action binding are not inputs."""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class EmailDesign(StrictDesign):
    schema_version: Literal[1] = 1
    renderer_contract_version: Literal[1] = 1
    shared_layout_revision: Literal[1] = 1
    locale: Literal["en", "ko"] = "en"
    preset: Literal["standard", "compact", "high_visibility"] = "standard"
    button_size: Literal["S", "M", "L"] = "M"
    heading: str = Field(default="{{request_title}}", min_length=1, max_length=250)
    footer: str = Field(default="", max_length=1000)
    # Asset pipeline is not available: fail closed, never silently ignore a logo.
    logo_asset_id: None = None
    blocks: list[str] = Field(default_factory=lambda: list(BLOCKS), min_length=7, max_length=7)
    styles: EmailStyles = Field(default_factory=EmailStyles)

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


def renderer_snapshot() -> dict:
    from .email_renderer import LAYOUT_DIGEST

    return {"contract_version": 1, "layout_revision": 1, "compiler": "mjml@5.4.1",
            "layout_sha256": LAYOUT_DIGEST}
