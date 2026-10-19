import './workflow-guidance.css';

export type AdminFirstRunSetupProps = {
  loaded: boolean;
  registeredConnections: number;
  enabledAccounts: number;
  enabledApproverGroups: number;
  savedTemplateSets: number;
  publishedTemplateSets: number;
  savedPolicies: number;
  activePolicies: number;
  onCreatePolicy: () => void;
  createPolicyActionLabel?: string;
  policyListHref?: string;
};

export function AdminFirstRunSetup({
  loaded, registeredConnections, enabledAccounts, enabledApproverGroups,
  savedTemplateSets, publishedTemplateSets, savedPolicies, activePolicies,
  onCreatePolicy, createPolicyActionLabel = 'Create draft policy',
  policyListHref = '#grant-policy-list',
}: AdminFirstRunSetupProps) {
  const status = (count: number, plural: string, singular: string) =>
    loaded ? String(count) + ' ' + (count === 1 ? singular : plural) : 'Checking saved setup';
  return <section className="grant-admin-setup" aria-labelledby="grant-admin-setup-title">
    <div className="grant-admin-setup-title">
      <span className="grant-guided-eyebrow">Administrator first steps</span>
      <h3 id="grant-admin-setup-title">{loaded && activePolicies > 0
        ? 'Manage existing approval workflows'
        : 'Set up your first approval workflow'}</h3>
      <p>Configure reusable approval controls first. Requesters use the active configuration
        without choosing approvers, mail templates or verification rules.</p>
    </div>
    <ol className="grant-admin-setup-steps" aria-label="Approval workflow setup order">
      <li><span className="grant-admin-setup-num" aria-hidden="true">01</span>
        <div className="grant-admin-setup-step">
          <strong>Create approver accounts</strong>
          <small>{status(enabledAccounts, 'enabled accounts', 'enabled account')} — email and role are administrator-owned</small>
          <a href="/system?view=accounts">Open user management <span aria-hidden="true">→</span></a>
        </div>
      </li>
      <li><span className="grant-admin-setup-num" aria-hidden="true">02</span>
        <div className="grant-admin-setup-step">
          <strong>Create approver groups</strong>
          <small>{status(enabledApproverGroups, 'enabled approver groups', 'enabled approver group')} — reusable routing groups</small>
          <a href="/approvers">Manage approver groups <span aria-hidden="true">→</span></a>
        </div>
      </li>
      <li><span className="grant-admin-setup-num" aria-hidden="true">03</span>
        <div className="grant-admin-setup-step">
          <strong>Register integrations</strong>
          <small>{status(registeredConnections, 'registered records', 'registered record')} — not a verified connection</small>
          <a href="/integrations">Open integrations <span aria-hidden="true">→</span></a>
        </div>
      </li>
      <li><span className="grant-admin-setup-num" aria-hidden="true">04</span>
        <div className="grant-admin-setup-step">
          <strong>Create notification templates</strong>
          <small>{status(savedTemplateSets, 'template sets', 'template set')}
            {' · '}{status(publishedTemplateSets, 'enabled published template sets', 'enabled published template set')}
            {' — '}save, preview, then Review &amp; publish and Confirm publication before policy testing. A saved draft is not published.</small>
          <a href="/notifications">Manage notification templates <span aria-hidden="true">→</span></a>
        </div>
      </li>
      <li><span className="grant-admin-setup-num" aria-hidden="true">05</span>
        <div className="grant-admin-setup-step">
          <strong>Create a Draft policy</strong>
          <small>{status(savedPolicies, 'saved policies', 'saved policy')} — drafts do not authorize requests; bind request type, routing and notifications</small>
          <button type="button" disabled={!loaded} onClick={onCreatePolicy}>{createPolicyActionLabel} <span aria-hidden="true">→</span></button>
        </div>
      </li>
      <li><span className="grant-admin-setup-num" aria-hidden="true">06</span>
        <div className="grant-admin-setup-step">
          <strong>Test and activate</strong>
          <small>{status(activePolicies, 'active policies', 'active policy')} — activation requires separate confirmation</small>
          <a href={policyListHref}>View policy list <span aria-hidden="true">↓</span></a>
        </div>
      </li>
      <li><span className="grant-admin-setup-num" aria-hidden="true">07</span>
        <div className="grant-admin-setup-step">
          <strong>Create the first request</strong>
          <small>Use an active request type. The requester sees the assigned approval plan as read-only.</small>
          <a href="/requests/new">Open New request <span aria-hidden="true">→</span></a>
        </div>
      </li>
    </ol>
    <p className="grant-admin-setup-note">No business action is executed by these setup steps.
      A requester creates a separate request after an approval policy is active.</p>
  </section>;
}
