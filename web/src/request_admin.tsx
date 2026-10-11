import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask } from './common';
import type { ApproverGroup, RequestRow } from './types';
import {
  isCurrentAdminRoutingIntent, submitReviewedRequestRouting,
  type AdminRoutingIntent, type EscalationReceipt,
} from './request_routing_receipt';

export type EscalationReview = {
  kind: 'escalation'; target: string; afterSeconds: number; revision: number;
};

// A reviewed routing confirmation is bound to the exact server request revision.
export function prepareEscalationUpdate(review: EscalationReview, currentRevision: number) {
  if (!Number.isSafeInteger(review.revision) || review.revision < 1 ||
      review.revision !== currentRevision) {
    throw new Error('ROUTING_CHANGED_REVIEW_REQUIRED');
  }
  const [kind, id] = review.target.split(':', 2);
  if ((kind !== 'group' && kind !== 'user') || !id ||
      !Number.isSafeInteger(review.afterSeconds) ||
      review.afterSeconds < 60 || review.afterSeconds > 604800) {
    throw new Error('ESCALATION_DRAFT_INVALID');
  }
  return {
    ...(kind === 'group' ? { target_group_id: id } : { target_user_id: id }),
    after_seconds: review.afterSeconds,
    expected_revision: review.revision,
  };
}

export function RequestAdminControls({
  row, onReload, onRecorded, onReadbackUnavailable,
}: {
  row: RequestRow;
  onReload: () => Promise<void>;
  onRecorded: (updated: RequestRow) => void;
  onReadbackUnavailable: () => void;
}) {
  const task = useTask();
  const [users, setUsers] = useState<AccountProjection[]>([]);
  const [groups, setGroups] = useState<ApproverGroup[]>([]);
  const [target, setTarget] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<AdminRoutingIntent | null>(null);
  const [attempted, setAttempted] = useState(false);
  // A synchronous one-shot guard protects against two rapid clicks before
  // React's busy rendering catches up. Never automatically retry a POST.
  const submissionAttempted = useRef(false);
  useEffect(() => {
    submissionAttempted.current = false;
    setAttempted(false);
    setPending(null);
  }, [row.id, row.revision]);

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
    if (submissionAttempted.current) return;
    setPending({
      kind: 'escalation', target, afterSeconds, revision: row.revision,
      requestId: row.id, actionHash: row.action_hash,
    });
  }

  function stageReassignment() {
    if (!from || !to || from === to || !reason.trim()) {
      task.setNotice('Choose different approvers and provide an audit reason.');
      return;
    }
    if (submissionAttempted.current) return;
    setPending({
      kind: 'reassignment', from, to, reason: reason.trim(), revision: row.revision,
      requestId: row.id, actionHash: row.action_hash,
    });
  }

  async function confirm() {
    const reviewed = pending;
    if (!reviewed || submissionAttempted.current) return;
    if (!isCurrentAdminRoutingIntent(reviewed, row)) {
      setPending(null);
      throw new Error('ROUTING_CHANGED_REVIEW_REQUIRED');
    }
    submissionAttempted.current = true;
    setAttempted(true);
    setPending(null);
    // The POST result is the durable effect. Never make an optional later
    // GET failure look like a failed escalation or reassignment.
    const result = await submitReviewedRequestRouting(
      reviewed, row,
      (intent) => api<EscalationReceipt>(
        '/requests/' + encodeURIComponent(intent.requestId) + '/escalation',
        'POST', prepareEscalationUpdate(intent, row.revision),
      ),
      (payload) => api<RequestRow>(
        '/requests/' + encodeURIComponent(reviewed.requestId) + '/reassign',
        'POST', payload,
      ),
      () => api<RequestRow>('/requests/' + encodeURIComponent(reviewed.requestId)),
    );
    if (result.status === 'updated') {
      onRecorded(result.row);
      submissionAttempted.current = false;
      setAttempted(false);
      task.setNotice('Approval routing recorded. Changes to assigned reviewers do not execute the requested action.');
    } else {
      onReadbackUnavailable();
    }
  }

  async function reloadAfterAttempt() {
    await onReload();
    submissionAttempted.current = false;
    setAttempted(false);
  }

  return <div className="grant-stack">
    {task.feedback}
    {attempted && <Alert tone="warning" title="Routing outcome must be refreshed">
      A routing write was attempted. Review the current request before any
      further escalation or approver reassignment. An ambiguous write is never retried.
      <Button variant="secondary" disabled={task.busy}
        onClick={() => void task.run(reloadAfterAttempt)}>Refresh request</Button>
    </Alert>}
    <Card title="Escalation" description="Schedule additional approvers after a delay measured from request creation, if it is still waiting. A previous schedule will be replaced.">
      <Form label="Review escalation" busy={task.busy || attempted} onSubmit={stageEscalation}>
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
      <Form label="Review reassignment" busy={task.busy || attempted} onSubmit={stageReassignment}>
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
    {pending && !attempted && <Alert tone="warning" title={pending.kind === 'escalation' ? 'Confirm escalation schedule' : 'Confirm approver reassignment'}>
      <p><strong>Exact request:</strong> {row.action.kind} · {row.action.target} · revision {pending.revision}. Routing changes eligible reviewers only, not the requested action.</p>
      {pending.kind === 'escalation'
        ? <p>Add {pending.target.startsWith('group:') ? 'group' : 'person'} approvers after {pending.afterSeconds / 60} minutes from request creation, reviewing request revision {pending.revision}. {row.created_at + pending.afterSeconds <= Date.now() / 1000 ? 'This delay has already elapsed; escalation may apply on the next maintenance cycle. ' : ''}This never executes the action.</p>
        : <p>Replace {labelOf(pending.from)} with {labelOf(pending.to)} at revision {pending.revision}. Previous audit records remain intact.</p>}
      <div className="grant-actions">
        <Button disabled={task.busy} onClick={() => void task.run(confirm)}>Confirm routing change</Button>
        <Button disabled={task.busy} variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
      </div>
    </Alert>}
  </div>;
}
