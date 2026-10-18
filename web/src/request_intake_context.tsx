import { Alert, Button } from '@datarelay-labs/foundation';
import type { Profile } from './types';

/** An enabled DRAFT or TESTING policy is NOT a usable NewRequest policy.
 * Request creation remains authorized and resolved only by the backend.
 */
export function eligibleIntakeProfiles(profiles: readonly Profile[]): Profile[] {
  return profiles.filter((policy) => policy.enabled && policy.lifecycle === 'ACTIVE')
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Task-first read-only approval context. The requester consumes the
 * administrator-published routing and notification configuration; no
 * approver, template or verification authority is editable here.
 */
export function NewRequestPolicyContext({ profile }: { profile: Profile | null }) {
  return (
    <section aria-label="Assigned approval plan" className="grant-stack">
      {!profile ? (
        <p role="status">Choose a request type to see the administrator-assigned approval plan,
          notification behavior, timing and verification requirements.</p>
      ) : !profile.enabled || profile.lifecycle !== 'ACTIVE' ? (
        <Alert tone="warning" title="Request type unavailable">
          This request type is not currently active and enabled. Select an
          available request type before continuing.
        </Alert>
      ) : (
        <>
          <p>
            <strong>{profile.name}</strong>
            {' · '}Published request type
          </p>
          <dl className="grant-facts">
            <dt>Operation</dt><dd>{profile.action_kind}</dd>
            <dt>Approval rule</dt><dd>{profile.approval_mode}</dd>
            <dt>Approver selection</dt><dd>{profile.approver_group_id
              ? 'Administrator-assigned group' : 'Administrator-assigned approver'}</dd>
            <dt>Required approvals</dt>
            <dd>{profile.approvals_required !== null
              && Number.isSafeInteger(profile.approvals_required)
              && profile.approvals_required > 0
              ? profile.approvals_required + ' required'
              : 'Assigned seats resolved by server'}</dd>
            <dt>Notification</dt><dd>{profile.email_template_name
              ?? (profile.notification_template_set_id || profile.email_template_id
                ? 'Administrator-selected template' : 'System default notification')}</dd>
            <dt>Decision deadline</dt><dd>{profile.deadline_seconds} seconds from creation</dd>
            <dt>Execution grant validity</dt>
            <dd>{profile.grant_seconds} seconds, only after separate human approval</dd>
            <dt>Decision verification</dt>
            <dd>{profile.verification_mode && profile.verification_mode !== 'INHERIT'
              ? profile.verification_mode
              : 'Server applies policy and integration requirements'}</dd>
          </dl>
          <details>
            <summary>Technical policy and integration reference</summary>
            <dl className="grant-facts">
              <dt>Policy reference</dt><dd><code>{profile.id}</code></dd>
              <dt>Policy version</dt><dd>{profile.version}</dd>
              <dt>Policy version reference</dt><dd><code>{profile.version_id}</code></dd>
              <dt>Integration reference</dt><dd><code>{profile.integration_id}</code></dd>
            </dl>
          </details>
          <p>These approval settings were published by an administrator. The requester
            supplies request-specific data only; Grant rechecks the current policy on
            confirmation. This preview does not approve or execute any action.</p>
        </>
      )}
    </section>
  );
}

/** Empty/loading source-policy states are informational. Only the backend
 * resolves eligible policies; an admin shortcut never activates a policy.
 */
export function RequestPolicyAvailability({
  loaded, hasAvailablePolicies, isAdmin, onManagePolicies, loadFailed = false,
}: {
  loaded: boolean;
  hasAvailablePolicies: boolean;
  isAdmin: boolean;
  onManagePolicies: () => void;
  loadFailed?: boolean;
}) {
  if (!loaded) {
    return loadFailed ? null : <p role="status">Loading request types…</p>;
  }
  if (hasAvailablePolicies) return null;
  return (
    <Alert tone="warning" title="No active request type">
      <p>There is no active request type available for a new request.</p>
      {isAdmin ? (
        <div className="grant-actions">
          <Button type="button" variant="secondary" onClick={onManagePolicies}>
            Open Approval Policies
          </Button>
        </div>
      ) : (
        <p>Ask an administrator to publish and activate a request type in Approval Policies
          before creating a request.</p>
      )}
    </Alert>
  );
}

/** An uncertain request creation may already have succeeded. Offer an
 * independent read-only reconciliation path instead of another POST.
 */
export function RequestCreationReconciliationNotice({
  openMyRequests,
}: {
  openMyRequests: () => void;
}) {
  return (
    <Alert tone="warning" title="Request creation outcome needs reconciliation">
      A request creation POST was attempted. Its response may be missing,
      so this confirmation will not retry it. Inspect your submitted requests
      before starting a different request.
      <div className="grant-actions">
        <Button variant="secondary" onClick={openMyRequests}>
          Open My requests
        </Button>
      </div>
    </Alert>
  );
}
