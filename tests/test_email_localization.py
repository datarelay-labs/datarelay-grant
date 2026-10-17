from copy import deepcopy

import pytest
from test_email_renderer import CONTEXT

from grant.email_design import EmailDesign
from grant.email_localization import event_defaults
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES, render_preview


@pytest.mark.parametrize("mode", ["EMAIL_PIN", "EMAIL_PIN_PLUS_OTP", "EMAIL_PIN_PLUS_MFA"])
def test_korean_protected_actions_and_mode_correct_notice(mode):
    template = {"templates": event_defaults("ko"), "design": EmailDesign(locale="ko").model_dump()}
    result = render_preview(template, "requested", CONTEXT, verification_mode=mode)
    for text in ("승인", "보류", "거부", "상세 보기", "최종 확인", "0000", "샘플 전용"):
        assert text in result["html"] and text in result["body"]
    assert 'lang="ko"' in result["html"]
    if mode == "EMAIL_PIN_PLUS_MFA":
        assert "로그인하세요" in result["body"]
    else:
        assert "로그인은 필요하지 않습니다" in result["body"]
    if mode == "EMAIL_PIN_PLUS_OTP":
        assert "독립적인 MFA 인증 요소가 아닙니다" in result["body"]


def test_nine_localized_events_and_explicit_fallback_leave_original_defaults_unchanged(env):
    before = deepcopy(DEFAULT_EVENT_TEMPLATES)
    assert set(event_defaults("ko")) == set(before)
    assert event_defaults("unsupported") == before
    for locale in ("en", "ko"):
        template = {"templates": event_defaults(locale), "design": EmailDesign(locale=locale).model_dump()}
        for event in before:
            rendered = render_preview(template, event, CONTEXT)
            assert rendered["html"] and rendered["body"]
    assert DEFAULT_EVENT_TEMPLATES == before
    response = env.human("admin").get("/api/v1/notification-template-defaults?locale=ko")
    assert response.status_code == 200
    assert response.json()["saved"] is False
    assert env.human("approver").get("/api/v1/notification-template-defaults?locale=ko").status_code == 403
