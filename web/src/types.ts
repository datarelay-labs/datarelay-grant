export type User = { id: string; username: string; email: string; role: 'admin' | 'member'; mfa_enabled: boolean };
export type Session = { state: 'authenticated' | 'mfa_required'; user: User | null; csrf: string };
export type Action = { kind: string; target: string; parameters: Record<string, unknown> };
export type Outcome = 'APPROVED' | 'HELD' | 'DENIED';
export type Delivery = { id: string; kind: string; state: string; attempts: number; last_error: string | null; revision: number };
export type RequestRow = {
 id: string; external_id: string; integration_id: string; profile_id: string;
 requester_id: string | null; approver_id: string; title: string; reason: string;
 action: Action; action_hash: string; source: Record<string, unknown>; state: string;
 decision: Outcome | null; decision_actor: string | null; decision_at: number | null;
 revision: number; created_at: number; deadline: number; grant_until: number | null;
 predecessor_id: string | null; execution_id: string | null; execution_state: string;
 execution_result: { status: string; evidence: string } | null; delivery_state: string;
 deliveries?: Delivery[]; timeline?: { id: string; at: number; actor: string; action: string; detail: unknown }[];
};
export type Integration = { id: string; name: string; kind: 'datarelay' | 'stellar'; tenant: string; enabled: boolean; callback_origin: string };
export type EmailTemplate = { id: string; name: string; subject_template: string; body_template: string; reminder_subject_template: string; reminder_body_template: string; enabled: boolean };
export type Profile = { integration_kind?: 'datarelay' | 'stellar'; tenant?: string; id: string; name: string; integration_id: string; approver_id: string; action_kind: string; email_template_id: string | null; email_template_name?: string | null; deadline_seconds: number; reminder_seconds: number; max_reminders: number; grant_seconds: number; enabled: boolean };
