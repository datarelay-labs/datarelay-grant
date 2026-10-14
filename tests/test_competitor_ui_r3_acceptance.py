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
    assert "SMTP host configured: **NO**" in REPORT
    assert "Existing session rows: **1**; session/cookie material was not read or reused." in REPORT
    assert "Gmail connector: available but not connected." in REPORT
    assert "Outlook Email connector: available but not connected." in REPORT
    assert "No credential, account, SMTP, worker, external target or production state was changed." in REPORT
    assert "No acceptance gate is falsely marked PASS." in REPORT
