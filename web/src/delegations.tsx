import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, useTask } from './common';
import { DelegationWorklist } from './delegation_worklist';
import type { User } from './types';
import {
  createDelegationAttemptGuard,
  DelegationReviewConfirmation,
  isCurrentDelegationCreateReview,
  prepareDelegationCreateReview,
  prepareDelegationRevokeReview,
  submitReviewedDelegationChange,
  verifyDelegationChangeReceipt,
  type DelegationReview,
  type DelegationRow,
  type DirectoryMember,
} from './delegation_review';

function localDateTime(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 3600_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function Delegations({ user }: { user: User }) {
  const task = useTask();
  const [directory, setDirectory] = useState<DirectoryMember[]>([]);
  const [records, setRecords] = useState<DelegationRow[]>([]);
  const [substitute, setSubstitute] = useState('');
  const [starts, setStarts] = useState(() => localDateTime(0));
  const [ends, setEnds] = useState(() => localDateTime(8));
  const [pending, setPending] = useState<DelegationReview | null>(null);
  const [mustReconcile, setMustReconcile] = useState(false);
  const delegationGuard = useRef(createDelegationAttemptGuard());

  async function load() {
    const [people, delegations] = await Promise.all([
      api<DirectoryMember[]>('/approvers/directory'),
      api<DelegationRow[]>('/delegations'),
    ]);
    setDirectory(people);
    setRecords(delegations);
  }
  useEffect(() => { void task.run(load); }, []);

  function stage() {
    if (delegationGuard.current.blocked()) return;
    const start = new Date(starts).getTime() / 1000;
    const end = new Date(ends).getTime() / 1000;
    try {
      setPending(prepareDelegationCreateReview(
        user,directory,substitute,start,end,Date.now()/1000,
      ));
    } catch {
      setPending(null);
      task.setNotice('Choose a different, available substitute and a valid start/end window in the future.');
    }
  }

  function reviewRevoke(row: DelegationRow) {
    if (delegationGuard.current.blocked()) return;
    try {
      setPending(prepareDelegationRevokeReview(user,row,Date.now()/1000));
    } catch {
      setPending(null);
      task.setNotice('This delegation is no longer revocable in the current role and time window. Refresh before trying again.');
    }
  }

  function reviewCurrent(intent: DelegationReview|null): boolean {
    if (!intent || delegationGuard.current.blocked() || intent.actorId!==user.id) return false;
    if (intent.kind==='create') return isCurrentDelegationCreateReview(
      intent,user,directory,substitute,
      new Date(starts).getTime()/1000,new Date(ends).getTime()/1000,Date.now()/1000,
    );
    const current=records.find(row=>row.id===intent.source.id);
    try {
      return current!=null && JSON.stringify(
        prepareDelegationRevokeReview(user,current,Date.now()/1000),
      )===JSON.stringify(intent);
    } catch { return false; }
  }

  async function confirm() {
    const reviewed=pending;
    if (!reviewed || !reviewCurrent(reviewed)) {
      setPending(null);
      throw new Error('DELEGATION_CHANGED_REVIEW_REQUIRED');
    }
    if (delegationGuard.current.blocked()) return;
    setPending(null);
    let effectAttempted=false;
    try {
      const result=await submitReviewedDelegationChange(
        reviewed,delegationGuard.current,
        async()=> reviewed.kind==='create'
          ? { directory:await api<DirectoryMember[]>('/approvers/directory'),
              records:[] }
          : { directory:[],records:await api<DelegationRow[]>('/delegations') },
        (intent)=>{
          effectAttempted=true;
          setMustReconcile(true);
          return intent.kind==='create'
            ? api<DelegationRow>('/delegations','POST',{
                substitute_id:intent.substituteId,
                starts_at:intent.startsAt,ends_at:intent.endsAt,
              })
            : api<DelegationRow>('/delegations/'+encodeURIComponent(intent.source.id)
                +'/revoke','POST');
        },
        Date.now()/1000,
      );
      if (!result) return;
      verifyDelegationChangeReceipt(reviewed,result);
    } catch(error){
      // A failed pre-POST read can be reviewed again. A possible
      // delegation creation/revocation stays latched until explicit Refresh.
      if (effectAttempted) setMustReconcile(true);
      throw error;
    }
    try {
      await load();
      task.setNotice('Delegation change confirmed by the server. Its decision history remains auditable; refresh before another change.');
    } catch {
      task.setNotice('Delegation write confirmed, but current records were not refreshed. Check the history before another change; no automatic retry.');
    }
  }

  async function refreshAfterChange() {
    await load();
    if (!delegationGuard.current.readSucceeded()) {
      throw new Error('DELEGATION_CHANGE_STILL_IN_FLIGHT');
    }
    setMustReconcile(false);
    setPending(null);
    task.setNotice('Current delegation records refreshed. Review any new change separately.');
  }

  const now = Date.now() / 1000;
  return <div className="grant-stack">
    {task.feedback}
    {delegationGuard.current.blocked() && (
      <Alert tone="warning" title="Reconcile delegation change">
        {mustReconcile
          ? 'A delegation creation or revocation POST may have committed.'
          : 'A delegation change was submitted.'}
        {' '}Inspect current role-scoped records before scheduling or revoking again.
        The client will not retry an uncertain write.
        <Button variant="secondary" disabled={task.busy}
          onClick={() => void task.run(refreshAfterChange)}>
          Refresh delegations
        </Button>
      </Alert>
    )}
    <DelegationWorklist
      rows={records} nowSeconds={now} user={user} directory={directory}
      busy={task.busy || delegationGuard.current.blocked()}
      onReviewRevoke={reviewRevoke}
      onRefresh={() => { void task.run(refreshAfterChange); }}
    />
    <Card title="Delegate my approvals" description="A substitute may decide on your behalf only within the scheduled window. Their identity and the original assigned approver remain auditable.">
      <Form label="Review delegation" busy={task.busy || delegationGuard.current.blocked()} onSubmit={stage}>
        <Select label="Substitute approver" value={substitute} onChange={(value) => { setSubstitute(value); setPending(null); }}>
          <option value="">Choose a team member</option>
          {directory.map((person) => <option key={person.id} value={person.id}>{person.username}</option>)}
        </Select>
        <TextField label="Starts at" type="datetime-local" required value={starts} onChange={(event) => { setStarts(event.target.value); setPending(null); }} />
        <TextField label="Ends at" type="datetime-local" required value={ends} onChange={(event) => { setEnds(event.target.value); setPending(null); }} />
      </Form>
    </Card>
    <DelegationReviewConfirmation
      review={pending}
      valid={reviewCurrent(pending)}
      busy={task.busy || delegationGuard.current.blocked()}
      actor={user}
      directory={directory}
      onCancel={() => setPending(null)}
      onConfirm={() => { void task.run(confirm); }}
    />
  </div>;
}
