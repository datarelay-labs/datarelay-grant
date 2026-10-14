"""R3 must record real acceptance blockers without converting fixtures into PASS."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LEDGER=json.loads((ROOT/"docs/COMPETITOR_UI_EVIDENCE_20261014.json").read_text())
REPORT=(ROOT/"docs/COMPETITOR_UI_R3_ACCEPTANCE_EXECUTION_20261014.md").read_text()
ROWS={row["id"]:row for row in LEDGER["tasks"]}


def test_r3_five_real_gates_are_blocked_not_passed():
    for key in ("U6.06","U7.04","U7.05","U7.06","U7.07"):
        assert ROWS[key]["status"] == "OPEN"
        assert ROWS[key]["blocker"]
        assert "BLOCKED" in ROWS[key]["blocker"] or "blocked" in ROWS[key]["blocker"]
    assert ROWS["U7.07"]["interaction"] == "BLOCKED"
    assert ROWS["U6.06"]["acceptance"] == "BLOCKED"
    assert ROWS["U7.04"]["acceptance"] == "BLOCKED"
    assert ROWS["U7.05"]["acceptance"] == "BLOCKED"
    assert ROWS["U7.06"]["acceptance"] == "BLOCKED"


def test_r3_reconciles_child_acceptance_without_false_pass():
    ids=[]
    for row in LEDGER["tasks"]:
        key=row["id"]
        if key.startswith(("U1.","U2.","U3.","U4.","U5.")) or key in {"U6.01","U6.02","U6.03","U6.04","U6.05"} or (key.startswith("U8.") and key != "U8.08"):
            ids.append(key)
    assert len(ids)==50
    assert all(ROWS[key]["acceptance"]=="BLOCKED" for key in ids)
    assert all(ROWS[key]["status"]=="OPEN" for key in ids)
    assert ROWS["U7.02"]["acceptance"]=="NOT_APPLICABLE_WITH_JUSTIFICATION"
    assert ROWS["U7.03"]["acceptance"]=="NOT_APPLICABLE_WITH_JUSTIFICATION"
    assert ROWS["U7.02"]["status"]=="PASS"
    assert ROWS["U7.03"]["status"]=="PASS"


def test_r3_report_preserves_no_effect_boundary():
    assert "SMTP host configured: **YES**" in REPORT
    assert "Existing session rows: **1**; session/cookie material was not read or reused." in REPORT
    assert "Gmail connector: **connected during R3 continuation**" in REPORT
    assert "Current-candidate Gmail rendering test: **received**" in REPORT
    assert "Outlook Email connector: available but not connected." in REPORT
    assert "Outbox worker enabled: **NO**" in REPORT
    assert "No acceptance gate is falsely marked PASS." in REPORT


def test_gmail_connection_is_supporting_historical_evidence_not_current_acceptance():
    u606=ROWS["U6.06"]
    u704=ROWS["U7.04"]
    assert "DataRelay Grant SMTP configuration and real Gmail receipt are now verified" in u606["blocker"]
    assert "zero email_templates rows" in u606["blocker"]
    assert "Current-candidate Gmail transport/MIME subcell is verified" in u704["blocker"]
    assert "Gmail Web/Mobile visual rendering has not been directly observed" in u704["blocker"]
    assert u606["acceptance"]=="BLOCKED"
    assert u704["acceptance"]=="BLOCKED"
    assert "Gmail connector: **connected during R3 continuation**" in REPORT
    assert "Current-candidate Gmail rendering test: **received**" in REPORT


def test_current_candidate_gmail_mime_is_verified_but_not_grant_smtp_or_full_client_matrix():
    u606=ROWS["U6.06"]
    u704=ROWS["U7.04"]
    assert "DataRelay Grant SMTP configuration and real Gmail receipt are now verified" in u606["blocker"]
    assert "zero email_templates rows" in u606["blocker"]
    assert "Current-candidate Gmail transport/MIME subcell is verified" in u704["blocker"]
    assert "Gmail Web/Mobile visual rendering has not been directly observed" in u704["blocker"]
    assert u606["acceptance"]=="BLOCKED"
    assert u704["acceptance"]=="BLOCKED"
    assert "Current-candidate Gmail rendering test: **received**" in REPORT
    assert "7,840 HTML bytes" in REPORT


def test_grant_smtp_receipt_is_real_but_u606_waits_for_exact_saved_revision():
    u606=ROWS["U6.06"]
    assert "DataRelay Grant SMTP configuration and real Gmail receipt are now verified" in u606["blocker"]
    assert "zero email_templates rows" in u606["blocker"]
    assert u606["status"]=="OPEN"
    assert u606["acceptance"]=="BLOCKED"
    assert "DKIM/SPF PASS" in REPORT
    assert "exact product-saved template revision" in REPORT
    assert "worker false" in REPORT
