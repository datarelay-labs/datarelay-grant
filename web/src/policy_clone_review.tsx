import { Alert, Button } from '@datarelay-labs/foundation';
import type { Profile } from './types';

/** Snapshot of a human-reviewed source policy, not a clone grant or an
 * optimistic-concurrency token accepted by the existing backend.
 */
export type PolicyCloneIntent = {
  policyId: string;
  versionId: string;
  version: number;
  name: string;
  lifecycle: Profile['lifecycle'];
  activeVersion: number | null;
  activeVersionId: string | null;
  actionKind: string;
  integrationId: string;
  approverId: string;
  approvalMode: string;
  approverGroupId: string | null;
  approvalsRequired: number | null;
  emailTemplateId: string | null;
  tenantSelector: string;
  environment: string;
  severity: string;
  riskLevel: string;
  verificationMode: Profile['verification_mode'];
  denialReasonRequired: Profile['denial_reason_required'];
  updatedAt: Profile['updated_at'];
};

export function createPolicyCloneReview(row: Profile): PolicyCloneIntent {
  if (!row.id || !row.version_id || !Number.isSafeInteger(row.version) || row.version < 1) {
    throw new Error('POLICY_SOURCE_VERSION_UNAVAILABLE');
  }
  return {
    policyId: row.id,
    versionId: row.version_id,
    version: row.version,
    name: row.name,
    lifecycle: row.lifecycle,
    activeVersion: row.active_version ?? null,
    activeVersionId: row.active_version_id ?? null,
    actionKind: row.action_kind,
    integrationId: row.integration_id,
    approverId: row.approver_id,
    approvalMode: row.approval_mode,
    approverGroupId: row.approver_group_id,
    approvalsRequired: row.approvals_required,
    emailTemplateId: row.email_template_id,
    tenantSelector: row.tenant_selector,
    environment: row.environment,
    severity: row.severity,
    riskLevel: row.risk_level,
    verificationMode: row.verification_mode,
    denialReasonRequired: row.denial_reason_required,
    updatedAt: row.updated_at,
  };
}

/** UI freshness guard only; not a substitute for a server-side atomic CAS.
 * The server retains authoritative RBAC, latest-clone source and Draft state.
 */
export function canConfirmPolicyClone(
  intent: PolicyCloneIntent | null,
  source: Profile | null | undefined,
): boolean {
  if (!intent || !source) return false;
  try {
    const current = createPolicyCloneReview(source);
    return JSON.stringify(current) === JSON.stringify(intent);
  } catch {
    return false;
  }
}

/** A fresh read precedes the SINGLE durable clone POST. Never automatically
 * retry an ambiguous clone response or stage a source-version mismatch.
 */
export async function submitReviewedPolicyClone<T>(
  intent: PolicyCloneIntent | null,
  readOnlyCurrent: () => Promise<Profile | null | undefined>,
  postCloneOnce: (sourcePolicyId: string) => Promise<T>,
): Promise<T> {
  if (!intent) throw new Error('POLICY_CLONE_REVIEW_REQUIRED');
  const fresh = await readOnlyCurrent();
  if (!canConfirmPolicyClone(intent, fresh)) {
    throw new Error('POLICY_CHANGED_REVIEW_REQUIRED');
  }
  return await postCloneOnce(intent.policyId);
}

export function PolicyCloneConfirmation({
  intent, source, busy, onCancel, onConfirm,
}: {
  intent: PolicyCloneIntent | null;
  source: Profile | null | undefined;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!intent) return null;
  const valid = canConfirmPolicyClone(intent, source);
  return (
    <Alert tone="warning" title="Confirm policy clone">
      <p><strong>{intent.name}</strong> · v{intent.version} · {intent.lifecycle}</p>
      <dl className="grant-facts">
        <dt>Source policy</dt><dd>{intent.policyId}</dd>
        <dt>Active version</dt><dd>{intent.activeVersion === null
          ? 'No active version reported' : 'v' + intent.activeVersion}</dd>
        <dt>Action kind</dt><dd>{intent.actionKind}</dd>
        <dt>Integration</dt><dd>{intent.integrationId}</dd>
        <dt>Approval mode</dt><dd>{intent.approvalMode}</dd>
        <dt>Verification requirement</dt><dd>{
          intent.verificationMode?.replaceAll('_', ' ') ?? 'Not reported'
        }</dd>
        <dt>Denial reason</dt><dd>{intent.denialReasonRequired === undefined
          ? 'Not reported' : intent.denialReasonRequired ? 'Required' : 'Optional'}</dd>
      </dl>
      <p><strong>New Draft only.</strong> This creates a separate policy copy
        for editing; it is not activated and does not change current requests
        or authorize external execution.</p>
      {!valid && <p role="alert">Policy changed since review or is unavailable.
        Cancel and review the current version again.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || !valid} onClick={onConfirm}>Confirm clone draft</Button>
      </div>
    </Alert>
  );
}
