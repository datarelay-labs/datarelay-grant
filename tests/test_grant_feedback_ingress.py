"""M6 first-party Grant response feedback must not mint another Grant approval."""

import pytest


@pytest.mark.parametrize("source", [
    {"event_type": "GRANT.APPROVAL.OUTCOME"},
    {"event_type": " Grant.approval.outcome "},
    {"grant_event_id": "signed-event-reference"},
    {"GRANT-REQUEST-ID": "prior-request"},
    {"origin_product": "DataRelay-Grant"},
    {"metadata": {"event_type": "grant.approval.outcome"}},
    {"source": {"origin": {"event_type": "grant.approval.outcome"}}},
])
def test_first_party_feedback_never_creates_a_new_request(env, source):
    response = env.api.post("/api/v1/requests", json=env.intake(source=source))
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "OUTCOME_FEEDBACK_LOOP"
    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT count(*) FROM requests").fetchone()[0] == 0


def test_external_stellar_source_without_grant_feedback_still_allowed(env):
    response = env.api.post("/api/v1/requests", json=env.intake(source={
        "event_type": "stellar.alert.created", "case_id": "case1", "alert_id": "alert1",
        "grant_reference": "customer-correlation-only",
    }))
    assert response.status_code == 202, response.text
