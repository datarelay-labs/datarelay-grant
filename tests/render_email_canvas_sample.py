"""Synthetic browser-test adapter: pure rendering only, no DB/account/SMTP access."""
import json
import sys

from grant.email_design import validate_design
from grant.email_renderer import OUTCOMES, PREVIEW_ORIGIN, EmailSecurity, compose_email
from grant.mail_templates import TOKEN

payload=json.load(sys.stdin)
context=payload['sample']
template=payload['template']
event=payload['event']
content={key:TOKEN.sub(lambda match:context[match[1]],value)
         for key,value in template['templates'][event].items()}
content['brand_name']='DataRelay Grant'
security=EmailSecurity(payload['verification_mode'],'0000',
                       {key:PREVIEW_ORIGIN+key.lower() for key in OUTCOMES},True)
result=compose_email(content,context,event,security=security,design=validate_design(template['design']),sample=True,logo=template.get('logo'))
print(json.dumps({'rendered':result,'validation':{'html_bytes':len(result['html'].encode()),'protected_actions':4 if event in ('requested','reminder') else 1}}))
