import { Alert, Button } from '@datarelay-labs/foundation';
import type { Profile, RequestRow } from './types';

/** The Grant server still resolves the live policy and assigned approvers.
 * This preview reviews the exact requested action and source fields, not an
 * independently granted authorization or executable effect.
 */
export type NewRequestDraft = {
  profile: Profile | null;
  predecessor: RequestRow | null;
  predecessorId?: string;
  title: string;
  target: string;
  external: string;
  parameters: string;
  reason: string;
  sourceTenant: string;
  environment: string;
  severity: string;
  riskLevel: string;
};
export type RequestCreationPayload = {
  external_id: string;
  profile_id: string;
  title: string;
  action: { kind: string; target: string; parameters: Record<string, unknown> };
  source: Record<string, unknown>;
  reason: string;
  predecessor_id?: string;
};
export type RequestCreationReview = {
  payload: RequestCreationPayload;
  profileName: string;
  profileVersion: number;
  draftSignature: string;
};

export function prepareRequestCreationReview(draft: NewRequestDraft): RequestCreationReview {
  const selected = draft.profile;
  if (!selected || !selected.enabled) {
    throw new Error('Select an enabled approval profile before reviewing.');
  }
  if (!draft.title.trim() || draft.title.length > 250
    || !draft.target.trim() || draft.target.length > 500
    || !draft.external.trim() || draft.external.length > 200
    || draft.reason.length > 4000) {
    throw new Error('Provide a title, target, external ID and a bounded reason.');
  }
  if (draft.parameters.length > 12000) {
    throw new Error('Parameters exceed the 12000-character editor limit.');
  }
  if ([draft.sourceTenant, draft.environment, draft.severity, draft.riskLevel]
    .some((selector) => selector.length > 200)) {
    throw new Error('Source selectors must be at most 200 characters.');
  }
  if (draft.predecessorId && (!draft.predecessor
    || draft.predecessor.id !== draft.predecessorId
    || !(draft.predecessor.state === 'CANCELLED'
      || (draft.predecessor.state === 'EXPIRED'
        && draft.predecessor.collaboration_state === 'CHANGES_REQUESTED')))) {
    throw new Error('The original request cannot be used for this replacement.');
  }
  let params: unknown;
  try {
    params = JSON.parse(draft.parameters);
  } catch {
    throw new Error('Parameters must be a valid JSON object.');
  }
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('Parameters must be a JSON object.');
  }
  if (selected.tenant && draft.sourceTenant !== selected.tenant) {
    throw new Error('Tenant must match the integration scope.');
  }
  if ((selected.tenant_selector && !draft.sourceTenant)
    || (selected.environment && !draft.environment)
    || (selected.severity && !draft.severity)
    || (selected.risk_level && !draft.riskLevel)) {
    throw new Error('Fill every required policy selector.');
  }
  const source: Record<string, unknown> = {
    ...(draft.predecessor?.source ?? {}),
    channel: 'grant.web',
    ...(draft.sourceTenant ? { tenant_id: draft.sourceTenant } : {}),
    ...(draft.environment ? { environment: draft.environment } : {}),
    ...(draft.severity ? { severity: draft.severity } : {}),
    ...(draft.riskLevel ? { risk_level: draft.riskLevel } : {}),
  };
  return {
    payload: {
      external_id: draft.external, profile_id: selected.id,
      title: draft.title,
      action: { kind: selected.action_kind, target: draft.target,
        parameters: params as Record<string, unknown> },
      reason: draft.reason,
      source,
      ...(draft.predecessorId ? { predecessor_id: draft.predecessorId } : {}),
    },
    profileName: selected.name,
    profileVersion: selected.version,
    // Includes the exact user-authored JSON text and the loaded policy and
    // predecessor snapshots; even edits that preserve parsed JSON semantics
    // force a new explicit review.
    draftSignature: JSON.stringify(draft),
  };
}

export function isCurrentRequestCreationReview(
  reviewed: RequestCreationReview | null, draft: NewRequestDraft,
): boolean {
  if (!reviewed) return false;
  try {
    const current = prepareRequestCreationReview(draft);
    return reviewed.draftSignature === current.draftSignature
      && JSON.stringify(reviewed.payload) === JSON.stringify(current.payload);
  } catch {
    return false;
  }
}

/** A reviewed request is the only allowed POST payload. No readback, retry or
 * navigation is performed here. The server response is authoritative.
 */
export async function submitReviewedRequestCreation<T>(
  reviewed: RequestCreationReview | null,
  draft: NewRequestDraft,
  createOnce: (payload: RequestCreationPayload) => Promise<T>,
): Promise<T> {
  if (!reviewed || !isCurrentRequestCreationReview(reviewed, draft)) {
    throw new Error('REQUEST_REVIEW_CHANGED');
  }
  return await createOnce(reviewed.payload);
}

