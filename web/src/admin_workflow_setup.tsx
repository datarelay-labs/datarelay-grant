import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card } from '@datarelay-labs/foundation';
import { api } from './api';
import { AdminFirstRunSetup } from './admin_first_run_setup';
import type {
  ApproverGroup, Integration, NotificationTemplateSet, Profile,
} from './types';
import './workflow-guidance.css';

type Navigate = (path: string) => void;

type AdminSetupRows = {
  accounts: readonly { status?: string }[];
  groups: readonly { enabled: boolean }[];
  integrations: readonly { id: string }[];
  templates: readonly { enabled: boolean; published_revision?: number | null }[];
  policies: readonly { lifecycle: string; active_version?: number | null }[];
};

export type AdminSetupFacts = {
  enabledAccounts: number;
  enabledApproverGroups: number;
  registeredConnections: number;
  savedTemplateSets: number;
  publishedTemplateSets: number;
  savedPolicies: number;
  activePolicies: number;
};

/** Recorded counts, not proof of identity, verified connectivity or delivery.
 * A saved template draft never counts as a published, enabled template set.
 */
export function projectAdminSetupFacts(rows: AdminSetupRows): AdminSetupFacts {
  return {
    enabledAccounts: rows.accounts.filter(x => x.status === 'enabled').length,
    enabledApproverGroups: rows.groups.filter(x => x.enabled).length,
    registeredConnections: rows.integrations.length,
    savedTemplateSets: rows.templates.length,
    publishedTemplateSets: rows.templates.filter(x =>
      x.enabled && (x.published_revision ?? 0) > 0).length,
    savedPolicies: rows.policies.length,
    activePolicies: rows.policies.filter(x =>
      x.lifecycle === 'ACTIVE' || (x.active_version ?? 0) > 0).length,
  };
}

export function AdminWorkflowSetup({ navigate }: { navigate: Navigate }) {
  const [facts, setFacts] = useState<AdminSetupFacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const readEpoch = useRef(0);

  function refresh() {
    const epoch = ++readEpoch.current;
    setFacts(null);
    setFailed(false);
    setLoading(true);
    void Promise.all([
      api<{ status: string }[]>('/admin/users'),
      api<ApproverGroup[]>('/approver-groups'),
      api<Integration[]>('/integrations'),
      api<NotificationTemplateSet[]>('/notification-template-sets'),
      api<Profile[]>('/profiles'),
    ]).then(([accounts, groups, integrations, templates, policies]) => {
      if (![accounts, groups, integrations, templates, policies]
        .every(Array.isArray)) throw new Error('INVALID_ADMIN_SETUP_READ');
      if (readEpoch.current !== epoch) return;
      setFacts(projectAdminSetupFacts({
        accounts, groups, integrations, templates, policies,
      }));
    }).catch(() => {
      if (readEpoch.current !== epoch) return;
      setFacts(null);
      setFailed(true);
    }).finally(() => {
      if (readEpoch.current === epoch) setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
    return () => { readEpoch.current++; };
  }, []);

  return <div className="grant-stack">
    <section className="grant-home-intro" aria-labelledby="grant-admin-workflow-title">
      <div>
        <p className="grant-eyebrow">Approval administration</p>
        <h2 id="grant-admin-workflow-title">Configure once, reuse on every request</h2>
        <p>Administrators own approvers, integrations, notification templates and approval
          policies. Requesters consume the active configuration without changing approval
          routing or notification authority.</p>
      </div>
      <Button onClick={() => navigate('/requests/new')}>Open New request</Button>
    </section>

    {failed && <Alert tone="warning" title="Setup status unavailable">
      Unable to check all saved administrator prerequisites. No zero or ready status is
      inferred. Retry the current read before using these counts to plan your next step.
    </Alert>}
    {!facts && !failed && <p role="status">
      Checking saved setup and current published policy state…
    </p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={loading} onClick={refresh}>
        {failed ? 'Retry setup status' : 'Refresh setup status'}
      </Button>
    </div>

    <AdminFirstRunSetup
      loaded={facts !== null}
      enabledAccounts={facts?.enabledAccounts ?? 0}
      enabledApproverGroups={facts?.enabledApproverGroups ?? 0}
      registeredConnections={facts?.registeredConnections ?? 0}
      savedTemplateSets={facts?.savedTemplateSets ?? 0}
      publishedTemplateSets={facts?.publishedTemplateSets ?? 0}
      savedPolicies={facts?.savedPolicies ?? 0}
      activePolicies={facts?.activePolicies ?? 0}
      createPolicyActionLabel="Open approval policies"
      policyListHref="/profiles"
      onCreatePolicy={() => navigate('/profiles')}
    />

    <Card title="What requesters see"
      description="The requester workflow intentionally hides administrator-owned choices.">
      <ol className="grant-admin-setup-steps grant-admin-setup-steps--requester"
        aria-label="Requester approval workflow">
        <li>
          <span className="grant-admin-setup-num" aria-hidden="true">01</span>
          <div className="grant-admin-setup-step">
            <strong>Choose request type</strong>
            <small>Select an active administrator-published request type.</small>
          </div>
        </li>
        <li>
          <span className="grant-admin-setup-num" aria-hidden="true">02</span>
          <div className="grant-admin-setup-step">
            <strong>Enter request details</strong>
            <small>Provide the target, reason and only the fields required by that request type.</small>
          </div>
        </li>
        <li>
          <span className="grant-admin-setup-num" aria-hidden="true">03</span>
          <div className="grant-admin-setup-step">
            <strong>Review and submit</strong>
            <small>Grant applies the administrator-assigned approver plan, notification template,
              verification requirements and deadline. These are read-only to the requester.</small>
          </div>
        </li>
      </ol>
    </Card>
  </div>;
}
