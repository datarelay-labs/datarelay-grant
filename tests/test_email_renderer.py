"""ET-1 pure renderer regressions. All capabilities and PINs are synthetic."""
import json
from copy import deepcopy
from types import SimpleNamespace

import pytest

from grant.decision_links import _message
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES, normalize_snapshot, render_from_context

CONTEXT = {
    "request_title": "Synthetic approval 승인", "request_url": "https://grant.example.invalid/requests/sample",
    "external_id": "sample", "action_kind": "sample.operation", "target": "sample-target",
    "reason": "Synthetic data only", "deadline": "2030-01-01T00:00:00Z",
    "decision_state": "AWAITING", "execution_state": "NOT_STARTED",
}
TOKENS = {outcome: "SYNTHETIC-" + outcome for outcome in ("APPROVED", "HELD", "DENIED")}


def message(body=None, mode="EMAIL_PIN", event="requested"):
    template = normalize_snapshot(None)
    if body is not None:
        template["templates"]["requested"]["body"] = body
    row = {
        "id": "sample", "mail_template": json.dumps(template), "title": CONTEXT["request_title"],
        "action": json.dumps({"kind": "sample.operation", "target": "sample-target"}),
        "external_id": "sample", "reason": "Synthetic data only", "deadline": 1893456000,
        "state": "AWAITING", "execution_state": "NOT_STARTED", "decision_verification_mode": mode,
    }
    return _message(SimpleNamespace(origin="https://grant.example.invalid"), row, event, "0000", TOKENS)


def test_et_t01_literal_decision_heading_cannot_truncate_user_content():
    result = message("Before Decision links (literal user prose) AFTER-SENTINEL <script>unsafe</script>")
    assert "AFTER-SENTINEL" in result["html"]
    assert "&lt;script&gt;unsafe&lt;/script&gt;" in result["html"]
    assert "<script>" not in result["html"]
    assert "AFTER-SENTINEL" in result["body"]


def test_et_t04_four_distinct_actions_and_separate_nondeciding_details():
    result = message()
    for label in ("Approve", "Hold", "Deny", "View Details"):
        assert label in result["html"] and label in result["body"]
    assert 'href="https://grant.example.invalid/requests/sample"' in result["html"]
    assert result["html"].count("/api/v1/decision-intents/") == 3
    assert "Confirm" in result["body"]


@pytest.mark.parametrize("mode, guidance", [
    ("EMAIL_PIN", "No account login is required"),
    ("EMAIL_PIN_PLUS_OTP", "additional email OTP"),
    ("EMAIL_PIN_PLUS_MFA", "Sign in"),
])
def test_et_t02_mode_correct_security_guidance(mode, guidance):
    result = message(mode=mode)
    assert guidance in result["body"] and guidance in result["html"]
    assert "sign in as the assigned approver" not in DEFAULT_EVENT_TEMPLATES["requested"]["body"]
    assert "does not" in result["body"] and "MFA" in result["body"]


def test_et_t01_all_events_share_structured_html_and_plain_text_contract():
    for event in DEFAULT_EVENT_TEMPLATES:
        result = render_from_context(normalize_snapshot(None), event, CONTEXT)
        assert result["html"].lower().startswith("<!doctype html")
        assert result["text"] == result["body"]
        assert result["renderer_contract_version"] == "1"


@pytest.mark.parametrize("event", list(DEFAULT_EVENT_TEMPLATES)[2:])
def test_et_t08_terminal_event_cannot_receive_decision_controls(event):
    result = message(event=event)
    assert "/decision-intents/" not in result["html"]
    assert "SYNTHETIC-" not in result["body"]
    assert "Four-digit confirmation PIN" not in result["body"]
    assert "_decision_tokens" not in result


def test_et_t07_long_english_korean_and_html_are_preserved_without_execution():
    text = "승인 검토 English <img src=x onerror=alert(1)>\n" * 100
    result = message(text)
    assert result["body"].count("승인 검토") == 100
    assert result["html"].count("승인 검토") == 100
    assert "<img src=x" not in result["html"]
    assert len(result["html"].encode()) < 131072


def test_et_t03_preview_contract_is_inert_and_does_not_mutate_input():
    from grant.mail_templates import render_preview

    original = deepcopy(CONTEXT)
    result = render_preview(normalize_snapshot(None), "requested", CONTEXT)
    assert CONTEXT == original
    assert "/api/v1/decision-intents/" not in result["html"]
    assert "https://example.invalid/grant-preview/" in result["body"]
    assert "0000" in result["body"]
    assert "_decision_tokens" not in result
    assert "View Details" in result["html"]


def test_et_t01_transport_uses_exact_structured_mime_parts(monkeypatch):
    from grant.transport import send_email

    captured = []

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def ehlo(self):
            pass

        def send_message(self, value):
            captured.append(value)

    monkeypatch.setattr("grant.transport.smtplib.SMTP", FakeSMTP)
    result = message()
    settings = SimpleNamespace(smtp_host="example.invalid", smtp_port=25,
                               smtp_from="sample@example.invalid", smtp_starttls=False, smtp_user="")
    send_email(settings, {"email": "sample@example.invalid"}, json.dumps(result), "synthetic")
    assert len(captured) == 1
    parts = list(captured[0].iter_parts())
    assert [part.get_content_type() for part in parts] == ["text/plain", "text/html"]
    assert parts[0].get_content().rstrip("\n") == result["body"].rstrip("\n")
    assert parts[1].get_content().rstrip("\n") == result["html"].rstrip("\n")


def test_et_t14_runtime_needs_no_network_process_or_user_files(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Renderer attempted an external effect")

    monkeypatch.setattr("socket.create_connection", forbidden)
    monkeypatch.setattr("subprocess.Popen", forbidden)
    result = message("Literal @@GRANT_PIN@@ and <mj-include path='/not-read'/>")
    assert "Literal @@GRANT_PIN@@" in result["html"]
    assert "&lt;mj-include" in result["html"]


@pytest.mark.parametrize("mode", ["BYPASS", "", "INHERIT"])
def test_et_t02_unknown_verification_never_downgrades(mode):
    with pytest.raises(ValueError, match="verification"):
        message(mode=mode)
