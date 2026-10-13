import './workflow-guidance.css';

export type AdminFirstRunSetupProps = {
  loaded: boolean;
  registeredConnections: number;
  enabledAccounts: number;
  savedPolicies: number;
  activePolicies: number;
  onCreatePolicy: () => void;
};

/** Visual task order over data already loaded by the authorized Policies page.
 * Never converts registered connections or accounts into verified readiness. */
export function AdminFirstRunSetup({
  loaded, registeredConnections, enabledAccounts,
  savedPolicies, activePolicies, onCreatePolicy,
}: AdminFirstRunSetupProps) {
  const status = (count: number, kind: string, singular: string) =>
    loaded
      ? `${count} ${count === 1 ? singular : kind}`
      : 'Checking saved setup';
  return <section className="grant-admin-setup" aria-labelledby="grant-admin-setup-title">
    <div className="grant-admin-setup-title">
      <span className="grant-guided-eyebrow">Administrator first steps</span>
      <h3 id="grant-admin-setup-title">Set up your first approval workflow</h3>
      <p>Follow the steps in order. Saving a policy is not the same as activating it.</p>
    </div>
    <ol className="grant-admin-setup-steps" aria-label="Approval workflow setup order">
      <li>
        <span className="grant-admin-setup-num" aria-hidden="true">01</span>
        <div className="grant-admin-setup-step">
          <strong>Register a connection</strong>
          <small>{status(registeredConnections, 'registered records', 'registered record')} — not a verified connection</small>
          <a href="/integrations">Open integrations <span aria-hidden="true">→</span></a>
        </div>
      </li>
      <li>
        <span className="grant-admin-setup-num" aria-hidden="true">02</span>
        <div className="grant-admin-setup-step">
          <strong>Choose approvers</strong>
          <small>{status(enabledAccounts, 'enabled accounts', 'enabled account')} — assignments are set in the policy</small>
          <a href="/approvers">Manage approvers <span aria-hidden="true">→</span></a>
        </div>
      </li>
      <li>
        <span className="grant-admin-setup-num" aria-hidden="true">03</span>
        <div className="grant-admin-setup-step">
          <strong>Create a Draft policy</strong>
          <small>{status(savedPolicies, 'saved policies', 'saved policy')} — drafts do not authorize requests</small>
          <button type="button" onClick={onCreatePolicy}>Create draft policy <span aria-hidden="true">→</span></button>
        </div>
      </li>
      <li>
        <span className="grant-admin-setup-num" aria-hidden="true">04</span>
        <div className="grant-admin-setup-step">
          <strong>Test and activate</strong>
          <small>{status(activePolicies, 'active policies', 'active policy')} — testing and activation require separate confirmation</small>
          <a href="#grant-policy-list">View policy list <span aria-hidden="true">↓</span></a>
        </div>
      </li>
    </ol>
    <p className="grant-admin-setup-note">No business action is executed by these setup steps. A requester creates a separate request after an approved policy is active.</p>
  </section>;
}
