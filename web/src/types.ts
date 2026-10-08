export type User = { id: string; username: string; email: string; role: 'admin' | 'member'; mfa_enabled: boolean };
export type Session = { state: 'authenticated' | 'mfa_required'; user: User | null; csrf: string };
export type Action = { kind: string; target: string; parameters: Record<string, unknown> };
export type Outcome = 'APPROVED' | 'HELD' | 'DENIED';
export type Delivery = { id: string; kind: string; state: string; attempts: number; last_error: string | null; revision: number };
export type RequestRow = {
 id: string; external_id: string; integration_id: string; profile_id: string; profile_version_id?: string | null; policy_version?: number | null;
 requester_id: string | null; approver_id: string; viewer_assigned?: boolean; viewer_can_decide?: boolean; viewer_delegated_for?: string | null; approval_plan?: { mode: string; group_id?: string; members: string[]; required: number }; decisions?: { actor_id: string; decision: string; reason: string; decided_at: number }[]; title: string; reason: string;
 action: Action; action_hash: string; source: Record<string, unknown>; state: string;
 decision: Outcome | null; decision_actor: string | null; decision_at: number | null;
 revision: number; created_at: number; deadline: number; grant_until: number | null;
 predecessor_id: string | null; execution_id: string | null; execution_state: string;
 execution_result: { status: string; evidence: string } | null; delivery_state: string;
 overdue?: boolean; escalation?: { target_user_id: string | null; target_group_id: string | null; target_members: string[]; due_at: number; fired_at: number | null } | null;
 deliveries?: Delivery[]; timeline?: { id: string; at: number; actor: string; action: string; detail: unknown }[];
};
export type Integration = { id: string; name: string; kind: 'datarelay' | 'stellar'; tenant: string; enabled: boolean; callback_origin: string };
export type EmailTemplate = { id: string; name: string; subject_template: string; body_template: string; reminder_subject_template: string; reminder_body_template: string; enabled: boolean };
export type PolicyLifecycle = 'DRAFT' | 'TESTING' | 'ACTIVE' | 'DISABLED';
export type Profile = {
 integration_kind?: 'datarelay' | 'stellar'; tenant?: string; id: string; version_id: string; version: number; name: string;
 integration_id: string; approver_id: string; approval_mode: string; approver_group_id: string | null; approvals_required: number | null; action_kind: string; email_template_id: string | null;
 notification_template_set_id?: string | null; email_template_name?: string | null;
 deadline_seconds: number; reminder_seconds: number; max_reminders: number; grant_seconds: number;
 tenant_selector: string; environment: string; severity: string; risk_level: string;
 lifecycle: PolicyLifecycle; enabled: boolean; active_version?: number | null; active_version_id?: string | null;
 created_at?: number; updated_at?: number; activated_at?: number | null; disabled_at?: number | null;
};
export type NotificationEvent = 'requested' | 'reminder' | 'approved' | 'denied' | 'expired' | 'cancelled' | 'execution_succeeded' | 'execution_failed' | 'execution_unknown';
export type NotificationEventTemplate = { subject: string; body: string };
export type NotificationTemplateSet = { id: string; name: string; templates: Record<NotificationEvent, NotificationEventTemplate>; enabled: boolean; created_at: number; updated_at: number };
export type NotificationDelivery = { id: string; request_id: string; event_type: string; state: string; attempts: number; last_error: string | null; available_at: number; delivered_at: number | null; created_at: number; transport_accepted: boolean; receipt_confirmed: boolean };
export type NotificationBranding = { brand_name: string; sender_display_name: string; logo_asset: string };
export type PolicyHistory = { profile_id: string; versions: Profile[]; events: { id: string; at: number; actor: string; action: string; detail: Record<string, unknown> }[] };
export type PolicyPreview = { policy: Profile; resolution: { matched: boolean; specificity: number; selectors: Record<string, { configured: string | null; actual: string | null; matched: boolean; wildcard: boolean }> }; approver_id: string; timing: { deadline_seconds: number; reminder_seconds: number; max_reminders: number }; execution_grant: { action_kind: string; validity_seconds: number }; notification: { subject: string; body: string; sender_display_name: string; brand_name: string }; execution_allowed: boolean; test_mode?: boolean };

export type ApproverGroup = { id: string; name: string; member_ids: string[]; enabled: boolean };
