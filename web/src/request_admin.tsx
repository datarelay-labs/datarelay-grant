import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask } from './common';
import type { ApproverGroup, RequestRow } from './types';

type Pending =
  | { kind: 'escalation'; target: string; afterSeconds: number }
  | { kind: 'reassignment'; from: string; to: string; reason: string; revision: number };

export function RequestAdminControls({ row, onReload }: { row: RequestRow; onReload: () => Promise<void> }) {
  const task = useTask();
  const [users, setUsers] = useState<AccountProjection[]>([]);
  const [groups, setGroups] = useState<ApproverGroup[]>([]);
  const [target, setTarget] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    void task.run(async () => {
      const [accounts, approvalGroups] = await Promise.all([
        api<AccountProjection[]>('/admin/users'),
        api<ApproverGroup[]>('/approver-groups'),
      ]);
      setUsers(accounts.filter((account) => account.status === 'enabled'));
      setGroups(approvalGroups.filter((group) => group.enabled));
    });
  }, []);

  const members = row.approval_plan?.members ?? [row.approver_id];
  const undecidedMembers = members.filter((id) => !(row.decisions ?? []).some((decision) => decision.actor_id === id));
  const labelOf = (id: string) => users.find((person) => person.id === id)?.displayName ?? 'Unknown member';

  function stageEscalation() {
    const afterSeconds = Number(minutes) * 60;
    if (!target || !Number.isInteger(afterSeconds) || afterSeconds < 60 || afterSeconds > 604800) {
      task.setNotice('Select a target and an escalation delay between 1 and 10080 minutes.');
      return;
    }
    setPending({ kind: 'escalation', target, afterSeconds });
  }

  function stageReassignment() {
    if (!from || !to || from === to || !reason.trim()) {
      task.setNotice('Choose different approvers and provide an audit reason.');
      return;
    }
    setPending({ kind: 'reassignment', from, to, reason: reason.trim(), revision: row.revision });
  }

  async function confirm() {
    if (!pending) return;
    if (pending.kind === 'escalation') {
      const [kind, id] = pending.target.split(':', 2);
      await api('/requests/' + encodeURIComponent(row.id) + '/escalation', 'POST', {
        ...(kind === 'group' ? { target_group_id: id } : { target_user_id: id }),
        after_seconds: pending.afterSeconds,
      });
    } else {
      await api('/requests/' + encodeURIComponent(row.id) + '/reassign', 'POST', {
        from_approver_id: pending.from,
        to_approver_id: pending.to,
        reason: pending.reason,
        expected_revision: pending.revision,
      });
    }
    setPending(null);
    await onReload();
    task.setNotice('Approval routing updated and recorded in the request audit trail.');
  }

  return <div className="grant-stack">
    {task.feedback}
    <Card title="Escalation" description="Schedule additional approvers after a delay measured from request creation, if it is still waiting. A previous schedule will be replaced.">
      <Form label="Review escalation" busy={task.busy} onSubmit={stageEscalation}>
        <Select label="Escalation target" value={target} onChange={(value) => { setTarget(value); setPending(null); }}>
          <option value="">Choose an enabled person or group</option>
          {users.filter((person) => person.id !== row.requester_id).map((person) =>
            <option key={person.id} value={'user:' + person.id}>{person.displayName}</option>)}
          {groups.map((group) => <option key={group.id} value={'group:' + group.id}>Group: {group.name}</option>)}
        </Select>
        <TextField label="Escalation delay (minutes)" type="number" min={1} max={10080} step={1} required value={minutes} onChange={(event) => { setMinutes(event.target.value); setPending(null); }} />
      </Form>
    </Card>
    <Card title="Reassign approver" description="Replace an assigned approver who has not recorded a decision. Previous decisions and the immutable requested action are preserved.">
      <Form label="Review reassignment" busy={task.busy} onSubmit={stageReassignment}>
        <Select label="Original approver" value={from} onChange={(value) => { setFrom(value); setPending(null); }}>
          <option value="">Choose assigned approver</option>
          {undecidedMembers.map((id) => <option key={id} value={id}>{labelOf(id)}</option>)}
        </Select>
        <Select label="Replacement approver" value={to} onChange={(value) => { setTo(value); setPending(null); }}>
          <option value="">Choose enabled replacement</option>
          {users.filter((person) => person.id !== row.requester_id && !members.includes(person.id)).map((person) =>
            <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </Select>
        <TextArea label="Reassignment reason for audit" value={reason} onChange={(value) => { setReason(value); setPending(null); }} required />
      </Form>
    </Card>
    {pending && <Alert tone="warning" title={pending.kind === 'escalation' ? 'Confirm escalation schedule' : 'Confirm approver reassignment'}>
      {pending.kind === 'escalation'
        ? <p>Add {pending.target.startsWith('group:') ? 'group' : 'person'} approvers after {pending.afterSeconds / 60} minutes from request creation. {row.created_at + pending.afterSeconds <= Date.now() / 1000 ? 'This delay has already elapsed; escalation may apply on the next maintenance cycle. ' : ''}This never executes the action.</p>
        : <p>Replace {labelOf(pending.from)} with {labelOf(pending.to)} at revision {pending.revision}. Previous audit records remain intact.</p>}
      <div className="grant-actions">
        <Button disabled={task.busy} onClick={() => void task.run(confirm)}>Confirm routing change</Button>
        <Button disabled={task.busy} variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
      </div>
    </Alert>}
  </div>;
}
