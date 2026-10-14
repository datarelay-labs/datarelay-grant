"""Synthetic browser-test helper for the real bounded logo normalizer."""
import base64
import json
import sys
from grant.email_assets import normalize_logo

payload=json.load(sys.stdin)
value=normalize_logo(payload['data_base64'])
print(json.dumps({
    'id':value['id'],'media_type':value['media_type'],'width':value['width'],'height':value['height'],
    'bytes':len(value['data']),'immutable':True,'data_base64':base64.b64encode(value['data']).decode('ascii'),
}))
