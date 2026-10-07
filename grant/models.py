"""Strict bounded public input contracts. No inbound destination/approver override."""

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Login(Input):
    username: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.@-]+$")
    password: str = Field(min_length=1, max_length=256)


class NewUser(Login):
    email: str = Field(min_length=3, max_length=254)
    role: Literal["admin", "member"] = "member"

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        if (
            not re.fullmatch(r"[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+", value)
            or ".." in value
        ):
            raise ValueError("A single email address is required")
        return value


class Action(Input):
    kind: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.:-]+$")
    target: str = Field(min_length=1, max_length=500)
    parameters: dict[str, Any] = Field(default_factory=dict)


class Intake(Input):
    external_id: str = Field(min_length=1, max_length=200)
    profile_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=250)
    action: Action
    source: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(default="", max_length=4000)
    predecessor_id: str | None = Field(default=None, max_length=100)


class Decision(Input):
    decision: Literal["APPROVED", "HELD", "DENIED"]
    expected_revision: int = Field(ge=1)
    reason: str = Field(default="", max_length=2000)


class Cancel(Input):
    expected_revision: int = Field(ge=1)
    reason: str = Field(default="", max_length=2000)


class Consume(Input):
    execution_id: str = Field(min_length=1, max_length=200)
    action_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class Result(Consume):
    status: Literal["RUNNING", "REPORTED_SUCCEEDED", "REPORTED_FAILED", "UNKNOWN"]
    evidence: str = Field(default="", max_length=2000)


class Integration(Input):
    name: str = Field(min_length=1, max_length=100)
    kind: Literal["datarelay", "stellar"]
    tenant: str = Field(default="", max_length=200)
    callback_url: str = Field(min_length=1, max_length=2048)
    callback_headers: dict[str, str] = Field(default_factory=dict)
    hmac_secret: str = Field(default="", max_length=256)


class Profile(Input):
    name: str = Field(min_length=1, max_length=100)
    integration_id: str
    approver_id: str
    action_kind: str = Field(min_length=1, max_length=100)
    deadline_seconds: int = Field(default=86400, ge=60, le=604800)
    reminder_seconds: int = Field(default=3600, ge=60, le=86400)
    max_reminders: int = Field(default=3, ge=0, le=20)
    grant_seconds: int = Field(default=900, ge=30, le=86400)


class Token(Input):
    integration_id: str
    scopes: list[Literal["request:create", "request:read", "grant:consume", "result:write"]] = (
        Field(min_length=1, max_length=4)
    )


class PasswordChange(Input):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class MfaCode(Input):
    code: str = Field(min_length=6, max_length=100)
    recovery: bool = False
