"""Validate the UI work inventory; never confuse document validity with product PASS."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/COMPETITOR_UI_IMPLEMENTATION_WBS_20261014.md'
LEDGER = ROOT / 'docs/COMPETITOR_UI_EVIDENCE_20261014.json'
GATES = ('source', 'interaction', 'dev_deployment', 'acceptance')
STATES = {'NOT_RUN', 'IN_PROGRESS', 'PASS', 'FAIL', 'BLOCKED',
          'NOT_APPLICABLE_WITH_JUSTIFICATION'}


def validate(text: str, data: dict, require_complete: bool = False) -> dict:
    """Check traceability structure and evidence presence, not evidence authenticity."""
    ids = re.findall(r'^\| (U[0-9]\.\d{2}) \|', text, re.MULTILINE)
    if not ids or len(ids) != len(set(ids)):
        raise ValueError('Missing or duplicated WBS row IDs')
    if data.get('document_sha256') != hashlib.sha256(text.encode()).hexdigest():
        raise ValueError('Document changed without ledger reconciliation')
    rows = data.get('tasks', [])
    if len(rows) != len(ids) or {r['id'] for r in rows} != set(ids):
        raise ValueError('WBS and evidence task inventory differ')
    if data.get('registered_wbs_tasks') != len(ids):
        raise ValueError('Registered count is stale')
    expected = {f'C{i:02}' for i in range(1, 21)}
    if set(re.findall(r'^\| (C\d{2}) \|', text, re.MULTILINE)) != expected:
        raise ValueError('A surveyed family disposition is missing')
    if set(data.get('known_family_ids', [])) != expected:
        raise ValueError('Family ledger differs')
    if set(data.get('audit_ids', [])) != {f'UI-{i:02}' for i in range(1, 8)}:
        raise ValueError('UI audit requirements are missing')
    if data.get('original_et_check_ids') != [f'ET-T{i:02}' for i in range(1, 25)]:
        raise ValueError('Original ET acceptance IDs changed')
    if data.get('original_user_scenario_count') != 121:
        raise ValueError('Original user scenario registry count changed')
    for row in rows:
        key = row['id']
        if row.get('verification_id') != 'V-' + key:
            raise ValueError(f'{key}: verification mapping missing')
        for field in ('requirement', 'targets', 'depends_on', 'pass_criterion'):
            if not row.get(field):
                raise ValueError(f'{key}: {field} missing')
        for gate in GATES:
            state = row.get(gate)
            if state not in STATES:
                raise ValueError(f'{key}: invalid {gate} state')
            evidence = [e for e in row.get('evidence', []) if e.get('gate') == gate]
            if state == 'PASS' and not any(
                e.get('result') == 'PASS' and e.get('artifact')
                and re.fullmatch(r'[0-9a-f]{40}', e.get('source_head', ''))
                and e.get('test_id') == 'V-' + key and e.get('observed_at')
                for e in evidence
            ):
                raise ValueError(f'{key}: {gate} PASS lacks exact evidence')
            if state == 'NOT_APPLICABLE_WITH_JUSTIFICATION' and not any(
                e.get('justification') for e in evidence
            ):
                raise ValueError(f'{key}: unjustified non-applicability')
        if row.get('status') == 'PASS' and (
            row.get('blocker') or any(row[g] not in
                                     {'PASS', 'NOT_APPLICABLE_WITH_JUSTIFICATION'}
                                     for g in GATES)
        ):
            raise ValueError(f'{key}: overall PASS with incomplete gates')
    complete = (data.get('historical_coverage_complete') is True
                and data.get('original_checks_reconciled') is True
                and isinstance(data.get('historical_requirement_denominator'), int)
                and data['historical_requirement_denominator'] > 0
                and all(r.get('status') == 'PASS' for r in rows))
    if not complete:
        if data.get('allow_unrelated_work') is not False:
            raise ValueError('Incomplete UI work cannot unlock unrelated work')
        if data.get('priority') != 'P0_COMPETITOR_UI_ONLY':
            raise ValueError('Exclusive UI priority missing')
        if data.get('product_acceptance_claimed') is not False:
            raise ValueError('Product completion claimed without full evidence')
    if require_complete and not complete:
        raise ValueError('UI_COMPLETION_OPEN: mandatory evidence or historical coverage missing')
    return {'registered_tasks': len(ids), 'milestones': len({i.split('.')[0] for i in ids}),
            'document_structure': 'PASS', 'product_completion': 'PASS' if complete else 'OPEN'}



def validate_crosswalk(data: dict, wbs_ids: set[str], root: Path = ROOT) -> dict:
    """Verify retained original row identities/wording against pinned local sources.

    This checks traceability only. It cannot qualify UI behavior or human evidence.
    """
    if data.get('schema_version') != 1 or data.get('product_acceptance') is not False:
        raise ValueError('Crosswalk is not a non-acceptance traceability document')
    sources = data.get('sources', [])
    source_index = {item['path']: item for item in sources}
    if not sources or len(source_index) != len(sources):
        raise ValueError('Missing or duplicated crosswalk source')
    loaded = {}
    for name, source in source_index.items():
        path = (root / name).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError('Crosswalk source must remain in the repository')
        content = path.read_bytes()
        lines = content.decode('utf-8').splitlines()
        if (hashlib.sha256(content).hexdigest() != source['sha256']
                or len(lines) != source['line_count']):
            raise ValueError(f'{name}: original source changed; reconcile first')
        loaded[name] = lines
    families = {'U': 16, 'A': 17, 'E': 13, 'L': 12, 'X': 11,
                'S': 24, 'C': 10, 'P': 10, 'V': 8}
    expected = {
        'original_ui_audit_rows': {f'UI-{i:02}' for i in range(1, 8)},
        'et_checks': {f'ET-T{i:02}' for i in range(1, 25)},
        'original_user_scenarios': {f'{family}-{i:03}' for family, count in families.items()
                                    for i in range(1, count + 1)},
        'historical_gap_rows': {'UX-01A', 'UX-01B', 'UX-02', 'UX-03A', 'UX-03B',
                                'UX-04A', 'UX-04B', 'UX-05A', 'UX-05B'},
    }
    if data.get('original_user_family_counts') != families:
        raise ValueError('Original user scenario family counts changed')
    for group, ids in expected.items():
        rows = data.get(group, [])
        if len(rows) != len(ids) or {row['id'] for row in rows} != ids:
            raise ValueError(f'{group}: original identifiers missing or duplicated')
        for row in rows:
            links = row.get('wbs', [])
            if not links or len(links) != len(set(links)) or not set(links) <= wbs_ids:
                raise ValueError(f"{row['id']}: missing or invalid WBS mapping")
            line = loaded[row['source']][row['line'] - 1]
            cells = [cell.strip() for cell in line.split('|')[1:-1]]
            identity = cells[0].replace('**', '') if cells else ''
            if group == 'original_ui_audit_rows':
                identity = identity.split(' / ')[0]
            if identity != row['id']:
                raise ValueError(f"{row['id']}: original line identity changed")
            if group in {'historical_gap_rows', 'original_ui_audit_rows'}:
                if row.get('source_row_verbatim') != line:
                    raise ValueError(f"{row['id']}: original gap wording changed")
            else:
                if hashlib.sha256(line.encode()).hexdigest() != row.get('source_row_sha256'):
                    raise ValueError(f"{row['id']}: original row hash changed")
                fields = ('criterion_verbatim',) if group == 'et_checks' else (
                    'objective_verbatim', 'oracle_verbatim')
                if any(row.get(field) != cells[index + 1] for index, field in enumerate(fields)):
                    raise ValueError(f"{row['id']}: original requirement wording changed")
    findings = data.get('historical_structured_findings', [])
    study_path = 'docs/GRANT_UI_UX_COMPETITOR_STUDY_20261010.json'
    original = json.loads('\n'.join(loaded[study_path]))['findings']
    originals = {row['id']: row for row in original}
    if len(findings) != len(original) or {row['id'] for row in findings} != set(originals):
        raise ValueError('Original structured finding IDs differ')
    for row in findings:
        original_row = originals[row['id']]
        if (row.get('feature_verbatim') != original_row['feature']
                or row.get('recommendation_verbatim') != original_row['recommendation']):
            raise ValueError('Original structured finding wording changed')
        if original_row['priority'] != 'defer' and not row.get('wbs'):
            raise ValueError('Accepted finding has no WBS mapping')
        if not set(row.get('wbs', [])) <= wbs_ids:
            raise ValueError('Structured finding references unknown WBS')
        if original_row['priority'] == 'defer' and row.get('disposition') != 'ORIGINAL_EXPLICIT_DEFERRED_NOT_NEW_SCOPE':
            raise ValueError('Original explicit deferral was silently changed')
    narrative_expected = {
        'P0-2A','P0-2B','P0-2C','P0-2D','P0-2E','P0-2F','P0-2G',
        'UX-A','UX-B','UX-C','UX-D','UX-E',
        'G-CI-1','G-CI-2','G-CI-3','G-CI-4','G-CI-5',
        'B2-FOUNDATION','B3-APPROVER-GROUP','B3-ADMIN-CAPABILITY','B3-MAIL-TEST',
        'B4-TEMPLATE-DELIVERY-MOBILE','B4-POLICY-MOBILE','B4-POLICY-TEMPLATE-CAS','B4-DELIVERY-FILTER',
        'B5-EXCEPTION-INTEGRATION-DIRS','B5-OPS-MOBILE','B5-AUDIT-CARDS','B5-BACKUP-CLI','B5-AUDIT-WORKLIST',
        'REA-KEYCLOAK-UI','SCOPE-EXPLICIT-NON-GAPS',
    }
    narrative = data.get('historical_narrative_atoms', [])
    if len(narrative) != len(narrative_expected) or {row.get('id') for row in narrative} != narrative_expected:
        raise ValueError('Historical narrative atom IDs are missing or duplicated')
    for row in narrative:
        source = row.get('source')
        if source not in loaded:
            raise ValueError(f"{row.get('id')}: narrative source is not pinned")
        start, end = row.get('start_line'), row.get('end_line')
        if type(start) is not int or type(end) is not int or start < 1 or end < start or end > len(loaded[source]):
            raise ValueError(f"{row.get('id')}: invalid narrative source span")
        span = '\n'.join(loaded[source][start - 1:end])
        if hashlib.sha256(span.encode()).hexdigest() != row.get('source_span_sha256'):
            raise ValueError(f"{row.get('id')}: narrative source wording changed")
        links = row.get('wbs', [])
        if len(links) != len(set(links)) or not set(links) <= wbs_ids:
            raise ValueError(f"{row.get('id')}: invalid narrative WBS mapping")
        if not links and row.get('disposition') != 'ORIGINAL_NON_UI_SCOPE_RETAINED_NOT_UI_WBS':
            raise ValueError(f"{row.get('id')}: narrative item lacks WBS mapping")
        tests = row.get('verification_tests', [])
        if len(tests) != len(set(tests)):
            raise ValueError(f"{row.get('id')}: duplicate narrative verification test")
        if tests:
            if not re.fullmatch(r'[0-9a-f]{40}', row.get('evidence_head') or '') or not row.get('verification_artifact'):
                raise ValueError(f"{row.get('id')}: narrative test evidence is not exact-head bound")
            for test in tests:
                try:
                    test_path, title = test.split('::', 1)
                except ValueError as exc:
                    raise ValueError(f"{row.get('id')}: invalid narrative test reference") from exc
                candidate = (root / test_path).resolve()
                if not candidate.is_relative_to(root.resolve()) or not candidate.is_file() or title not in candidate.read_text():
                    raise ValueError(f"{row.get('id')}: narrative test reference is not present")
    return {'et_checks': 24, 'original_user_scenarios': 121,
            'historical_gap_rows': 9, 'structured_findings': len(findings), 'original_ui_audit_rows': 7,
            'historical_narrative_atoms': len(narrative),
            'traceability': 'PASS', 'product_acceptance': False}


def self_test(text: str, data: dict) -> int:
    bad_cases = []
    bad = copy.deepcopy(data)
    bad['tasks'].pop()
    bad_cases.append(bad)
    bad = copy.deepcopy(data)
    bad['tasks'][0]['source'] = 'PASS'
    bad_cases.append(bad)
    bad = copy.deepcopy(data)
    bad['allow_unrelated_work'] = True
    bad_cases.append(bad)
    bad = copy.deepcopy(data)
    bad['product_acceptance_claimed'] = True
    bad_cases.append(bad)
    for bad in bad_cases:
        try:
            validate(text, bad)
        except ValueError:
            continue
        raise ValueError('Negative self-test unexpectedly accepted invalid ledger')
    try:
        validate(text, data, require_complete=True)
    except ValueError as exc:
        if not str(exc).startswith('UI_COMPLETION_OPEN:'):
            raise
    else:
        raise ValueError('Open baseline falsely accepted as complete')
    return len(bad_cases) + 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-complete', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    try:
        text = DOC.read_text(encoding='utf-8')
        data = json.loads(LEDGER.read_text(encoding='utf-8'))
        result = validate(text, data, args.require_complete)
        if data.get('original_checks_reconciled'):
            crosswalk_path = (ROOT / data['original_crosswalk_path']).resolve()
            if not crosswalk_path.is_relative_to(ROOT):
                raise ValueError('Crosswalk path must remain in repository')
            content = crosswalk_path.read_bytes()
            if hashlib.sha256(content).hexdigest() != data['original_crosswalk_sha256']:
                raise ValueError('Crosswalk changed without ledger reconciliation')
            result['original_crosswalk'] = validate_crosswalk(
                json.loads(content), {row['id'] for row in data['tasks']})
        if args.self_test:
            result['negative_self_tests_passed'] = self_test(text, data)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, TypeError, IndexError) as exc:
        print(f'UI_WBS_VALIDATION_FAILED: {exc}')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
