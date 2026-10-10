import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, useTask, when } from './common';
import type { User } from './types';

type DirectoryUser = { id: string; username: string };
type Delegation = {
  id: string; delegator_id: string; substitute_id: string;
  starts_at: number; ends_at: number; revoked_at: number | null;
};
type Pending =
  | { action: 'create'; substitute: string; start: number; end: number }
  | { action: 'revoke'; id: string };

function localDateTime(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 3600_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function Delegations({ user }: { user: User }) {
  const task = useTask();
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [records, setRecords] = useState<Delegation[]>([]);
  const [substitute, setSubstitute] = useState('');
  const [starts, setStarts] = useState(() => localDateTime(0));
  const [ends, setEnds] = useState(() => localDateTime(8));
  const [pending, setPending] = useState<Pending | null>(null);

  async function load() {
    const [people, delegations] = await Promise.all([
      api<DirectoryUser[]>('/approvers/directory'),
      api<Delegation[]>('/delegations'),
    ]);
    setDirectory(people);
    setRecords(delegations);
  }
  useEffect(() => { void task.run(load); }, []);

  function nameOf(id: string) {
    return id === user.id ? user.username : directory.find((person) => person.id === id)?.username ?? 'Unavailable account';
  }

  function stage() {
    const start = new Date(starts).getTime() / 1000;
    const end = new Date(ends).getTime() / 1000;
    if (!substitute || !Number.isFinite(start) || !Number.isFinite(end) ||
        end <= start || end <= Date.now() / 1000) {
      task.setNotice('Choose a substitute and valid start/end times; the end must be in the future.');
      return;
    }
    setPending({ action: 'create', substitute, start, end });
  }

  async function confirm() {
    if (!pending) return;
    if (pending.action === 'create') {
      await api('/delegations', 'POST', {
        substitute_id: pending.substitute,
        starts_at: pending.start,
        ends_at: pending.end,
      });
    } else {
      await api('/delegations/' + encodeURIComponent(pending.id) + '/revoke', 'POST');
    }
    setPending(null);
    await load();
    task.setNotice('Delegation change recorded in the audit trail.');
  }

  const now = Date.now() / 1000;
  return <div className="grant-stack">
    {task.feedback}
    <Card title="Delegate my approvals" description="A substitute may decide on your behalf only within the scheduled window. Their identity and the original assigned approver remain auditable.">
      <Form label="Review delegation" busy={task.busy} onSubmit={stage}>
        <Select label="Substitute approver" value={substitute} onChange={(value) => { setSubstitute(value); setPending(null); }}>
          <option value="">Choose a team member</option>
          {directory.map((person) => <option key={person.id} value={person.id}>{person.username}</option>)}
        </Select>
        <TextField label="Starts at" type="datetime-local" required value={starts} onChange={(event) => { setStarts(event.target.value); setPending(null); }} />
        <TextField label="Ends at" type="datetime-local" required value={ends} onChange={(event) => { setEnds(event.target.value); setPending(null); }} />
      </Form>
    </Card>
    <Card title="Scheduled and previous delegations" description="Revoking a delegation immediately removes the substitute's ability to act. Existing decisions are not erased.">
      <div className="grant-table-scroll"><table className="grant-table">
        <thead><tr><th>From → To</th><th>Window</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{records.map((row) => {
          const status = row.revoked_at != null ? 'Revoked' : row.ends_at <= now ? 'Expired' : row.starts_at > now ? 'Scheduled' : 'Active';
          return <tr key={row.id}>
            <td>{nameOf(row.delegator_id)} → {nameOf(row.substitute_id)}</td>
            <td>{when(row.starts_at)} – {when(row.ends_at)}</td>
            <td>{status}</td>
            <td>{row.revoked_at == null && row.ends_at > now && (row.delegator_id === user.id || user.role === 'admin')
              ? <Button variant="secondary" disabled={task.busy} onClick={() => setPending({ action: 'revoke', id: row.id })}>Revoke</Button> : '—'}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {!records.length && <p>No delegations have been scheduled.</p>}
      <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>Refresh</Button>
    </Card>
    {pending && <Alert tone="warning" title={pending.action === 'create' ? 'Confirm time-bounded delegation' : 'Confirm delegation revocation'}>
      <p>{pending.action === 'create'
        ? 'Delegate to ' + nameOf(pending.substitute) + ' from ' + when(pending.start) + ' through ' + when(pending.end) + '. This does not approve existing requests.'
        : 'Immediately revoke this delegation. Decisions already recorded stay in the audit trail.'}</p>
      <div className="grant-actions">
        <Button disabled={task.busy} onClick={() => void task.run(confirm)}>Confirm delegation change</Button>
        <Button disabled={task.busy} variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
      </div>
    </Alert>}
  </div>;
}
