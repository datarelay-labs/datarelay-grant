"""Frozen v1 output hashes produced from committed ET-1, not the current renderer."""
import hashlib
import json
from pathlib import Path

from grant.email_renderer import EmailSecurity, compose_email

CONTEXT = {"request_title": "Legacy synthetic 승인", "request_url": "https://grant.example.invalid/requests/sample",
           "external_id": "SAMPLE-LEGACY", "action_kind": "service.change", "target": "sample-target",
           "reason": "Synthetic only", "deadline": "2030-01-01T00:00:00Z",
           "decision_state": "AWAITING", "execution_state": "NOT_STARTED"}
CONTENT = {"subject": "Synthetic legacy email", "body": "Review <literal> before proceeding.\n가상 승인 데이터",
           "sender_display_name": "DataRelay Grant", "brand_name": "DataRelay Grant"}
LINKS = {outcome: "https://grant.example.invalid/api/v1/decision-intents/SYNTHETIC-" + outcome
         for outcome in ("APPROVED", "HELD", "DENIED")}


def test_exact_legacy_v1_subject_html_text_reproduction():
    fixture = json.loads((Path(__file__).parent / "fixtures/email_v1_output_hashes.json").read_text())
    assert fixture["source_commit"] == "cf3f9e28fc7ceb7e2f1df7e8c9a921d8bf7d28ed"
    assert len(fixture["cases"]) == 27
    for case in fixture["cases"]:
        rendered = compose_email(CONTENT, CONTEXT, case["event"], security=EmailSecurity(case["mode"], "0000", LINKS))
        current = hashlib.sha256(json.dumps(rendered, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        assert current == case["sha256"], (case["event"], case["mode"])
