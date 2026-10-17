"""Inventory policy usage is read-only and derived from active policies only."""
from test_email_publication import publish, template
from test_notification_center import activate, policy_payload


def test_inventory_counts_only_active_policy_usage(env):
    admin=env.human('admin')
    saved=template(admin)
    assert publish(admin,saved['id']).status_code==200
    def count():
        rows=admin.get('/api/v1/notification-template-sets').json()
        return next(row['active_policy_count'] for row in rows if row['id']==saved['id'])
    assert count()==0
    response=admin.post('/api/v1/profiles',json=policy_payload(env,saved['id']))
    assert response.status_code==201,response.text
    assert count()==0
    activate(admin,response.json()['id'])
    assert count()==1
    assert env.human('approver').get('/api/v1/notification-template-sets').status_code==403
