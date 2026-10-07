import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask, when } from './common';
import type {
  ApproverGroup,
  Integration,
  NotificationTemplateSet,
  PolicyHistory,
  PolicyPreview,
  Profile,
} from './types';

type Sample = {
  integration_id: string;
  action_kind: string;
  title: string;
  target: string;
  reason: string;
  tenant: string;
  environment: string;
  severity: string;
  risk_level: string;
};

type PolicyView = 'list' | 'details' | 'preview' | 'history';

const initialSample: Sample = {
  integration_id: '',
  action_kind: '',
  title: 'Sample approval request',
  target: 'sample-target',
  reason: 'Preview only',
  tenant: '',
  environment: '',
  severity: '',
  risk_level: '',
};

export function Profiles() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [users, setUsers] = useState<AccountProjection[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplateSet[]>([]);
  const [view, setView] = useState<PolicyView>('list');
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [integration, setIntegration] = useState('');
  const [approver, setApprover] = useState('');
  const [approvalMode, setApprovalMode] = useState('SINGLE');
  const [approverGroup, setApproverGroup] = useState('');
  const [approvalsRequired, setApprovalsRequired] = useState('2');
  const [groups, setGroups] = useState<ApproverGroup[]>([]);
  const [action, setAction] = useState('');
  const [template, setTemplate] = useState('');
  const [deadline, setDeadline] = useState('86400');
  const [reminder, setReminder] = useState('3600');
  const [count, setCount] = useState('3');
  const [validity, setValidity] = useState('900');
  const [tenant, setTenant] = useState('');
  const [environment, setEnvironment] = useState('');
  const [severity, setSeverity] = useState('');
  const [risk, setRisk] = useState('');
  const [history, setHistory] = useState<PolicyHistory | null>(null);
  const [preview, setPreview] = useState<PolicyPreview | null>(null);
  const [sample, setSample] = useState<Sample>(initialSample);
  const task = useTask();

  const load = async () => {
    const [policies, integrationRows, accounts, templateSets, approverGroups] = await Promise.all([
      api<Profile[]>('/profiles'),
      api<Integration[]>('/integrations'),
      api<AccountProjection[]>('/admin/users'),
      api<NotificationTemplateSet[]>('/notification-template-sets'),
      api<ApproverGroup[]>('/approver-groups'),
    ]);
    setRows(policies);
    setIntegrations(integrationRows);
    setUsers(accounts);
    setTemplates(templateSets);
    setGroups(approverGroups);
  };

  useEffect(() => {
    void task.run(load);
  }, []);

  function resetEditor() {
    setEditing('');
    setName('');
    setIntegration('');
    setApprover('');
    setApprovalMode('SINGLE');
    setApproverGroup('');
    setApprovalsRequired('2');
    setAction('');
    setTemplate('');
    setDeadline('86400');
    setReminder('3600');
    setCount('3');
    setValidity('900');
    setTenant('');
    setEnvironment('');
    setSeverity('');
    setRisk('');
    setHistory(null);
    setPreview(null);
    setSample(initialSample);
  }

  function edit(row: Profile) {
    setEditing(row.id);
    setName(row.name);
    setIntegration(row.integration_id);
    setApprover(row.approver_id);
    setApprovalMode(row.approval_mode ?? 'SINGLE');
    setApproverGroup(row.approver_group_id ?? '');
    setApprovalsRequired(String(row.approvals_required ?? 2));
    setAction(row.action_kind);
    setTemplate(row.email_template_id ?? '');
    setDeadline(String(row.deadline_seconds));
    setReminder(String(row.reminder_seconds));
    setCount(String(row.max_reminders));
    setValidity(String(row.grant_seconds));
    setTenant(row.tenant_selector);
    setEnvironment(row.environment);
    setSeverity(row.severity);
    setRisk(row.risk_level);
    setSample((current) => ({
      ...current,
      integration_id: row.integration_id,
      action_kind: row.action_kind,
      tenant: row.tenant_selector,
      environment: row.environment,
      severity: row.severity,
      risk_level: row.risk_level,
    }));
    setPreview(null);
  }

  function startCreate() {
    resetEditor();
    setView('details');
  }

  function openPolicy(row: Profile) {
    edit(row);
    setView('details');
  }

  async function save() {
    const body = {
      name,
      integration_id: integration,
      approver_id: approver,
      approval_mode: approvalMode,
      approver_group_id: approvalMode === 'SINGLE' ? null : approverGroup,
      approvals_required: approvalMode === 'N_OF_M' ? Number(approvalsRequired) : null,
      action_kind: action,
      email_template_id: template || null,
      deadline_seconds: Number(deadline),
      reminder_seconds: Number(reminder),
      max_reminders: Number(count),
      grant_seconds: Number(validity),
      tenant_selector: tenant,
      environment,
      severity,
      risk_level: risk,
    };
    const saved = await api<Profile>(
      editing ? '/profiles/' + editing : '/profiles',
      editing ? 'PUT' : 'POST',
      body,
    );
    setEditing(saved.id);
    setSample((current) => ({
      ...current,
      integration_id: saved.integration_id,
      action_kind: saved.action_kind,
    }));
    await load();
    setView('details');
    task.setNotice(
      'Draft saved. It is not live until it passes Testing and is explicitly activated.',
    );
  }

  async function transition(id: string, actionName: 'test' | 'activate' | 'disable') {
    const updated = await api<Profile>('/profiles/' + id + '/' + actionName, 'POST');
    await load();
    if (editing === id) edit(updated);
    task.setNotice(
      actionName === 'test'
        ? 'Policy moved to Testing. Use isolated test before activation.'
        : actionName === 'activate'
          ? 'Policy activated. Existing requests retain their original version snapshot.'
          : 'Active policy version disabled.',
    );
  }

  async function clone(id: string) {
    const cloned = await api<Profile>('/profiles/' + id + '/clone', 'POST');
    await load();
    edit(cloned);
    setView('details');
    task.setNotice('Policy cloned as a new Draft.');
  }

  async function showHistory() {
    if (!editing) return;
    setHistory(await api<PolicyHistory>('/profiles/' + editing + '/history'));
    setView('history');
  }

  function sampleBody() {
    return {
      integration_id: sample.integration_id || integration,
      action_kind: sample.action_kind || action,
      title: sample.title,
      target: sample.target,
      reason: sample.reason,
      source: {
        tenant_id: sample.tenant,
        environment: sample.environment,
        severity: sample.severity,
        risk_level: sample.risk_level,
      },
    };
  }

  async function previewActive() {
    setPreview(await api<PolicyPreview>('/profiles/preview', 'POST', sampleBody()));
  }

  async function runIsolated() {
    if (!editing) return;
    setPreview(
      await api<PolicyPreview>('/profiles/' + editing + '/test-request', 'POST', sampleBody()),
    );
  }

  const selected = rows.find((row) => row.id === editing);

  if (view === 'list') {
    return (
      <div className="grant-stack">
        {task.feedback}
        <section className="grant-page-heading" aria-labelledby="grant-policies-title">
          <div>
            <p className="grant-eyebrow">Configuration</p>
            <h2 id="grant-policies-title">Approval policies</h2>
            <p>
              Policies are configured as drafts and become live only after explicit testing and
              activation.
            </p>
          </div>
          <Button onClick={startCreate}>Create policy</Button>
        </section>

        <Card
          title="Policies"
          description="Scan policy status and scope first. Open a policy only when you need to configure or test it."
        >
          <div className="grant-table-scroll">
            <table className="grant-table grant-policy-table">
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Status</th>
                  <th>Applies to</th>
                  <th>Approver</th>
                  <th>Notifications</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className="grant-table-link"
                        onClick={() => openPolicy(row)}
                      >
                        {row.name}
                      </button>
                      <small>v{row.version}</small>
                    </td>
                    <td>
                      <span className="grant-lifecycle" data-state={row.lifecycle}>
                        {row.lifecycle}
                      </span>
                      {row.active_version && row.active_version !== row.version ? (
                        <small>Active v{row.active_version}</small>
                      ) : null}
                    </td>
                    <td>
                      <strong>{row.action_kind}</strong>
                      <small>
                        tenant {row.tenant_selector || '*'} · env {row.environment || '*'}
                      </small>
                    </td>
                    <td>
                      {users.find((user) => user.id === row.approver_id)?.displayName ??
                        row.approver_id}
                    </td>
                    <td>{row.email_template_name ?? 'Built-in default'}</td>
                    <td>{when(row.updated_at)}</td>
                    <td>
                      <div className="grant-row-actions">
                        <Button variant="secondary" disabled={task.busy} onClick={() => openPolicy(row)}>
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={task.busy}
                          onClick={() => void task.run(() => clone(row.id))}
                        >
                          Clone
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length ? <p>No approval policies configured.</p> : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="grant-stack">
      {task.feedback}
      <section className="grant-detail-header" aria-label="Policy workspace">
        <div>
          <Button variant="ghost" onClick={() => setView('list')}>
            ← Back to policies
          </Button>
          <p className="grant-eyebrow">Approval policy</p>
          <h2>{editing ? name || selected?.name || 'Policy' : 'New policy'}</h2>
          <p>
            {editing
              ? 'Version ' + (selected?.version ?? '—') + ' · ' + (selected?.lifecycle ?? 'DRAFT')
              : 'Create a draft. Saving alone never makes a policy live.'}
          </p>
        </div>
        {editing ? (
          <div className="grant-actions">
            {selected?.lifecycle === 'DRAFT' ? (
              <Button
                variant="secondary"
                disabled={task.busy}
                onClick={() => void task.run(() => transition(editing, 'test'))}
              >
                Test policy
              </Button>
            ) : null}
            {selected?.lifecycle === 'TESTING' ? (
              <Button
                disabled={task.busy}
                onClick={() => void task.run(() => transition(editing, 'activate'))}
              >
                Activate policy
              </Button>
            ) : null}
            {selected?.active_version ? (
              <Button
                variant="secondary"
                disabled={task.busy}
                onClick={() => void task.run(() => transition(editing, 'disable'))}
              >
                Disable active
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={task.busy}
              onClick={() => void task.run(() => clone(editing))}
            >
              Clone
            </Button>
          </div>
        ) : null}
      </section>

      <nav className="grant-tabs" aria-label="Policy sections">
        <button
          type="button"
          aria-current={view === 'details' ? 'page' : undefined}
          onClick={() => setView('details')}
        >
          Details
        </button>
        <button
          type="button"
          aria-current={view === 'preview' ? 'page' : undefined}
          disabled={!editing}
          onClick={() => setView('preview')}
        >
          Preview & Test
        </button>
        <button
          type="button"
          aria-current={view === 'history' ? 'page' : undefined}
          disabled={!editing}
          onClick={() => void task.run(showHistory)}
        >
          History
        </button>
      </nav>

      {view === 'details' ? (
        <Card
          title={editing ? 'Policy details' : 'Create approval policy'}
          description="General, matching, approval, timing, execution grant and notifications are one bounded version."
        >
          <Form busy={task.busy} onSubmit={() => void task.run(save)} label={editing ? 'Save draft' : 'Create draft'}>
            <section className="grant-editor-section" aria-labelledby="policy-general">
              <div>
                <h3 id="policy-general">General & Applies To</h3>
                <p>Define the policy identity and deterministic matching scope.</p>
              </div>
              <TextField
                label="Policy name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <div className="grant-grid">
                <Select label="Integration" value={integration} onChange={setIntegration}>
                  <option value="">Select integration</option>
                  {integrations
                    .filter((item) => item.enabled)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
                <TextField
                  label="Allowed action kind"
                  required
                  pattern="[a-zA-Z0-9_.:-]+"
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                />
              </div>
              <div className="grant-grid">
                <TextField label="Tenant selector" value={tenant} onChange={(event) => setTenant(event.target.value)} placeholder="Blank = any" />
                <TextField label="Environment selector" value={environment} onChange={(event) => setEnvironment(event.target.value)} placeholder="Blank = any" />
                <TextField label="Severity selector" value={severity} onChange={(event) => setSeverity(event.target.value)} placeholder="Blank = any" />
                <TextField label="Risk selector" value={risk} onChange={(event) => setRisk(event.target.value)} placeholder="Blank = any" />
              </div>
            </section>

            <section className="grant-editor-section" aria-labelledby="policy-approval">
              <div>
                <h3 id="policy-approval">Approval & Notifications</h3>
                <p>Choose the current approver and notification template set.</p>
              </div>
              <div className="grant-grid">
                <Select label="Assigned approver" value={approver} onChange={setApprover}>
                  <option value="">Select an enabled user</option>
                  {users.filter((user) => user.status === 'enabled').map((user) => (
                    <option key={user.id} value={user.id}>{user.displayName}</option>
                  ))}
                </Select>
                <Select label="Approval mode" value={approvalMode} onChange={setApprovalMode}>
                  <option value="SINGLE">Single</option>
                  <option value="ANY_ONE">Any one of group</option>
                  <option value="ALL">All group members</option>
                  <option value="N_OF_M">N of M</option>
                  <option value="SEQUENTIAL">Sequential</option>
                </Select>
                {approvalMode !== 'SINGLE' ? (
                  <Select label="Approver group" value={approverGroup} onChange={setApproverGroup}>
                    <option value="">Select group</option>
                    {groups.filter((group) => group.enabled).map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </Select>
                ) : null}
                {approvalMode === 'N_OF_M' ? (
                  <TextField label="Approvals required" type="number" min="1" value={approvalsRequired} onChange={(event) => setApprovalsRequired(event.target.value)} />
                ) : null}
                <Select label="Notification template set" value={template} onChange={setTemplate} required={false}>
                  <option value="">Built-in default</option>
                  {templates.filter((item) => item.enabled || item.id === template).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.enabled ? '' : ' (disabled)'}
                    </option>
                  ))}
                </Select>
              </div>
            </section>

            <section className="grant-editor-section" aria-labelledby="policy-timing">
              <div>
                <h3 id="policy-timing">Timing & Execution Grant</h3>
                <p>Bound the decision window, reminders and exact-action execution validity.</p>
              </div>
              <div className="grant-grid">
                <TextField label="Response deadline (seconds)" type="number" min={60} max={604800} required value={deadline} onChange={(event) => setDeadline(event.target.value)} />
                <TextField label="Reminder interval (seconds)" type="number" min={60} max={86400} required value={reminder} onChange={(event) => setReminder(event.target.value)} />
                <TextField label="Maximum reminders" type="number" min={0} max={20} required value={count} onChange={(event) => setCount(event.target.value)} />
                <TextField label="Execution validity (seconds)" type="number" min={30} max={86400} required value={validity} onChange={(event) => setValidity(event.target.value)} />
              </div>
            </section>
          </Form>
        </Card>
      ) : null}

      {view === 'preview' ? (
        <Card title="Preview & test" description="Preview uses the same deterministic resolver as live intake. An isolated test request never creates executable authorization.">
          <div className="grant-grid">
            <Select label="Sample integration" value={sample.integration_id || integration} onChange={(value) => setSample({ ...sample, integration_id: value })}>
              <option value="">Select integration</option>
              {integrations.filter((item) => item.enabled).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
            <TextField label="Sample action kind" value={sample.action_kind || action} onChange={(event) => setSample({ ...sample, action_kind: event.target.value })} />
            <TextField label="Sample title" value={sample.title} onChange={(event) => setSample({ ...sample, title: event.target.value })} />
            <TextField label="Sample target" value={sample.target} onChange={(event) => setSample({ ...sample, target: event.target.value })} />
          </div>
          <TextArea label="Sample reason" value={sample.reason} onChange={(value) => setSample({ ...sample, reason: value })} />
          <div className="grant-grid">
            <TextField label="Sample tenant" value={sample.tenant} onChange={(event) => setSample({ ...sample, tenant: event.target.value })} />
            <TextField label="Sample environment" value={sample.environment} onChange={(event) => setSample({ ...sample, environment: event.target.value })} />
            <TextField label="Sample severity" value={sample.severity} onChange={(event) => setSample({ ...sample, severity: event.target.value })} />
            <TextField label="Sample risk" value={sample.risk_level} onChange={(event) => setSample({ ...sample, risk_level: event.target.value })} />
          </div>
          <div className="grant-actions">
            <Button variant="secondary" disabled={task.busy || !(sample.integration_id || integration) || !(sample.action_kind || action)} onClick={() => void task.run(previewActive)}>
              Preview active resolution
            </Button>
            <Button variant="secondary" disabled={task.busy || !editing || selected?.lifecycle !== 'TESTING'} onClick={() => void task.run(runIsolated)}>
              Run isolated test
            </Button>
          </div>
          {preview ? (
            <Alert tone="info" title={(preview.test_mode ? 'Isolated test: ' : 'Resolved policy: ') + preview.policy.name + ' v' + preview.policy.version}>
              <p>Approver: {users.find((user) => user.id === preview.approver_id)?.displayName ?? preview.approver_id} · specificity {preview.resolution.specificity} · execution allowed: {String(preview.execution_allowed)}</p>
              <p>Deadline {preview.timing?.deadline_seconds ?? preview.policy.deadline_seconds}s · reminders {preview.timing?.reminder_seconds ?? preview.policy.reminder_seconds}s × {preview.timing?.max_reminders ?? preview.policy.max_reminders} · execution validity {preview.execution_grant?.validity_seconds ?? preview.policy.grant_seconds}s</p>
              <p><strong>{preview.notification?.subject}</strong></p>
              <pre className="grant-mono">{preview.notification?.body}</pre>
              <p>{Object.entries(preview.resolution.selectors).map(([key, value]) => key + ': ' + (value.matched ? 'match' : 'no match') + (value.wildcard ? ' (any)' : '')).join(' · ')}</p>
            </Alert>
          ) : null}
        </Card>
      ) : null}

      {view === 'history' ? (
        <Card title="Version / change history" description={'Policy ' + editing}>
          {history?.versions.map((version) => (
            <div className="grant-delivery" key={version.version_id}>
              <div>
                <strong>v{version.version} · {version.lifecycle}</strong>
                <small>Updated {when(version.updated_at)} · activated {when(version.activated_at)} · disabled {when(version.disabled_at)}</small>
              </div>
            </div>
          ))}
          {history?.events.slice(0, 20).map((event) => (
            <div className="grant-delivery" key={event.id}>
              <div>
                <strong>{event.action}</strong>
                <small>{when(event.at)} · {event.actor}</small>
              </div>
            </div>
          ))}
          {!history ? <p>Loading history…</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
