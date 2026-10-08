import { useEffect, useState } from 'react';
import { Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Select, State, useTask, when } from './common';
import type { ApproverGroup, Integration, Profile, RequestRow, User } from './types';

type Navigate = (path: string) => void;
export type InboxMode = 'all' | 'approvals' | 'requester';

export type Filters = {
  view: string;
  search: string;
  state: string;
  collaboration_state: string;
  policy_id: string;
  requester_id: string;
  approver_id: string;
  group_id: string;
  integration_id: string;
  action_kind: string;
  created_after: string;
  created_before: string;
  delivery_state: string;
  execution_state: string;
};
const initialFilters = (mode: InboxMode): Filters => ({
  view: mode === 'approvals' ? 'needs' : mode === 'requester' ? 'requester' : 'all',
  search: '', state: '', collaboration_state: '', policy_id: '', requester_id: '',
  approver_id: '', group_id: '', integration_id: '', action_kind: '',
  created_after: '', created_before: '', delivery_state: '', execution_state: '',
});
const viewOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'All visible requests' },
  { value: 'needs', label: 'Needs my decision' },
  { value: 'held', label: 'Held approvals' },
  { value: 'overdue', label: 'Overdue or expired' },
  { value: 'delegated', label: 'Delegated to me' },
  { value: 'recent', label: 'Recently decided' },
  { value: 'requester', label: 'My submitted requests' },
  { value: 'escalated', label: 'Escalated requests' },
  { value: 'ops_pending', label: 'All pending approvals' },
  { value: 'ops_overdue', label: 'All overdue approvals' },
  { value: 'ops_approved_unused', label: 'Approved but unused' },
  { value: 'ops_execution_unknown', label: 'Execution unknown' },
  { value: 'ops_execution_failed', label: 'Execution failed' },
  { value: 'ops_email_failed', label: 'Email delivery failed' },
  { value: 'ops_webhook_failed', label: 'Callback delivery failed' },
  { value: 'ops_delivery_failed', label: 'Any delivery failed' },
  { value: 'ops_decided', label: 'All human-decided requests' },
];
const labels: Record<string, string> = {
  APPROVERS: 'Waiting on approvers',
  REQUESTER_INFO: 'Waiting on requester information',
  REQUESTER_REVISION: 'Changes requested — new request required',
  EXECUTOR: 'Approved — awaiting execution',
  EXECUTION_RESULT: 'Awaiting execution result',
  CLOSED: 'Decision closed',
};