/** Compare the security- and task-relevant policy facts in fixed field order.
 * A read-only client check reduces accidental stale human review, but the
 * server still owns policy resolution and atomic authorization at POST.
 */
function policyReviewKey(row: Profile): string {
  return JSON.stringify([
    row.id, row.version_id, row.version, row.active_version ?? null,
    row.active_version_id ?? null, row.name, row.lifecycle, row.enabled,
    row.integration_id, row.action_kind, row.approver_id, row.approval_mode,
    row.approver_group_id, row.approvals_required, row.tenant ?? null,
    row.tenant_selector, row.environment, row.severity, row.risk_level,
    row.denial_reason_required ?? null, row.verification_mode ?? null,
    row.decision_link_ttl_seconds ?? null, row.email_template_id,
    row.notification_template_set_id ?? null,
    row.deadline_seconds, row.reminder_seconds, row.max_reminders, row.grant_seconds,
  ]);
}

/** Only compare the stable predecessor facts used by replacement validation.
 * Do not treat incidental audit history/presentation changes as authorization.
 */
function predecessorReviewKey(row: RequestRow): string {
  return JSON.stringify([
    row.id, row.revision, row.state, row.collaboration_state,
    row.requester_id, row.integration_id, row.profile_id,
    row.action_hash, row.source,
  ]);
}

/** Finish a reviewed request only after a new role-scoped, read-only GET.
 * The GET is mandatory for human confirmation freshness; it is NOT an
 * atomic server CAS and never substitutes for server-side validation.
 *
 * No request creation occurs on any failed/changed GET. A successful GET
 * is followed by exactly ONE normal creation POST using frozen payload.
 * An ambiguous POST is propagated, never retried.
 */
export async function submitReviewedRequestCreationWithFreshRead<T>(
  reviewed: RequestCreationReview | null,
  draft: NewRequestDraft,
  readCurrent: () => Promise<{
    policy: Profile | null | undefined;
    predecessor: RequestRow | null | undefined;
  }>,
  createOnce: (payload: RequestCreationPayload) => Promise<T>,
): Promise<T> {
  if (!reviewed || !isCurrentRequestCreationReview(reviewed, draft)) {
    throw new Error('REQUEST_REVIEW_CHANGED');
  }
  const current = await readCurrent();
  if (!draft.profile || !current.policy || !current.policy.enabled
    || current.policy.lifecycle !== 'ACTIVE'
    || policyReviewKey(current.policy) !== policyReviewKey(draft.profile)) {
    throw new Error('PROFILE_CHANGED_REVIEW_REQUIRED');
  }
  if (draft.predecessorId && (
    !draft.predecessor || !current.predecessor
    || predecessorReviewKey(current.predecessor)
      !== predecessorReviewKey(draft.predecessor)
    || current.predecessor.id !== draft.predecessorId
  )) {
    throw new Error('PREDECESSOR_CHANGED_REVIEW_REQUIRED');
  }
  return await submitReviewedRequestCreation(reviewed, draft, createOnce);
}

/** No POST or navigation happens here; caller retains the one-submit guard. */
export function RequestCreationConfirmation({
  reviewed, draft, busy, onConfirm, onBack,
}: {
  reviewed: RequestCreationReview | null;
  draft: NewRequestDraft;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  if (!reviewed || !isCurrentRequestCreationReview(reviewed, draft)) return null;
  const { payload } = reviewed;
  return (
    <Alert tone="warning" title="Review approval request">
      <p>Create only an approval request; no external execution or approval occurs at this step.</p>
      <dl className="grant-facts">
        <dt>Request title</dt><dd>{payload.title}</dd>
        <dt>Approval profile</dt><dd>{reviewed.profileName} · {payload.profile_id}</dd>
        <dt>Policy version (loaded preview)</dt><dd>{reviewed.profileVersion}</dd>
        <dt>Operation</dt><dd>{payload.action.kind}</dd>
        <dt>Target</dt><dd>{payload.action.target}</dd>
        <dt>External request ID</dt><dd>{payload.external_id}</dd>
        <dt>Reason</dt><dd>{payload.reason || 'Not provided'}</dd>
        {payload.predecessor_id && (
          <><dt>Linked predecessor</dt><dd>{payload.predecessor_id}</dd></>
        )}
      </dl>
      <p><strong>Action parameters</strong></p>
      <pre>{JSON.stringify(payload.action.parameters, null, 2)}</pre>
      <details>
        <summary>Source selectors and context</summary>
        <pre>{JSON.stringify(payload.source, null, 2)}</pre>
      </details>
      <p>The server applies the current active policy at creation. This preview never
        approves the request or authorizes the connected system to execute.</p>
      <Button disabled={busy} onClick={onConfirm}>Confirm create request</Button>
      <Button disabled={busy} variant="ghost" onClick={onBack}>Edit request</Button>
    </Alert>
  );
}
