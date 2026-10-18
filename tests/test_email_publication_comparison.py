"""Publication comparison is authoritative, bounded and read-only."""
from copy import deepcopy

from grant.email_design import EmailDesign
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES


def test_review_compares_published_copy_with_draft_without_issuing_mail(env):
    admin=env.human('admin')
    payload={'name':'Canvas comparison','templates':deepcopy(DEFAULT_EVENT_TEMPLATES),'design':EmailDesign(shared_layout_revision=3).model_dump()}
    created=admin.post('/api/v1/notification-template-sets',json=payload).json()
    url='/api/v1/notification-template-sets/'+created['id']
    first=admin.post(url+'/publication-review',json={}).json()
    assert first['comparison']['before'] is None
    assert first['comparison']['event']=='requested'
    published=admin.post(url+'/publish',json={'expected_updated_at':first['expected_updated_at'],'review_hash':first['review_hash'],'reason':'Synthetic initial publication'}).json()
    payload['templates']['requested']['body']='Changed requested wording'
    payload['design']['event_headings']={'requested':'Changed heading'}
    payload['design']['styles']['button_radius']=12
    changed=admin.put(url,json={**payload,'enabled':True,'expected_updated_at':published['updated_at']})
    assert changed.status_code==200,changed.text
    with env.db.transaction(write=False) as conn:
        before={table:conn.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in ('outbox','decision_issuances','email_template_revisions')}
    review=admin.post(url+'/publication-review',json={}).json()
    assert 'Changed requested wording' in review['comparison']['after']['body']
    assert 'Changed requested wording' not in review['comparison']['before']['body']
    assert review['comparison']['changed_events']==['requested']
    assert 'styles.button_radius' in review['comparison']['shared_fields']
    with env.db.transaction(write=False) as conn:
        after={table:conn.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in before}
    assert after==before