function encodeParameter(value: string | number): string {
  // api.ts accepts a conservative path alphabet. Percent-encode reserved
  // punctuation as well as whitespace, rather than allowing '+' from URLSearchParams.
  return encodeURIComponent(String(value)).replace(/[!'()*~]/g, (character) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase());
}
function queryFor(filters: Filters, offset: number): string {
  const params: Record<string, string | number> = { limit: 50, offset };
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    if (key === 'created_after') {
      params.created_after = Math.floor(new Date(value + 'T00:00:00').getTime() / 1000);
    } else if (key === 'created_before') {
      params.created_before = Math.floor(new Date(value + 'T23:59:59').getTime() / 1000);
    } else {
      params[key] = value;
    }
  }
  return '/requests?' + Object.entries(params)
    .filter(([, value]) => Number.isFinite(typeof value === 'number' ? value : 0))
    .map(([key, value]) => key + '=' + encodeParameter(value)).join('&');
}

export function RequestList({
  user, mode, navigate, preset,
}: { user: User; mode: InboxMode; navigate: Navigate; preset?: Partial<Filters> }) {
  const initial = (): Filters => {
    const defaults = { ...initialFilters(mode), ...preset };
    // The App router already resolves pathname independently of search params.
    // Only this allowlisted deep link may override the approval queue's default.
    if (
      mode === 'approvals' && window.location.pathname === '/approvals' &&
      new URLSearchParams(window.location.search).get('view') === 'overdue'
    ) {
      defaults.view = 'overdue';
    }
    return defaults;
  };
  const [draft, setDraft] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accounts, setAccounts] = useState<AccountProjection[]>([]);
  const [groups, setGroups] = useState<ApproverGroup[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const task = useTask();
  const admin = user.role === 'admin';

  function edit(field: keyof Filters, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  async function load() {
    setRows(await api<RequestRow[]>(queryFor(applied, offset)));
  }

  useEffect(() => { void task.run(load); }, [applied, offset]);
  useEffect(() => {
    void (async () => {
      // Identity lookups are optional UI labels. They never broaden the role scope
      // of the authoritative GET /requests filter.
      try { setProfiles(await api<Profile[]>('/profiles')); } catch { /* optional labels */ }
      if (admin) {
        try {
          const [people, approverGroups, connections] = await Promise.all([
            api<AccountProjection[]>('/admin/users'),
            api<ApproverGroup[]>('/approver-groups'),
            api<Integration[]>('/integrations'),
          ]);
          setAccounts(people);
          setGroups(approverGroups);
          setIntegrations(connections);
        } catch { /* missing administration capability leaves selectors hidden */ }
      }
    })();
  }, [admin]);

  function apply() {
    setOffset(0);
    setApplied({ ...draft });
  }
  function reset() {
    if (mode === 'approvals' && window.location.pathname === '/approvals' &&
        new URLSearchParams(window.location.search).get('view') === 'overdue') {
      window.history.replaceState(window.history.state, '', '/approvals');
    }
    const defaults = initial();
    setDraft(defaults);
    setOffset(0);
    setApplied(defaults);
  }
  const viewChoices = mode === 'requester'
    ? viewOptions.filter((item) => item.value === 'requester')
    : mode === 'approvals'
      ? viewOptions.filter((item) => ['needs', 'held', 'overdue', 'delegated', 'recent'].includes(item.value))
      : viewOptions.filter((item) => admin || !item.value.startsWith('ops_'));
  const heading = mode === 'approvals'
    ? 'Your approval queue'
    : mode === 'requester' ? 'My submitted requests' : 'Approval requests';

  return <div className="grant-stack">
    {task.feedback}
    <Card title={heading} description="Search and filters apply to all role-visible records on the server, before pagination. Decisions, notifications and execution remain separate."
      actions={<div className="grant-actions">
        <Button onClick={() => navigate('/requests/new')}>New request</Button>
        <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>Refresh</Button>
      </div>}>
      <div className="grant-grid">
        <TextField label="Search requests" value={draft.search} maxLength={100} onChange={(e) => edit('search', e.target.value)} />
        <Select label="Work view" value={draft.view} onChange={(value) => edit('view', value)}>
          {viewChoices.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}
        </Select>
        <Select label="Decision status" value={draft.state} onChange={(value) => edit('state', value)} required={false}>
          <option value="">Any status</option>
          {['AWAITING', 'HELD', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'].map((entry) =>
            <option key={entry} value={entry}>{entry.replaceAll('_', ' ')}</option>)}
        </Select>
        <Select label="Information status" value={draft.collaboration_state} onChange={(value) => edit('collaboration_state', value)} required={false}>
          <option value="">Any information status</option>
          <option value="OPEN">Ready for decisions</option>
          <option value="INFO_REQUESTED">Waiting for information</option>
          <option value="CHANGES_REQUESTED">Changes required</option>
        </Select>
        <Select label="Approval policy" value={draft.policy_id} onChange={(value) => edit('policy_id', value)} required={false}>
          <option value="">Any policy</option>
          {profiles.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
        </Select>
        <TextField label="Action type" value={draft.action_kind} maxLength={100} onChange={(e) => edit('action_kind', e.target.value)} />
        <TextField label="Created from" type="date" value={draft.created_after} onChange={(e) => edit('created_after', e.target.value)} />
        <TextField label="Created through" type="date" value={draft.created_before} onChange={(e) => edit('created_before', e.target.value)} />
        <Select label="Callback delivery" value={draft.delivery_state} onChange={(value) => edit('delivery_state', value)} required={false}>
          <option value="">Any delivery status</option>
          {['NOT_SCHEDULED', 'PENDING', 'DELIVERED', 'FAILED'].map((value) =>
            <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}
        </Select>
        <Select label="Execution status" value={draft.execution_state} onChange={(value) => edit('execution_state', value)} required={false}>
          <option value="">Any execution status</option>
          {['NOT_STARTED', 'COMMITTED', 'RUNNING', 'UNKNOWN', 'REPORTED_SUCCEEDED', 'REPORTED_FAILED'].map((value) =>
            <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}
        </Select>
        {admin && <>
          <Select label="Requester" value={draft.requester_id} onChange={(value) => edit('requester_id', value)} required={false}>
            <option value="">Any requester</option>
            {accounts.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </Select>
          <Select label="Approver" value={draft.approver_id} onChange={(value) => edit('approver_id', value)} required={false}>
            <option value="">Any approver</option>
            {accounts.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </Select>
          <Select label="Approver group" value={draft.group_id} onChange={(value) => edit('group_id', value)} required={false}>
            <option value="">Any group</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </Select>
          <Select label="Integration" value={draft.integration_id} onChange={(value) => edit('integration_id', value)} required={false}>
            <option value="">Any integration</option>
            {integrations.map((integration) => <option key={integration.id} value={integration.id}>{integration.name}</option>)}
          </Select>
        </>}
      </div>
      <div className="grant-actions">
        <Button disabled={task.busy} onClick={apply}>Apply filters</Button>
        <Button variant="secondary" disabled={task.busy} onClick={reset}>Clear filters</Button>
      </div>
      <div className="grant-table-scroll"><table className="grant-table">
        <thead><tr>
          <th>Request</th><th>Decision</th><th>Approval progress</th>
          <th>Callback delivery</th><th>Execution</th><th>Deadline</th>
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td><Button variant="ghost" onClick={() => navigate('/requests/' + row.id)}>{row.title}</Button>
            <small>{row.external_id}{row.viewer_delegated_for ? ' · Delegated to you' : ''}</small></td>
          <td><State value={row.state} />{row.collaboration_state !== 'OPEN' &&
            <small>{row.collaboration_state.replaceAll('_', ' ')}</small>}</td>
          <td>
            <strong>{row.approval_progress?.approved_count ?? 0} / {row.approval_progress?.required_count ?? 1} approved</strong>
            <small>{labels[row.approval_progress?.waiting_on ?? ''] ?? 'Waiting for response'}</small>
            {!!row.approval_progress?.waiting_approvers.length &&
              <small>{row.approval_progress.group_name ? row.approval_progress.group_name + ' · ' : ''}
                {row.approval_progress.waiting_approvers.map((person) => person.username).join(', ')}
              </small>}
          </td>
          <td><State value={row.delivery_state} /></td>
          <td><State value={row.execution_state} /></td>
          <td>{when(row.deadline)}{row.escalation?.fired_at && <small>Escalated</small>}</td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length && <p>No matching requests. Try clearing filters or creating a new request.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={!offset || task.busy} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous page</Button>
        <span>Page {Math.floor(offset / 50) + 1} · {rows.length} loaded</span>
        <Button variant="secondary" disabled={rows.length < 50 || task.busy} onClick={() => setOffset(offset + 50)}>Next page</Button>
      </div>
    </Card>
  </div>;
}
