"""R2 closes S02 traceability without pretending the raw artifact was recovered."""
import copy
import hashlib
import json
import runpy
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
LEDGER = json.loads((ROOT / "docs/COMPETITOR_UI_EVIDENCE_20261014.json").read_text())
CROSSWALK = json.loads((ROOT / "docs/COMPETITOR_UI_ORIGINAL_CROSSWALK_20261014.json").read_text())
WBS = (ROOT / "docs/COMPETITOR_UI_IMPLEMENTATION_WBS_20261014.md").read_text()
CHECKER = runpy.run_path(str(ROOT / "tools/validate_competitor_ui_wbs.py"))
WBS_IDS = {row["id"] for row in LEDGER["tasks"]}


def test_r2_owner_disposition_is_explicit_and_reopenable():
    disposition = CROSSWALK["s02_disposition"]
    assert disposition["raw_artifact_recovered"] is False
    assert disposition["owner_disposition"] == "ACCEPT_RETAINED_EXTRACTED_PROMISE_COVERAGE_AS_FINAL_S02_TRACEABILITY_SCOPE"
    assert disposition["product_acceptance_implied"] is False
    assert disposition["reopen_if_raw_artifact_recovered_with_material_delta"] is True
    line = next(line for line in WBS.splitlines() if line.startswith("S02 promise coverage:"))
    assert hashlib.sha256(line.encode()).hexdigest() == disposition["promise_coverage_sha256"]


def test_r2_has_exact_16_mandatory_groups_and_one_optional_nonadoption():
    groups = CROSSWALK["s02_mandatory_groups"]
    assert len(groups) == 16
    assert {row["id"] for row in groups} == {f"S02-{i:02}" for i in range(1, 17)}
    assert all(row["wbs"] and set(row["wbs"]) <= WBS_IDS for row in groups)
    assert all(row["disposition"] == "MANDATORY_RETAINED_OWNER_DISPOSITION" for row in groups)
    assert CROSSWALK["s02_optional_dispositions"] == [{
        "id": "S02-O01",
        "promise": "Constrained inline text editing beyond required inspector-field editing",
        "disposition": "OPTIONAL_RETAINED_AFTER_REQUIRED_INSPECTOR_EDITING",
        "raw_html_editor": "NOT_ADOPTED",
    }]


def test_r2_closes_historical_denominator_but_not_product_acceptance():
    assert LEDGER["historical_coverage_complete"] is True
    assert LEDGER["historical_requirement_denominator"] == 241
    assert sum(LEDGER["historical_requirement_denominator_breakdown"].values()) == 241
    assert LEDGER["product_acceptance_claimed"] is False
    rows = {row["id"]: row for row in LEDGER["tasks"]}
    assert {key for key in ("U0.01", "U0.03", "U8.08", "U9.01") if rows[key]["status"] == "PASS"} == {"U0.01", "U0.03", "U8.08", "U9.01"}
    assert rows["U9.02"]["status"] == "OPEN"
    assert rows["U6.06"]["acceptance"] == "BLOCKED"


@pytest.mark.parametrize("tamper", ["recovered", "missing_group", "promise_hash", "acceptance"])
def test_validator_rejects_false_or_incomplete_s02_disposition(tamper):
    changed = copy.deepcopy(CROSSWALK)
    if tamper == "recovered":
        changed["s02_disposition"]["raw_artifact_recovered"] = True
    elif tamper == "missing_group":
        changed["s02_mandatory_groups"].pop()
    elif tamper == "promise_hash":
        changed["s02_disposition"]["promise_coverage_sha256"] = "0" * 64
    else:
        changed["s02_disposition"]["product_acceptance_implied"] = True
    with pytest.raises(ValueError):
        CHECKER["validate_crosswalk"](changed, WBS_IDS)
