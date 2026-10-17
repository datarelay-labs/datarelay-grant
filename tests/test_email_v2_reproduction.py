import hashlib
import json
from pathlib import Path

import pytest
from test_email_renderer import CONTEXT

from grant.email_design import EmailDesign
from grant.email_renderer import OUTCOMES, PREVIEW_ORIGIN, EmailSecurity, compose_email

EXPECTED=json.loads((Path(__file__).parent / "fixtures/email_v2_output_hashes.json").read_text())
@pytest.mark.parametrize("key,expected", EXPECTED.items())
def test_archived_v2_output_is_unchanged_by_canvas_layout(key, expected):
    event,mode=key.split("/")
    output=compose_email({"subject":"Synthetic "+event,"body":"Synthetic body","brand_name":"Grant"}, CONTEXT,event,
        security=EmailSecurity(mode,"0000",{key:PREVIEW_ORIGIN+key.lower() for key in OUTCOMES},True),
        design=EmailDesign(shared_layout_revision=2).model_dump(),sample=True)
    assert hashlib.sha256(json.dumps(output,sort_keys=True,ensure_ascii=False).encode()).hexdigest()==expected
