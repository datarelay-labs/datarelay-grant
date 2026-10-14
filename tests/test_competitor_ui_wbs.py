"""Traceability structure is not permission to claim implemented or accepted UI."""
import copy
import json
import runpy
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CHECKER = runpy.run_path(str(ROOT / "tools/validate_competitor_ui_wbs.py"))
LEDGER = json.loads((ROOT / "docs/COMPETITOR_UI_EVIDENCE_20261014.json").read_text())
TEXT = (ROOT / "docs/COMPETITOR_UI_IMPLEMENTATION_WBS_20261014.md").read_text()
CROSSWALK = json.loads((ROOT / LEDGER["original_crosswalk_path"]).read_text())
WBS_IDS = {row["id"] for row in LEDGER["tasks"]}


def test_current_inventory_and_negative_false_pass_cases():
    result = CHECKER["validate"](TEXT, LEDGER)
    assert result["registered_tasks"] == 68
    assert result["product_completion"] == "OPEN"
    assert CHECKER["self_test"](TEXT, LEDGER) == 5


def test_all_original_exact_ids_and_wording_are_traceable_not_executed():
    assert CHECKER["validate_crosswalk"](CROSSWALK, WBS_IDS) == {
        "et_checks": 24, "original_user_scenarios": 121, "historical_gap_rows": 9,
        "structured_findings": 12, "traceability": "PASS", "product_acceptance": False,
    }
    assert CROSSWALK["all_historical_narrative_requirements_reconciled"] is False


@pytest.mark.parametrize("case", [
    "dropped_et", "duplicate_user", "changed_wording", "unknown_wbs",
    "changed_source_hash", "wrong_source_line", "fake_acceptance", "deferral_removed",
])
def test_crosswalk_rejects_omission_tampering_and_false_acceptance(case):
    changed = copy.deepcopy(CROSSWALK)
    if case == "dropped_et":
        changed["et_checks"].pop()
    elif case == "duplicate_user":
        changed["original_user_scenarios"][1] = changed["original_user_scenarios"][0]
    elif case == "changed_wording":
        changed["et_checks"][0]["criterion_verbatim"] = "Synthetic preview is full acceptance"
    elif case == "unknown_wbs":
        changed["original_user_scenarios"][0]["wbs"] = ["U0.99"]
    elif case == "changed_source_hash":
        changed["sources"][0]["sha256"] = "0" * 64
    elif case == "wrong_source_line":
        changed["et_checks"][0]["line"] = 1
    elif case == "fake_acceptance":
        changed["product_acceptance"] = True
    else:
        changed["historical_structured_findings"][-1]["disposition"] = "MANDATORY"
    with pytest.raises(ValueError):
        CHECKER["validate_crosswalk"](changed, WBS_IDS)


def test_mapped_requirement_does_not_satisfy_product_exit_gate():
    with pytest.raises(ValueError, match="UI_COMPLETION_OPEN"):
        CHECKER["validate"](TEXT, LEDGER, require_complete=True)
