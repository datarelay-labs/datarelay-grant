import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { PolicyCloneConfirmation, createPolicyCloneReview, submitReviewedPolicyClone, type PolicyCloneIntent } from './policy_clone_review';
import { Form, Select, TextArea, useTask, when } from './common';
import {
  DecisionSecurityFields, policyDecisionSecuritySummary,
  readDecisionSecurity, serializeDecisionSecurity, type DecisionSecurityDraft,
} from './policy_decision_security';
import type {
  ApproverGroup,
  Integration,
  NotificationTemplateSet,
  PolicyHistory,
  PolicyPreview,
  Profile,
  PolicyLifecycle,
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

const policyEditorSections = [
  { id: 'policy-general', title: 'General' },
  { id: 'policy-applies-to', title: 'Applies To' },
  { id: 'policy-approval', title: 'Approval' },
  { id: 'policy-email-decisions', title: 'Verification' },
  { id: 'policy-timing', title: 'Timing' },
  { id: 'policy-execution-grant', title: 'Execution Grant' },
  { id: 'policy-notifications', title: 'Notifications' },
] as const;

type PolicyEditorSectionId = (typeof policyEditorSections)[number]['id'];

// Native non-submit controls keep the edit form stable and jump to its own
// accessible headings. The existing verification section remains owned by
// DecisionSecurityFields; it is not reimplemented in this view.
export function PolicyEditorJumpLinks() {
  return <nav className="grant-tabs" aria-label="Policy editor sections">
    {policyEditorSections.map((item) => <button
      key={item.id}
      type="button"
      data-jump-to={item.id}
      onClick={() => {
        const target = document.getElementById(item.id);
        if (!target) return;
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
      }}
    >{item.title}</button>)}
  </nav>;
}

export function PolicyEditorSection({ id, title, description, children }: {
  id: PolicyEditorSectionId;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  if (!policyEditorSections.some((item) => item.id === id && item.title === title)) {
    throw new Error('POLICY_EDITOR_SECTION_UNRECOGNIZED');
  }
  return <section className="grant-editor-section" aria-labelledby={id}>
    <div>
      <h3 id={id} tabIndex={-1}>{title}</h3>
      <p>{description}</p>
    </div>
    {children}
  </section>;
}

type PolicyListFilter = {
  search: string;
  lifecycle: 'ALL' | PolicyLifecycle;
};

// Client-only discovery over the already role-scoped GET /profiles response.
// Never widen the server permission boundary or infer hidden policy records.
export function filterPolicyList(
  rows: readonly Profile[],
  integrations: readonly Pick<Integration, 'id' | 'name'>[],
  approvers: readonly Pick<AccountProjection, 'id' | 'displayName'>[],
  filter: PolicyListFilter,
): Profile[] {
  if (!(['ALL', 'DRAFT', 'TESTING', 'ACTIVE', 'DISABLED'] as string[])
    .includes(filter.lifecycle) || filter.search.length > 128) {
    return [];
  }
  const query = filter.search.trim().toLowerCase();
  const integrationNames = new Map(integrations.map((item) => [item.id, item.name]));
  const approverNames = new Map(approvers.map((item) => [item.id, item.displayName]));
  return rows.filter((row) => {
    if (filter.lifecycle !== 'ALL' && row.lifecycle !== filter.lifecycle) return false;
    if (!query) return true;
    return [
      row.name,
      row.action_kind,
      integrationNames.get(row.integration_id) ?? row.integration_id,
      approverNames.get(row.approver_id) ?? row.approver_id,
    ].some((value) => value.toLowerCase().includes(query));
  });
}

export type PolicyEditorDraft = {
  name: string;
  integration: string;
  approver: string;
  approvalMode: string;
  approverGroup: string;
  approvalsRequired: string;
  action: string;
  template: string;
  deadline: string;
  reminder: string;
  count: string;
  validity: string;
  tenant: string;
  environment: string;
  severity: string;
  risk: string;
  decisionSecurity: DecisionSecurityDraft;
};

function boundedPolicyNumber(raw: string, min: number, max: number): number {
  const normalized = raw.trim();
  const value = Number(normalized);
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(value) ||
      value < min || value > max) {
    throw new Error('POLICY_DRAFT_INVALID_NUMBER');
  }
  return value;
}

// This exact payload feeds both Save Draft and the form comparison. Fields
// hidden for a chosen approval mode do not create artificial differences.
export function policyEditorPayload(draft: PolicyEditorDraft) {
  if (!['SINGLE', 'ANY_ONE', 'ALL', 'N_OF_M', 'SEQUENTIAL'].includes(draft.approvalMode)) {
    throw new Error('POLICY_DRAFT_INVALID_MODE');
  }
  return {
    name: draft.name,
    integration_id: draft.integration,
    approver_id: draft.approver,
    approval_mode: draft.approvalMode,
    approver_group_id: draft.approvalMode === 'SINGLE' ? null : draft.approverGroup,
    approvals_required: draft.approvalMode === 'N_OF_M'
      ? boundedPolicyNumber(draft.approvalsRequired, 1, 50) : null,
    action_kind: draft.action,
    email_template_id: draft.template || null,
    deadline_seconds: boundedPolicyNumber(draft.deadline, 60, 604800),
    reminder_seconds: boundedPolicyNumber(draft.reminder, 60, 86400),
    max_reminders: boundedPolicyNumber(draft.count, 0, 20),
    grant_seconds: boundedPolicyNumber(draft.validity, 30, 86400),
    tenant_selector: draft.tenant,
    environment: draft.environment,
    severity: draft.severity,
    risk_level: draft.risk,
    ...serializeDecisionSecurity(draft.decisionSecurity),
  };
}

function savedPolicyDraft(row: Profile): PolicyEditorDraft {
  return {
    name: row.name,
    integration: row.integration_id,
    approver: row.approver_id,
    approvalMode: row.approval_mode,
    approverGroup: row.approver_group_id ?? '',
    approvalsRequired: String(row.approvals_required ?? 2),
    action: row.action_kind,
    template: row.email_template_id ?? '',
    deadline: String(row.deadline_seconds),
    reminder: String(row.reminder_seconds),
    count: String(row.max_reminders),
    validity: String(row.grant_seconds),
    tenant: row.tenant_selector,
    environment: row.environment,
    severity: row.severity,
    risk: row.risk_level,
    decisionSecurity: readDecisionSecurity(row),
  };
}

// Fail closed on missing/unversioned security or a changed server version,
// even if the later version happens to have identical form field values.
export function isPolicyEditorUnchanged(
  current: Profile | null | undefined,
  baseline: Profile | null | undefined,
  draft: PolicyEditorDraft,
): boolean {
  if (!current || !baseline ||
      current.id !== baseline.id ||
      current.version_id !== baseline.version_id ||
      current.version !== baseline.version ||
      current.lifecycle !== baseline.lifecycle ||
      (current.active_version ?? null) !== (baseline.active_version ?? null) ||
      (current.active_version_id ?? null) !== (baseline.active_version_id ?? null)) {
    return false;
  }
  try {
    return JSON.stringify(policyEditorPayload(draft)) ===
      JSON.stringify(policyEditorPayload(savedPolicyDraft(current)));
  } catch {
    return false;
  }
}

export function PolicyUnsavedNotice({ busy, onDiscard }: {
  busy: boolean; onDiscard: () => void;
}) {
  return <Alert tone="warning" title="Unsaved policy changes">
    <p>Save draft before Testing, activation, disabling or cloning.
       These actions use the saved policy, not the values still in this editor.</p>
    <Button variant="secondary" disabled={busy} onClick={onDiscard}>
      Discard edits
    </Button>
  </Alert>;
}

export type PolicyTransitionIntent = {
  policyId: string;
  action: 'activate' | 'disable';
  versionId: string;
  version: number;
  activeVersion: number | null;
};

// Snapshot of the specific reviewed policy and active lineage. The final
// server read is still required before an existing lifecycle POST.
export function canConfirmPolicyTransition(
  intent: PolicyTransitionIntent | null,
  policy: Profile | null | undefined,
): boolean {
  if (!intent || !policy ||
      policy.id !== intent.policyId ||
      policy.version_id !== intent.versionId ||
      policy.version !== intent.version ||
      (policy.active_version ?? null) !== intent.activeVersion) return false;
  return intent.action === 'activate'
    ? policy.lifecycle === 'TESTING'
    : intent.action === 'disable' && intent.activeVersion !== null;
}

export function PolicyLifecycleConfirmation({
  intent, policy, busy, editorUnchanged = true, onCancel, onConfirm,
}: {
  intent: PolicyTransitionIntent | null;
  policy: Profile | null | undefined;
  busy: boolean;
  editorUnchanged?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!intent) return null;
  const canConfirm = editorUnchanged && canConfirmPolicyTransition(intent, policy);
  const activating = intent.action === 'activate';
  return <Alert tone="warning"
    title={activating ? 'Confirm policy activation' : 'Confirm active policy disable'}>
    <p><strong>{policy?.name ?? intent.policyId}</strong></p>
    <p>{activating
      ? 'Activate reviewed policy v' + intent.version +
        ' for new matching requests. The change applies only to future matches; existing requests retain their original policy snapshot.'
      : 'Disable currently active policy v' + intent.activeVersion +
        ' for future requests. The change applies only to future matches; existing requests retain their original policy snapshot.'}</p>
    {!editorUnchanged ? <p role="alert">
      Policy editor has unsaved changes. Save draft or discard edits, then review this action again.
    </p> : !canConfirm ? <p role="alert">
      Policy changed since review. Cancel and reopen the current policy before taking action.
    </p> : null}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button disabled={busy || !canConfirm} onClick={onConfirm}>
        {activating ? 'Confirm activation' : 'Confirm disable'}
      </Button>
    </div>
  </Alert>;
}

export function Profiles() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [users, setUsers] = useState<AccountProjection[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplateSet[]>([]);
  const [listSearch, setListSearch] = useState('');
  const [listLifecycle, setListLifecycle] = useState<PolicyListFilter['lifecycle']>('ALL');
  const [view, setView] = useState<PolicyView>('list');
  const [editing, setEditing] = useState('');
  const [editingBaseline, setEditingBaseline] = useState<Profile | null>(null);
  const [pendingTransition, setPendingTransition] = useState<PolicyTransitionIntent | null>(null);
  const [pendingClone, setPendingClone] = useState<PolicyCloneIntent | null>(null);
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
  const [decisionSecurity, setDecisionSecurity] = useState(readDecisionSecurity);
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
    return policies;
  };

  useEffect(() => {
    void task.run(async () => { await load(); });
  }, []);

  function resetEditor() {
    setPendingClone(null);
    setPendingTransition(null);
    setEditingBaseline(null);
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
    setDecisionSecurity(readDecisionSecurity());
    setHistory(null);
    setPreview(null);
    setSample(initialSample);
  }

  function edit(row: Profile) {
    setPendingClone(null);
    setPendingTransition(null);
    setEditingBaseline({ ...row });
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
    setDecisionSecurity(readDecisionSecurity(row));
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
    const body = policyEditorPayload(editorDraft);
    const saved = await api<Profile>(
      editing ? '/profiles/' + editing : '/profiles',
      editing ? 'PUT' : 'POST',
      body,
    );
    const currentPolicies = await load();
    // Adopt exactly the authoritative newly saved values and version, rather
    // than leaving the editor bound to a previous baseline or inferred state.
    edit(currentPolicies.find((row) => row.id === saved.id) ?? saved);
    setView('details');
    task.setNotice(
      'Draft saved. It is not live until it passes Testing and is explicitly activated.',
    );
  }

  async function currentStoredPolicy(): Promise<Profile> {
    if (!editing || !isPolicyEditorUnchanged(
      rows.find((row) => row.id === editing), editingBaseline, editorDraft,
    )) {
      throw new Error('POLICY_UNSAVED_CHANGES_SAVE_FIRST');
    }
    const fresh = (await load()).find((row) => row.id === editing);
    if (!isPolicyEditorUnchanged(fresh, editingBaseline, editorDraft)) {
      setPendingTransition(null);
      throw new Error('POLICY_CHANGED_REVIEW_REQUIRED');
    }
    return fresh!;
  }

  async function testStoredPolicy() {
    const current = await currentStoredPolicy();
    if (current.lifecycle !== 'DRAFT') throw new Error('POLICY_CHANGED_REVIEW_REQUIRED');
    await transition(current.id, 'test');
  }

  function stageClone(row: Profile) {
    setPendingTransition(null);
    setPendingClone(createPolicyCloneReview(row));
  }

  function stageCloneFromEditor() {
    const source = rows.find((row) => row.id === editing);
    if (!source || !isPolicyEditorUnchanged(source, editingBaseline, editorDraft)) return;
    stageClone(source);
  }

  async function confirmClone() {
    const staged = pendingClone;
    if (!staged) return;
    // An unsaved edit cannot silently be replaced by a saved-policy clone.
    if (view !== 'list' && staged.policyId === editing && !editorUnchanged) {
      setPendingClone(null);
      throw new Error('POLICY_UNSAVED_CHANGES_SAVE_FIRST');
    }
    // Invalidate immediately before the read-only freshness check and only
    // clone POST. A failed/ambiguous POST must never be automatically retried.
    setPendingClone(null);
    await submitReviewedPolicyClone(
      staged,
      async () => {
        const latest = await load();
        return latest.find((row) => row.id === staged.policyId);
      },
      async (sourceId) => { await clone(sourceId); },
    );
  }

  async function discardEditorChanges() {
    if (!editing) return;
    const current = (await load()).find((row) => row.id === editing);
    if (!current) throw new Error('POLICY_CHANGED_REVIEW_REQUIRED');
    edit(current);
    task.setNotice('Unsaved changes discarded. The latest saved policy is now shown.');
  }

  async function transition(id: string, actionName: 'test' | 'activate' | 'disable') {
    const updated = await api<Profile>('/profiles/' + id + '/' + actionName, 'POST');
    const currentPolicies = await load();
    // Disabling active v1 must not load obsolete v1 into the draft-v2 editor.
    // /profiles always returns the newest editable policy version.
    if (editing === id) {
      edit(actionName === 'disable'
        ? currentPolicies.find((policy) => policy.id === id) ?? updated
        : updated);
    }
    task.setNotice(
      actionName === 'test'
        ? 'Policy moved to Testing. Use isolated test before activation.'
        : actionName === 'activate'
          ? 'Policy activated. Existing requests retain their original version snapshot.'
          : 'Active policy version disabled.',
    );
  }

  function stageLiveTransition(actionName: 'activate' | 'disable') {
    const current = rows.find((row) => row.id === editing);
    if (!current || !isPolicyEditorUnchanged(current, editingBaseline, editorDraft)) return;
    const intent: PolicyTransitionIntent = {
      policyId: current.id,
      action: actionName,
      versionId: current.version_id,
      version: current.version,
      activeVersion: current.active_version ?? null,
    };
    if (canConfirmPolicyTransition(intent, current)) setPendingTransition(intent);
  }

  async function confirmLiveTransition() {
    const staged = pendingTransition;
    if (!staged) return;
    // Recheck the unchanged draft as well as live authority and version after
    // review. A local edit during confirmation cannot commit old saved values.
    const latest = await currentStoredPolicy();
    if (!canConfirmPolicyTransition(staged, latest)) {
      setPendingTransition(null);
      throw new Error('POLICY_CHANGED_REVIEW_REQUIRED');
    }
    await transition(staged.policyId, staged.action);
    setPendingTransition(null);
  }

  async function clone(id: string) {
    const cloned = await api<Profile>('/profiles/' + encodeURIComponent(id) + '/clone', 'POST');
    // The successful POST already returns the created Draft. A redundant GET
    // could fail after a durable clone and misleadingly invite a second POST.
    setRows((current) => [cloned, ...current.filter((row) => row.id !== cloned.id)]);
    edit(cloned);
    setView('details');
    task.setNotice('Policy cloned as a new Draft. It is not active.');
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
  const editorDraft: PolicyEditorDraft = {
    name, integration, approver, approvalMode, approverGroup, approvalsRequired,
    action, template, deadline, reminder, count, validity, tenant, environment,
    severity, risk, decisionSecurity,
  };
  const editorUnchanged = isPolicyEditorUnchanged(selected, editingBaseline, editorDraft);
  const unsavedExistingPolicy = Boolean(editing && !editorUnchanged);

  if (view === 'list') {
    const visibleRows = filterPolicyList(rows, integrations, users, {
      search: listSearch, lifecycle: listLifecycle,
    });
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

        <PolicyCloneConfirmation intent={pendingClone}
          source={rows.find((row) => row.id === pendingClone?.policyId)}
          busy={task.busy}
          onCancel={() => setPendingClone(null)}
          onConfirm={() => void task.run(confirmClone)} />

        <Card
          title="Policies"
          description="Scan policy status and scope first. Open a policy only when you need to configure or test it."
        >
          <div className="grant-grid">
            <TextField label="Search policies"
              placeholder="Policy, action, integration or approver"
              value={listSearch}
              onChange={(event) => setListSearch(event.target.value.slice(0, 128))}
            />
            <Select label="Lifecycle" required={false} value={listLifecycle}
              onChange={(value) => setListLifecycle(value as PolicyListFilter['lifecycle'])}>
              <option value="ALL">All lifecycles</option>
              <option value="DRAFT">Draft</option>
              <option value="TESTING">Testing</option>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </Select>
          </div>
          <div className="grant-row-actions">
            <small aria-live="polite">Showing {visibleRows.length} of {rows.length} policies</small>
            <Button variant="ghost"
              disabled={!listSearch && listLifecycle === 'ALL'}
              onClick={() => { setListSearch(''); setListLifecycle('ALL'); }}>
              Clear filters
            </Button>
          </div>
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
                {visibleRows.map((row) => (
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
                      <small>{policyDecisionSecuritySummary(row)}</small>
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
                      <small>{integrations.find((item) => item.id === row.integration_id)?.name ?? row.integration_id}</small>
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
                          onClick={() => stageClone(row)}
                        >
                          Review clone
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length ? <p>No approval policies configured.</p> : null}
          {rows.length > 0 && !visibleRows.length ? (
            <p>No policies match the current search and lifecycle filters. Clear filters to see all visible policies.</p>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="grant-stack">
      {task.feedback}
      <section className="grant-detail-header" aria-label="Policy workspace">
        <div>
          <Button variant="ghost" onClick={() => {
            setPendingClone(null);
            setPendingTransition(null);
            setView('list');
          }}>
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
                disabled={task.busy || !editorUnchanged}
                onClick={() => void task.run(testStoredPolicy)}
              >
                Test policy
              </Button>
            ) : null}
            {selected?.lifecycle === 'TESTING' ? (
              <Button
                disabled={task.busy || !editorUnchanged}
                onClick={() => stageLiveTransition('activate')}
              >
                Activate policy
              </Button>
            ) : null}
            {selected?.active_version ? (
              <Button
                variant="secondary"
                disabled={task.busy || !editorUnchanged}
                onClick={() => stageLiveTransition('disable')}
              >
                Disable active
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={task.busy || !editorUnchanged}
              onClick={stageCloneFromEditor}
            >
              Review clone
            </Button>
          </div>
        ) : null}
      </section>

      {unsavedExistingPolicy ? <PolicyUnsavedNotice
        busy={task.busy}
        onDiscard={() => void task.run(discardEditorChanges)}
      /> : null}

      <PolicyCloneConfirmation intent={pendingClone}
        source={rows.find((row) => row.id === pendingClone?.policyId)}
        busy={task.busy}
        onCancel={() => setPendingClone(null)}
        onConfirm={() => void task.run(confirmClone)} />

      <PolicyLifecycleConfirmation
        intent={pendingTransition}
        policy={selected}
        editorUnchanged={editorUnchanged}
        busy={task.busy}
        onCancel={() => setPendingTransition(null)}
        onConfirm={() => void task.run(confirmLiveTransition)}
      />

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
          {!decisionSecurity.contractAvailable ? (
            <Alert tone="critical" title="Versioned verification policy unavailable">
              This backend has not supplied the current Deny-reason, verification mode
              and link-validity fields. Editing is disabled rather than silently
              weakening an existing approval policy.
            </Alert>
          ) : null}
          {decisionSecurity.contractAvailable ? (
          <div onChangeCapture={() => setPendingTransition(null)}>
          <Form
            busy={task.busy}
            onSubmit={() => void task.run(save)}
            label={editing ? 'Save draft' : 'Create draft'}
          >
            <PolicyEditorJumpLinks />
            <PolicyEditorSection id="policy-general" title="General"
              description="Name and identify this versioned approval policy.">
              <TextField
                label="Policy name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </PolicyEditorSection>

            <PolicyEditorSection id="policy-applies-to" title="Applies To"
              description="Restrict which integration, actions and request attributes this policy matches.">
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
            </PolicyEditorSection>

            <PolicyEditorSection id="policy-approval" title="Approval"
              description="Choose explicit approvers, groups and the required voting threshold.">
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
              </div>
            </PolicyEditorSection>

            <DecisionSecurityFields
              draft={decisionSecurity}
              update={setDecisionSecurity}
              integration={integrations.find((item) => item.id === integration)}
            />

            <PolicyEditorSection id="policy-timing" title="Timing"
              description="Set the approval deadline and bounded reminder cadence.">
              <div className="grant-grid">
                <TextField label="Response deadline (seconds)" type="number" min={60} max={604800} required value={deadline} onChange={(event) => setDeadline(event.target.value)} />
                <TextField label="Reminder interval (seconds)" type="number" min={60} max={86400} required value={reminder} onChange={(event) => setReminder(event.target.value)} />
                <TextField label="Maximum reminders" type="number" min={0} max={20} required value={count} onChange={(event) => setCount(event.target.value)} />
              </div>
            </PolicyEditorSection>

            <PolicyEditorSection id="policy-execution-grant" title="Execution Grant"
              description="Limit the time an approved exact-action grant can be consumed.">
              <TextField label="Execution validity (seconds)" type="number" min={30} max={86400} required value={validity} onChange={(event) => setValidity(event.target.value)} />
            </PolicyEditorSection>

            <PolicyEditorSection id="policy-notifications" title="Notifications"
              description="Select the message template set for future requests.">
              <Select label="Notification template set" value={template} onChange={setTemplate} required={false}>
                <option value="">Built-in default</option>
                {templates.filter((item) => item.enabled || item.id === template).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.enabled ? '' : ' (disabled)'}
                  </option>
                ))}
              </Select>
            </PolicyEditorSection>
          </Form>
          </div>
          ) : null}
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
