"""Non-executing Grant integration readiness: saved data cannot prove live effects."""

from grant.models import Integration


def readiness(env, ident):
    response = env.human('admin').get(f'/api/v1/integrations/{ident}/diagnostics')
    assert response.status_code == 200, response.text
    return response.json()['external_readiness']


def test_mixed_control_credential_is_not_external_authorization(env):
    current = readiness(env, env.integration['id'])
    assert current['scope'] == 'pre_live_configuration_only'
    assert current['active_policy'] is True
    assert current['separate_producer'] is False
    assert current['separate_executor'] is False
    assert current['mixed_credentials'] == 1
    assert current['native_execution_guard'] == 'not_verified'
    assert current['independent_effect_readback'] == 'not_verified'
    assert current['live_effect_authorized'] is False
    assert env.human('requester').get(
        f"/api/v1/integrations/{env.integration['id']}/diagnostics"
    ).status_code == 403


def test_separate_control_scopes_do_not_imply_native_guard(env):
    ident = env.integration['id']
    env.auth.issue_token(env.admin, ident, ['request:create','request:read'])
    env.auth.issue_token(env.admin, ident, ['request:read','grant:consume','result:write'])
    current = readiness(env, ident)
    assert current['separate_producer'] is True
    assert current['separate_executor'] is True
    assert current['mixed_credentials'] == 1
    assert current['live_effect_authorized'] is False


def test_stellar_tenant_binding_is_not_receiver_proof(env):
    item = env.core.create_integration(env.admin, Integration(
        name='Isolated Stellar',kind='stellar',tenant='fixture-tenant',
        callback_url=env.settings.callback_urls[0],
    ))
    current = readiness(env, item['id'])
    assert current['tenant_bound'] is True
    assert current['separate_executor'] is None
    assert current['native_execution_guard'] == 'not_applicable'
    assert current['receiver_readback'] == 'not_verified'
    assert current['live_effect_authorized'] is False
    assert env.settings.callback_urls[0] not in str(current)


def test_disabled_control_has_no_active_policy_readiness(env):
    ident=env.integration['id']
    with env.db.transaction() as conn:
        conn.execute('UPDATE integrations SET enabled=0 WHERE id=?',(ident,))
    current=readiness(env,ident)
    assert current['active_policy'] is False
    assert current['live_effect_authorized'] is False
