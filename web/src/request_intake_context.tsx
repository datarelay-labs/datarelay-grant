import { Alert, Button } from '@datarelay-labs/foundation';
import type { Profile } from './types';

/** An enabled DRAFT or TESTING policy is NOT a usable NewRequest policy.
 * Request creation remains authorized and resolved only by the backend.
 */
export function eligibleIntakeProfiles(profiles: readonly Profile[]): Profile[] {
  return profiles.filter((policy) => policy.enabled && policy.lifecycle === 'ACTIVE')
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Task-first read-only policy context. Do not invent reviewer identities,
 * verification guarantees, execution effects or human decision authority.
 */
export function NewRequestPolicyContext({ profile }: { profile: Profile | null }) {
  return (
    <section aria-label="Selected approval policy" className="grant-stack">
      {!profile ? (
        <p role="status">Choose an active policy to see the requested operation,
          approval rule, decision timing and verification requirements.</p>
      ) : !profile.enabled || profile.lifecycle !== 'ACTIVE' ? (
        <Alert tone="warning" title="Policy unavailable">
          This policy is not currently active and enabled for creating a
          request. Select an available active policy before continuing.
        </Alert>
      ) : (
        <>
          <p>
            <strong>{profile.name}</strong>
            {' · '}Active version {profile.version}
          </p>
          <dl className="grant-facts">
            <dt>Operation</dt><dd>{profile.action_kind}</dd>
            <dt>Approval rule</dt><dd>{profile.approval_mode}</dd>
            <dt>Required approvals</dt>
            <dd>{profile.approvals_required !== null
              && Number.isSafeInteger(profile.approvals_required)
              && profile.approvals_required > 0
              ? profile.approvals_required + ' required'
              : 'Assigned seats resolved by server'}</dd>
            <dt>Decision deadline</dt><dd>{profile.deadline_seconds} seconds from creation</dd>
            <dt>Execution grant validity</dt>
            <dd>{profile.grant_seconds} seconds, only after separate human approval</dd>
            <dt>Decision verification</dt>
            <dd>{profile.verification_mode && profile.verification_mode !== 'INHERIT'
              ? profile.verification_mode
              : 'Server applies policy and integration requirements'}</dd>
          </dl>
          <details>
            <summary>Policy version and integration reference</summary>
            <dl className="grant-facts">
              <dt>Policy reference</dt><dd><code>{profile.id}</code></dd>
              <dt>Policy version reference</dt><dd><code>{profile.version_id}</code></dd>
              <dt>Integration reference</dt><dd><code>{profile.integration_id}</code></dd>
            </dl>
          </details>
          <p>The server assigns the authorized approvers and rechecks the
            current policy when this request is confirmed. This preview
            does not approve or execute any action.</p>
        </>
      )}
    </section>
  );
}


/** Empty/loading source-policy states are informational. Only the backend
 * resolves eligible policies; an admin shortcut never activates a policy. */
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
    return loadFailed ? null : <p role="status">Loading approval policies…</p>;
  }
  if (hasAvailablePolicies) return null;
  return (
    <Alert tone="warning" title="No active approval policy">
      <p>There is no active, enabled policy available for a new request.</p>
      {isAdmin ? (
        <div className="grant-actions">
          <Button type="button" variant="secondary" onClick={onManagePolicies}>
            Open Approval Policies
          </Button>
        </div>
      ) : (
        <p>Ask an administrator to activate a policy in Approval Policies
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
