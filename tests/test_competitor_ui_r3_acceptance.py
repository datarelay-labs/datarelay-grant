"""Owner-directed competitor-UI operator acceptance must not be confused with release Full User E2E."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LEDGER=json.loads((ROOT/"docs/COMPETITOR_UI_EVIDENCE_20261014.json").read_text())
OPERATOR=(ROOT/"docs/COMPETITOR_UI_OPERATOR_E2E_20261015.md").read_text()
ROWS={row["id"]:row for row in LEDGER["tasks"]}


def test_operator_acceptance_closes_five_ui_lane_gates():
    for key in ("U6.06","U7.04","U7.05","U7.06","U7.07"):
        assert ROWS[key]["status"] == "PASS"
        assert ROWS[key]["blocker"] is None
    assert ROWS["U6.06"]["interaction"] == "PASS"
    assert ROWS["U6.06"]["acceptance"] == "PASS"
    assert ROWS["U7.04"]["interaction"] == "PASS"
    assert ROWS["U7.04"]["acceptance"] == "PASS"
    assert ROWS["U7.05"]["interaction"] == "PASS"
    assert ROWS["U7.05"]["acceptance"] == "PASS"
    assert ROWS["U7.06"]["interaction"] == "PASS"
    assert ROWS["U7.06"]["acceptance"] == "PASS"
    assert ROWS["U7.07"]["interaction"] == "PASS"


def test_operator_acceptance_promotes_connected_child_rows():
    ids=[]
    for row in LEDGER["tasks"]:
        key=row["id"]
        if key.startswith(("U1.","U2.","U3.","U4.","U5.")) or key in {
            "U6.01","U6.02","U6.03","U6.04","U6.05"
        } or (key.startswith("U8.") and key != "U8.08"):
            ids.append(key)
    assert len(ids)==50
    assert all(ROWS[key]["acceptance"]=="PASS" for key in ids)
    assert all(ROWS[key]["status"]=="PASS" for key in ids)


def test_u902_is_technical_acceptance_reconciliation_pass():
    row=ROWS["U9.02"]
    assert row["status"]=="PASS"
    assert row["source"]=="PASS"
    assert row["acceptance"]=="PASS"
    assert row["blocker"] is None
    assert LEDGER["operator_acceptance"]["status"]=="TECHNICAL_PASS_PENDING_OWNER_U9_04"
    assert LEDGER["operator_acceptance"]["browser_e2e"]=="46/46 PASS"
    assert LEDGER["operator_acceptance"]["canvas"]=="49/49 PASS"


def test_release_full_user_e2e_is_still_not_claimed():
    assert LEDGER["product_acceptance_claimed"] is False
    assert LEDGER["operator_acceptance"]["full_user_e2e_release_claimed"] is False
    assert "not a claim that the repository-wide `FULL_USER_E2E` release contract passed" in OPERATOR
    assert "independent-human/two-mailbox requirement" in OPERATOR
    assert "original 121 scenario IDs" in OPERATOR


def test_direct_mail_clients_remain_explicit_follow_up():
    assert LEDGER["operator_acceptance"]["direct_outlook_apple_client_claimed"] is False
    assert "Direct Gmail UI, Outlook and Apple Mail observations remain follow-up and are not claimed" in OPERATOR
    assert "DKIM PASS" in OPERATOR
    assert "SPF PASS" in OPERATOR


def test_u606_is_composed_boundary_evidence_not_fake_gmail_identity():
    evidence=" ".join(str(item.get("result_detail","")) for item in ROWS["U6.06"]["evidence"])
    assert "exact saved-revision product-flow" in evidence
    assert "DataRelay Grant SMTP-to-Gmail" in evidence
    assert "not claimed to be the Gmail receipt" in evidence
    assert "receipt_confirmed=false" in evidence


def test_owner_review_is_the_only_ui_lane_closure_gate_left():
    assert ROWS["U9.03"]["status"]=="PASS"
    assert ROWS["U9.03"]["blocker"] is None
    assert ROWS["U9.04"]["status"]=="OPEN"
    assert "owner visual review/acknowledgement" in ROWS["U9.04"]["blocker"]
    assert LEDGER["operator_acceptance"]["u9_03"]=="PASS"
    assert LEDGER["operator_acceptance"]["remaining_gate"]=="U9.04_OWNER_VISUAL_ACKNOWLEDGEMENT"
    assert LEDGER["operator_acceptance"]["owner_acknowledgement"]=="PENDING_U9_04"
