"""Small request, profile and integration HTTP surface."""

from typing import Literal

from fastapi import Query, Request

from .integration_diagnostics import configuration_manifest, diagnostics
from .models import (
    ApproverGroup,
    ApproverGroupUpdate,
    Cancel,
    Consume,
    Decision,
    Delegation,
    EmailTemplate,
    EmailTemplateUpdate,
    Escalation,
    Intake,
    Integration,
    NotificationBrandingUpdate,
    NotificationPreview,
    NotificationTemplateSet,
    NotificationTemplateSetUpdate,
    NotificationTestSend,
    PolicySample,
    Profile,
    ProfileUpdate,
    Reassign,
    RequestComment,
    Result,
    Token,
)


def register_domain(app, actor, human, reader):
    core, auth, worker = app.state.core, app.state.auth, app.state.worker

    @app.get("/api/v1/delegations")
    def delegations(request: Request):
        return core.delegations(human(request))

    @app.post("/api/v1/delegations", status_code=201)
    def add_delegation(body: Delegation, request: Request):
        return core.create_delegation(human(request), body)

    @app.post("/api/v1/delegations/{ident}/revoke")
    def revoke_delegation(ident: str, request: Request):
        return core.revoke_delegation(human(request), ident)

    @app.get("/api/v1/approvers/directory")
    def approver_directory(request: Request):
        return core.approver_directory(human(request))

    @app.get("/api/v1/requests")
    def requests(
        request: Request,
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0),
        view: Literal[
            "all", "needs", "overdue", "held", "delegated", "recent", "requester", "escalated",
            "ops_pending", "ops_overdue", "ops_approved_unused",
            "ops_execution_unknown", "ops_execution_failed",
            "ops_email_failed", "ops_webhook_failed", "ops_delivery_failed",
            "ops_decided",
        ] = "all",
        search: str = Query("", max_length=100),
        state: str | None = Query(None, max_length=24),
        collaboration_state: str | None = Query(None, max_length=32),
        policy_id: str | None = Query(None, max_length=100),
        requester_id: str | None = Query(None, max_length=100),
        approver_id: str | None = Query(None, max_length=100),
        group_id: str | None = Query(None, max_length=100),
        integration_id: str | None = Query(None, max_length=100),
        action_kind: str | None = Query(None, max_length=100),
        created_after: float | None = Query(None, ge=0),
        created_before: float | None = Query(None, ge=0),
        delivery_state: str | None = Query(None, max_length=32),
        execution_state: str | None = Query(None, max_length=32),
    ):
        return core.list_requests(
            reader(request),
            limit,
            offset,
            view=view,
            search=search,
            state=state,
            collaboration_state=collaboration_state,
            policy_id=policy_id,
            requester_id=requester_id,
            approver_id=approver_id,
            group_id=group_id,
            integration_id=integration_id,
            action_kind=action_kind,
            created_after=created_after,
            created_before=created_before,
            delivery_state=delivery_state,
            execution_state=execution_state,
        )

    @app.post("/api/v1/requests", status_code=202)
    def create_request(body: Intake, request: Request):
        return core.create_request(actor(request), body)

    @app.get("/api/v1/requests/{ident}")
    def get_request(ident: str, request: Request):
        return core.get(reader(request), ident)

    @app.get("/api/v1/requests/{ident}/comparison")
    def request_comparison(ident: str, request: Request):
        return core.compare_replacement(reader(request), ident)

    @app.post("/api/v1/requests/{ident}/comments", status_code=201)
    def comment(ident: str, body: RequestComment, request: Request):
        return core.add_request_comment(human(request), ident, body)

    @app.post("/api/v1/requests/{ident}/decision")
    def decision(ident: str, body: Decision, request: Request):
        return core.decide(human(request), ident, body)

    @app.post("/api/v1/requests/{ident}/escalation")
    def escalation(ident: str, body: Escalation, request: Request):
        return core.configure_escalation(actor(request), ident, body)

    @app.post("/api/v1/requests/{ident}/reassign")
    def reassign(ident: str, body: Reassign, request: Request):
        return core.reassign_request(actor(request), ident, body)

    @app.post("/api/v1/requests/{ident}/cancel")
    def cancel(ident: str, body: Cancel, request: Request):
        return core.cancel(actor(request), ident, body)

    @app.post("/api/v1/requests/{ident}/consume")
    def consume(ident: str, body: Consume, request: Request):
        return core.consume(actor(request), ident, body)

    @app.post("/api/v1/requests/{ident}/result")
    def result(ident: str, body: Result, request: Request):
        return core.report(actor(request), ident, body)

    @app.get("/api/v1/approver-groups")
    def approver_groups(request: Request):
        return core.approver_groups(actor(request))

    @app.post("/api/v1/approver-groups", status_code=201)
    def add_approver_group(body: ApproverGroup, request: Request):
        return core.create_approver_group(actor(request), body)

    @app.put("/api/v1/approver-groups/{ident}")
    def update_approver_group(ident: str, body: ApproverGroupUpdate, request: Request):
        return core.update_approver_group(actor(request), ident, body)

    @app.get("/api/v1/profiles")
    def profiles(request: Request):
        return core.profiles(reader(request))

    @app.post("/api/v1/profiles", status_code=201)
    def add_profile(body: Profile, request: Request):
        return core.create_profile(actor(request), body)

    @app.post("/api/v1/profiles/preview")
    def preview_profile(body: PolicySample, request: Request):
        return core.preview_policy(actor(request), body)

    @app.put("/api/v1/profiles/{ident}")
    def update_profile(ident: str, body: ProfileUpdate, request: Request):
        return core.update_profile(actor(request), ident, body)

    @app.post("/api/v1/profiles/{ident}/test")
    def test_profile(ident: str, request: Request):
        return core.transition_profile(actor(request), ident, "TESTING")

    @app.post("/api/v1/profiles/{ident}/activate")
    def activate_profile(ident: str, request: Request):
        return core.transition_profile(actor(request), ident, "ACTIVE")

    @app.post("/api/v1/profiles/{ident}/disable")
    def disable_profile(ident: str, request: Request):
        return core.transition_profile(actor(request), ident, "DISABLED")

    @app.post("/api/v1/profiles/{ident}/clone", status_code=201)
    def clone_profile(ident: str, request: Request):
        return core.clone_profile(actor(request), ident)

    @app.get("/api/v1/profiles/{ident}/history")
    def profile_history(ident: str, request: Request):
        return core.profile_history(actor(request), ident)

    @app.post("/api/v1/profiles/{ident}/test-request")
    def test_profile_request(ident: str, body: PolicySample, request: Request):
        return core.test_profile_request(actor(request), ident, body)

    @app.get("/api/v1/email-templates")
    def email_templates(request: Request):
        return core.email_templates(actor(request))

    @app.post("/api/v1/email-templates", status_code=201)
    def add_email_template(body: EmailTemplate, request: Request):
        return core.create_email_template(actor(request), body)

    @app.put("/api/v1/email-templates/{ident}")
    def update_email_template(ident: str, body: EmailTemplateUpdate, request: Request):
        return core.update_email_template(actor(request), ident, body)

    @app.get("/api/v1/notification-template-sets")
    def notification_template_sets(request: Request):
        return core.notification_template_sets(actor(request))

    @app.post("/api/v1/notification-template-sets", status_code=201)
    def add_notification_template_set(body: NotificationTemplateSet, request: Request):
        return core.create_notification_template_set(actor(request), body)

    @app.put("/api/v1/notification-template-sets/{ident}")
    def update_notification_template_set(
        ident: str, body: NotificationTemplateSetUpdate, request: Request
    ):
        return core.update_notification_template_set(actor(request), ident, body)

    @app.post("/api/v1/notification-template-sets/{ident}/preview")
    def preview_notification(ident: str, body: NotificationPreview, request: Request):
        return core.preview_notification(actor(request), ident, body)

    @app.post("/api/v1/notification-template-sets/{ident}/test-send")
    def test_notification(ident: str, body: NotificationTestSend, request: Request):
        return core.test_notification(actor(request), ident, body)

    @app.get("/api/v1/notification-variables")
    def notification_variables(request: Request):
        return core.notification_variables(actor(request))

    @app.get("/api/v1/notification-deliveries")
    def notification_deliveries(request: Request):
        return core.notification_deliveries(actor(request))

    @app.get("/api/v1/notification-branding")
    def notification_branding(request: Request):
        return core.notification_branding(actor(request))

    @app.put("/api/v1/notification-branding")
    def update_notification_branding(body: NotificationBrandingUpdate, request: Request):
        return core.update_notification_branding(actor(request), body)

    @app.get("/api/v1/integrations")
    def integrations(request: Request):
        return core.integrations(actor(request))

    @app.get("/api/v1/integrations/configuration-export")
    def integration_manifest(request: Request):
        return configuration_manifest(app.state.db, actor(request))

    @app.get("/api/v1/integrations/{ident}/diagnostics")
    def integration_diagnostics(ident: str, request: Request):
        return diagnostics(app.state.db, actor(request), ident)

    @app.post("/api/v1/integrations", status_code=201)
    def add_integration(body: Integration, request: Request):
        return core.create_integration(actor(request), body)

    @app.post("/api/v1/integrations/tokens", status_code=201)
    def add_token(body: Token, request: Request):
        return auth.issue_token(actor(request), body.integration_id, body.scopes)

    @app.get("/api/v1/integrations/{ident}/tokens")
    def list_tokens(ident: str, request: Request):
        return auth.list_tokens(actor(request), ident)

    @app.post("/api/v1/integrations/tokens/{ident}/revoke")
    def revoke_token(ident: str, request: Request):
        return auth.revoke_token(actor(request), ident)

    @app.post("/api/v1/deliveries/{ident}/resend")
    def resend(ident: str, request: Request):
        return worker.resend(actor(request), ident)

    @app.post("/api/v1/integrations/{ident}/test")
    def test_connection(ident: str, request: Request):
        import time

        from .auth import require_current_authority
        from .db import audit, json_text, uid
        from .errors import GrantError
        from .transport import send_webhook

        principal = actor(request)
        principal.require_admin()
        auth.rate("connection-test:" + principal.id, 5, 60)
        with app.state.db.transaction(write=False) as conn:
            # Reject revoked sessions before even attempting an external
            # diagnostic. Callback acceptance is not action authorization.
            require_current_authority(conn, principal)
            row = conn.execute(
                "SELECT destination FROM integrations WHERE id=? AND enabled=1", (ident,)
            ).fetchone()
        if not row:
            raise GrantError("INTEGRATION_NOT_FOUND", 404)
        event_id = uid()
        payload = json_text(
            {
                "schema_version": 1,
                "event_type": "grant.connection.test",
                "event_id": event_id,
                "at": time.time(),
                "execution_allowed": False,
            }
        )
        try:
            send_webhook(app.state.settings, app.state.settings.unseal(row[0]), payload, event_id)
        except Exception as exc:
            # Failure is still an operator-visible diagnostic, never proof of
            # execution. Store a bounded event without URL or exception text.
            with app.state.db.transaction() as conn:
                require_current_authority(conn, principal)
                audit(
                    conn, None, principal.id, "integration.test_failed",
                    {"integration_id": ident, "event_id": event_id},
                )
            raise GrantError("CONNECTION_TEST_FAILED", 502) from exc
        with app.state.db.transaction() as conn:
            require_current_authority(conn, principal)
            audit(
                conn,
                None,
                principal.id,
                "integration.test_accepted",
                {"integration_id": ident, "event_id": event_id},
            )
        return {"transport_accepted": True, "execution_allowed": False, "event_id": event_id}
