"""R1 deployment reconciliation must not be mistaken for user acceptance."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = json.loads((ROOT / "docs/COMPETITOR_UI_EVIDENCE_20261014.json").read_text())
REPORT = (ROOT / "docs/COMPETITOR_UI_R1_DEPLOYMENT_RECONCILIATION_20261014.md").read_text()


def _r1_ids():
    ids = []
    for row in LEDGER["tasks"]:
        key = row["id"]
        if (key.startswith(("U1.", "U2.", "U3.", "U4.", "U5."))
                or key in {"U6.01", "U6.02", "U6.03", "U6.04", "U6.05", "U7.02", "U7.03"}
                or (key.startswith("U8.") and key != "U8.08")):
            ids.append(key)
    return ids


def test_r1_reconciles_exact_52_rows_without_claiming_acceptance_itself():
    ids = _r1_ids()
    assert len(ids) == 52
    rows = {row["id"]: row for row in LEDGER["tasks"]}
    assert {key for key in ids if rows[key]["dev_deployment"] == "PASS"} == set(ids) - {"U7.02", "U7.03"}
    assert {key for key in ids if rows[key]["dev_deployment"] == "NOT_APPLICABLE_WITH_JUSTIFICATION"} == {"U7.02", "U7.03"}
    # R1 remains historical deployment evidence. A later owner-authorized
    # operator-acceptance pass may promote the row, but that promotion must
    # come from the dedicated operator artifact rather than from R1 itself.
    for key in ids:
        if rows[key]["acceptance"] == "PASS":
            assert any(
                evidence.get("gate") == "acceptance"
                and evidence.get("result") == "PASS"
                and evidence.get("artifact") == "docs/COMPETITOR_UI_OPERATOR_E2E_20261015.md"
                for evidence in rows[key]["evidence"]
            )
        else:
            assert rows[key]["acceptance"] == "NOT_APPLICABLE_WITH_JUSTIFICATION"
        assert f"| {key} |" in REPORT
    assert "U8.08" not in ids


def test_r1_report_pins_deployment_provenance_without_external_effect_claim():
    assert "4fe71b4b96c66ed80e7c67138c784e17b0714435" in REPORT
    assert "13b82636ae478341a77ec3f8022bc898f34a9164ef059445ab749a5c78835a4e" in REPORT
    assert "6b1a8de7c5c0af251b75aee79692c6029f3206e2548666e4557b51f3c3ea4f47" in REPORT
    assert "fdfe5b6538e38afec8a1a496ac1b9f27339b6ac11f9ad8b747564b6b7c648814" in REPORT
    assert "Acceptance was intentionally unchanged" in REPORT
    assert "Worker remains disabled and SMTP remains unconfigured" in REPORT
