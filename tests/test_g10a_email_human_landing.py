"""Public email-link navigation must render inert HTML but preserve JSON API.

Navigation is not verification. Server POST Origin, PIN/OTP/fresh MFA and
one-use controls must remain unchanged and independently authoritative.
"""
import re
from fastapi.testclient import TestClient


def test_email_browser_navigation_is_html_and_json_scanners_remain_readonly(env,tmp_path):
    site=tmp_path/'isolated-web'
    site.mkdir()
    (site/'index.html').write_text('<!doctype html><html><body>GRANT_TEST_WEB_SHELL</body></html>')
    object.__setattr__(env.settings,'web_root',site)
    response=env.human('requester').post(
        '/api/v1/requests',json=env.intake())
    assert response.status_code==202,response.text
    request_id=response.json()['id']
    with env.db.transaction(write=False) as conn:
        outbox=conn.execute(
            'SELECT payload FROM outbox WHERE request_id=? AND issuance_id IS NOT NULL LIMIT 1',
            (request_id,),
        ).fetchone()
        assert outbox is not None
    body=env.settings.unseal(outbox['payload'])['body']
    found=re.search(r'Approve: http://testserver/api/v1/decision-intents/([a-zA-Z0-9_-]+)',body)
    assert found is not None
    token=found.group(1)
    url='/api/v1/decision-intents/'+token
    tables=('audit','rate_limits','request_decisions','outbox','decision_issuances')
    with env.db.transaction(write=False) as conn:
        before={t:conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in tables}
    with TestClient(env.app) as browser:
        html=browser.get(url,headers={'Accept':'text/html,application/xhtml+xml'})
        assert html.status_code==200,html.text
        assert html.headers['content-type'].startswith('text/html')
        assert 'GRANT_TEST_WEB_SHELL' in html.text
        assert token not in html.text
        assert html.headers['cache-control']=='no-store'
        assert html.headers['referrer-policy']=='no-referrer'
        assert html.headers['x-frame-options']=='DENY'
        assert "connect-src 'self'" in html.headers['content-security-policy']
        json_response=browser.get(url,headers={'Accept':'application/json'})
        assert json_response.status_code==200
        assert json_response.headers['content-type'].startswith('application/json')
        assert json_response.json()['outcome']=='APPROVED'
        assert json_response.json()['details_visible'] is False
        wildcard=browser.get(url,headers={'Accept':'*/*'})
        assert wildcard.status_code==200
        assert wildcard.json()['outcome']=='APPROVED'
        head=browser.head(url,headers={'Accept':'text/html'})
        assert head.status_code==204
    with env.db.transaction(write=False) as conn:
        after={t:conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in tables}
    assert after==before


def test_browser_navigation_missing_static_assets_fails_closed_not_token_json(env,tmp_path):
    site=tmp_path/'empty'
    site.mkdir()
    object.__setattr__(env.settings,'web_root',site)
    with TestClient(env.app) as browser:
        response=browser.get('/api/v1/decision-intents/'+('A'*43),
                             headers={'Accept':'text/html'})
        assert response.status_code==503
        assert response.json()['error']['code']=='FRONTEND_NOT_BUILT'
