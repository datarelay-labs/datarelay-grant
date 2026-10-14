"""Bounded outgoing-mail colors; no raw CSS or application theme controls."""
import re

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

DEFAULT_PALETTE = {"page_background": "#f3f4f6", "content_background": "#ffffff",
                   "body_text": "#111827", "brand_text": "#334155"}


def color_contrast(foreground: str, background: str) -> float:
    def luminance(value):
        channels = [int(value[index:index + 2], 16) / 255 for index in (1, 3, 5)]
        linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
                  for channel in channels]
        return sum(channel * weight for channel, weight in zip(linear, (0.2126, 0.7152, 0.0722), strict=True))

    light, dark = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (light + 0.05) / (dark + 0.05)


class EmailPalette(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    page_background: str = DEFAULT_PALETTE["page_background"]
    content_background: str = DEFAULT_PALETTE["content_background"]
    body_text: str = DEFAULT_PALETTE["body_text"]
    brand_text: str = DEFAULT_PALETTE["brand_text"]

    @field_validator("page_background", "content_background", "body_text", "brand_text")
    @classmethod
    def hex_color(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("Mail colors must be six-digit hexadecimal values")
        return value.lower()

    @model_validator(mode="after")
    def readable_foregrounds(self):
        if any(color_contrast(color, self.content_background) < 4.5
               for color in (self.body_text, self.brand_text)):
            raise ValueError("Mail body and brand text require at least 4.5:1 contrast against the content background")
        return self
