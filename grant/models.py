"""Strict bounded public input contracts. No inbound destination/approver override."""

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .mail_templates import validate_event_templates


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


class Delegation(Input):
    substitute_id: str = Field(min_length=1, max_length=100)
    starts_at: float
    ends_at: float

    @field_validator("ends_at")
    @classmethod
    def bounded_end(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Delegation end must be positive")
        return value


class Escalation(Input):
    target_user_id: str | None = Field(default=None, min_length=1, max_length=100)
    target_group_id: str | None = Field(default=None, min_length=1, max_length=100)
    after_seconds: int = Field(ge=60, le=604800)
    expected_revision: int = Field(ge=1)

    @model_validator(mode="after")
    def exactly_one_target(self):
        if (self.target_user_id is None) == (self.target_group_id is None):
            raise ValueError("Exactly one escalation target is required")
        return self


class Reassign(Input):
    from_approver_id: str = Field(min_length=1, max_length=100)
    to_approver_id: str = Field(min_length=1, max_length=100)
    expected_revision: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=2000)


class Decision(Input):
    decision: Literal["APPROVED", "HELD", "DENIED"]
    expected_revision: int = Field(ge=1)
    reason: str = Field(default="", max_length=2000)


class RequestComment(Input):
    kind: Literal["COMMENT", "QUESTION", "REQUEST_INFO", "REQUEST_CHANGES", "INFO_RESPONSE"]
    body: str = Field(min_length=1, max_length=2000)
    expected_revision: int = Field(ge=1)


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


class EmailTemplate(Input):
    name: str = Field(min_length=1, max_length=100)
    subject_template: str = Field(min_length=1, max_length=250)
    body_template: str = Field(min_length=1, max_length=8000)
    reminder_subject_template: str = Field(min_length=1, max_length=250)
    reminder_body_template: str = Field(min_length=1, max_length=8000)

    @field_validator("subject_template", "reminder_subject_template")
    @classmethod
    def valid_subject_template(cls, value: str) -> str:
        from .mail_templates import validate_template_text
        return validate_template_text(value, subject=True)

    @field_validator("body_template", "reminder_body_template")
    @classmethod
    def valid_body_template(cls, value: str) -> str:
        from .mail_templates import validate_template_text
        return validate_template_text(value)


class EmailTemplateUpdate(EmailTemplate):
    enabled: bool = True


NotificationEvent = Literal[
    "requested",
    "reminder",
    "approved",
    "denied",
    "expired",
    "cancelled",
    "execution_succeeded",
    "execution_failed",
    "execution_unknown",
]


class NotificationEventTemplate(Input):
    subject: str = Field(min_length=1, max_length=250)
    body: str = Field(min_length=1, max_length=8000)

    @field_validator("subject")
    @classmethod
    def valid_subject(cls, value: str) -> str:
        from .mail_templates import validate_template_text

        return validate_template_text(value, subject=True)

    @field_validator("body")
    @classmethod
    def valid_body(cls, value: str) -> str:
        from .mail_templates import validate_template_text

        return validate_template_text(value)


class NotificationTemplateSet(Input):
    name: str = Field(min_length=1, max_length=100)
    templates: dict[NotificationEvent, NotificationEventTemplate]

    @field_validator("templates")
    @classmethod
    def complete_event_set(
        cls, value: dict[NotificationEvent, NotificationEventTemplate]
    ) -> dict[NotificationEvent, NotificationEventTemplate]:
        validate_event_templates(
            {event: item.model_dump() for event, item in value.items()}
        )
        return value


class NotificationTemplateSetUpdate(NotificationTemplateSet):
    enabled: bool = True


class NotificationSample(Input):
    request_title: str = Field(min_length=1, max_length=250)
    request_url: str = Field(min_length=1, max_length=2048)
    external_id: str = Field(min_length=1, max_length=200)
    action_kind: str = Field(min_length=1, max_length=100)
    target: str = Field(min_length=1, max_length=500)
    reason: str = Field(default="", max_length=4000)
    deadline: str = Field(min_length=1, max_length=100)
    decision_state: str = Field(min_length=1, max_length=100)
    execution_state: str = Field(min_length=1, max_length=100)


class NotificationPreview(Input):
    event: NotificationEvent
    sample: NotificationSample


class NotificationTestSend(NotificationPreview):
    recipient_user_id: str | None = Field(default=None, max_length=100)


class NotificationBrandingUpdate(Input):
    brand_name: str = Field(min_length=1, max_length=100)
    sender_display_name: str = Field(min_length=1, max_length=100)

    @field_validator("brand_name", "sender_display_name")
    @classmethod
    def safe_header_text(cls, value: str) -> str:
        if any(character in value for character in "\r\n"):
            raise ValueError("Notification branding must be a single line")
        return value


class PolicySample(Input):
    integration_id: str = Field(min_length=1, max_length=100)
    action_kind: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=250)
    target: str = Field(min_length=1, max_length=500)
    reason: str = Field(default="", max_length=4000)
    source: dict[str, Any] = Field(default_factory=dict)


class ApproverGroup(Input):
    name: str = Field(min_length=1, max_length=100)
    member_ids: list[str] = Field(min_length=1, max_length=50)

    @field_validator("member_ids")
    @classmethod
    def unique_members(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Group members must be unique")
        return value


class ApproverGroupUpdate(ApproverGroup):
    # Required for every external edit: never overwrite a newer group membership.
    expected_updated_at: float = Field(ge=0, allow_inf_nan=False)


class ApprovalPlan(Input):
    mode: Literal["SINGLE", "ANY_ONE", "ALL", "N_OF_M", "SEQUENTIAL"] = "SINGLE"
    group_id: str | None = None
    approvals_required: int | None = Field(default=None, ge=1, le=50)


class Profile(Input):
    name: str = Field(min_length=1, max_length=100)
    integration_id: str
    approver_id: str
    approval_mode: Literal["SINGLE", "ANY_ONE", "ALL", "N_OF_M", "SEQUENTIAL"] = "SINGLE"
    approver_group_id: str | None = None
    approvals_required: int | None = Field(default=None, ge=1, le=50)
    action_kind: str = Field(min_length=1, max_length=100)
    email_template_id: str | None = None
    deadline_seconds: int = Field(default=86400, ge=60, le=604800)
    reminder_seconds: int = Field(default=3600, ge=60, le=86400)
    max_reminders: int = Field(default=3, ge=0, le=20)
    grant_seconds: int = Field(default=900, ge=30, le=86400)
    tenant_selector: str = Field(default="", max_length=200)
    environment: str = Field(default="", max_length=100)
    severity: str = Field(default="", max_length=100)
    risk_level: str = Field(default="", max_length=100)


class ProfileUpdate(Profile):
    enabled: bool = True


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
