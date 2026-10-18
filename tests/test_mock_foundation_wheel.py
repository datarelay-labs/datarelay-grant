"""Opt-in, byte-pinned PRIVATE RC41 Wheel import, with mock Grant facts only.

Pass GRANT_TEST_RC41_BUNDLE=<owner-reviewed local private bundle>. The Wheel is
never installed into the Grant backend or shipped to its product users.
"""

from __future__ import annotations

import hashlib
import io
import os
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path, PurePosixPath

import pytest

SOURCE_HEAD = '46ddb60cad8eae7b1718588cd19421e61b5300e7'
BUNDLE_SHA256 = '628dd4d6fd8ccb1d39dd6cc33982a3411fedcca405aa193b3654505fcaaefb48'
WHEEL_SHA256 = 'cad95d8ba2d707690ccdfc8ca097e9e746d8ace0f27d70c1c4c638bc663399b8'
WHEEL_NAME = 'datarelay_onprem_security-0.10.0.dev0-py3-none-any.whl'


def test_immutable_private_wheel_mock_backup_and_notification_preflights(tmp_path):
    raw = os.environ.get('GRANT_TEST_RC41_BUNDLE')
    if not raw:
        pytest.skip('Private original-source RC41 bundle is opt-in and not published')
    bundle = Path(raw)
    assert bundle.is_file() and hashlib.sha256(bundle.read_bytes()).hexdigest() == BUNDLE_SHA256
    with tarfile.open(bundle, 'r:gz') as archive:
        assert all(
            (m.isfile() or m.isdir()) and PurePosixPath(m.name).parts[0] == SOURCE_HEAD
            and not PurePosixPath(m.name).is_absolute() and '..' not in PurePosixPath(m.name).parts
            for m in archive.getmembers()
        )
        file = archive.extractfile(SOURCE_HEAD + '/' + WHEEL_NAME)
        assert file is not None
        wheel_bytes = file.read()
    assert hashlib.sha256(wheel_bytes).hexdigest() == WHEEL_SHA256
    # Import directly from the read-only ZIP-based Wheel within a *separate*
    # Python subprocess; no site-packages, lockfile, DB or prod host mutation.
    with zipfile.ZipFile(io.BytesIO(wheel_bytes)) as zf:
        names = zf.namelist()
        assert any(name.endswith('datarelay_onprem_security/backup_recovery.py') for name in names)
        assert all('..' not in PurePosixPath(n).parts and not n.startswith('/') for n in names)
    scratch_wheel = tmp_path / WHEEL_NAME
    scratch_wheel.write_bytes(wheel_bytes)
    probe = '''
import json
import datarelay_onprem_security as pf
from datarelay_onprem_security import (
    BackupEvidence,BackupKind,BackupState,RestoreEvidence,
    NotificationDestination,NotificationKind,TestSendEvidence,
    assess_backup,preview_restore,preview_test_send
)
assert pf.__file__.startswith(__import__('os').environ['EXPECTED_PRIVATE_WHEEL']), pf.__file__
now=1730000000
backup=BackupEvidence(
    product_ref='grant',backup_ref='mock.backup',revision_ref='revision1',
    kind=BackupKind.DISASTER_RECOVERY,state=BackupState.SUCCEEDED,
    created_at=now-100,artifact_bytes=4096,archive_sha256='0'*64,
    encrypted_at_rest=True,restore_drill_verified_at=None,
)
assessment=assess_backup(backup,now=now)
assert not assessment.healthy
assert 'restore_not_verified' in [p.value for p in assessment.problems]
preview=preview_restore(
    backup,RestoreEvidence(expected_product_ref='grant',expected_backup_revision='revision1'),
    now=now,
)
assert not preview.may_submit_to_product_authority
assert preview.product_apply_required
blocked=preview_test_send(
    NotificationDestination(reference='grant.smtp',revision='snapshot.v1',
                            kind=NotificationKind.SMTP,enabled=False),
    TestSendEvidence(expected_revision='snapshot.v1'),
)
assert not blocked.may_submit_to_product_sender
assert 'destination_disabled' in [p.value for p in blocked.blockers]
print(json.dumps({'wheel_import':'pass','backup_preflight':'blocked_no_real_drill',
                  'notification_send':'blocked_no_authority','external_mutations':0}))
'''
    env = dict(os.environ, PYTHONPATH=str(scratch_wheel),
               EXPECTED_PRIVATE_WHEEL=str(scratch_wheel), PYTHONDONTWRITEBYTECODE='1')
    report = subprocess.run([sys.executable, '-c', probe], check=True,
                            capture_output=True, text=True, timeout=15,
                            cwd=tmp_path, env=env)
    assert '"wheel_import": "pass"' in report.stdout
    assert '"external_mutations": 0' in report.stdout
