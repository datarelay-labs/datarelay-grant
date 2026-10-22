import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, useTask } from './common';
import { DelegationWorklist } from './delegation_worklist';
import { registerGrantNavigationBlocker,type GrantNavigationIntent } from './grant_navigation';
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

/** A verified server receipt is not an ambiguous POST. Retain the explicit
 * refresh lock without misleading operators about an already confirmed write. */
export function delegationReconciliationCopy(confirmed: boolean, uncertain: boolean): {
  title: string; message: string;
} {
  if (confirmed) return {
    title: 'Refresh after confirmed delegation change',
    message: 'The server confirmed this delegation change. Refresh delegations and review current saved records before scheduling or revoking another delegation. No automatic retry occurs.',
  };
  return {
    title: 'Reconcile delegation change',
    message: uncertain
      ? 'A delegation creation or revocation POST may have committed. Inspect current role-scoped records before scheduling or revoking again. The client will not retry an uncertain write.'
      : 'A delegation change was submitted. Inspect current role-scoped records before scheduling or revoking again. The client will not retry an uncertain write.',
  };
}

/** Draft state is local only until the explicit delegation Review → Confirm. */
export function isDelegationDraftDirty(
  initial:{starts:string;ends:string},substitute:string,
  starts:string,ends:string,hasPendingReview:boolean,
):boolean {
  return substitute!=='' || starts!==initial.starts || ends!==initial.ends || hasPendingReview;
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
  const [confirmedChange, setConfirmedChange] = useState(false);
  const delegationGuard = useRef(createDelegationAttemptGuard());
  const initialWindow = useRef({starts,ends});
  const [pendingExit,setPendingExit] = useState(false);
  const navigationIntent = useRef<GrantNavigationIntent|null>(null);
  const exitOrigin = useRef<HTMLElement|null>(null);
  const exitPrompt = useRef<HTMLDivElement|null>(null);
  const draftDirty = isDelegationDraftDirty(
    initialWindow.current,substitute,starts,ends,pending!==null,
  );
  useEffect(()=>{
    return registerGrantNavigationBlocker(intent=>{
      // Never dismiss an in-flight or uncertain one-shot delegation mutation.
      if(task.busy||delegationGuard.current.blocked()||mustReconcile){
        task.setNotice('Refresh and reconcile the delegation change before navigating. Do not submit again.');
        return true;
      }
      if(!draftDirty)return false;
      exitOrigin.current=document.activeElement as HTMLElement|null;
      navigationIntent.current=intent;
      setPendingExit(true);
      return true;
    });
  },[draftDirty,task.busy,mustReconcile]);
  useEffect(()=>{
    if(!(draftDirty||task.busy||mustReconcile))return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[draftDirty,task.busy,mustReconcile]);
  useEffect(()=>{
    if(pendingExit){
      exitPrompt.current?.querySelector<HTMLButtonElement>('[data-delegation-keep-editing]')?.focus();
    }
  },[pendingExit]);
  function cancelPendingExit(){
    navigationIntent.current?.cancel();
    navigationIntent.current=null;
    setPendingExit(false);
  }
  function keepEditing(){
    cancelPendingExit();
    requestAnimationFrame(()=>exitOrigin.current?.focus());
  }
  function discardAndLeave(){
    if(!pendingExit||task.busy||delegationGuard.current.blocked()||mustReconcile)return;
    const intent=navigationIntent.current;
    navigationIntent.current=null;
    setPendingExit(false);
    setPending(null);
    setSubstitute('');
    setStarts(initialWindow.current.starts);
    setEnds(initialWindow.current.ends);
    intent?.proceed();
  }
  function invalidatePendingExit(){
    if(pendingExit)cancelPendingExit();
  }

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
    invalidatePendingExit();
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
    invalidatePendingExit();
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
      setConfirmedChange(true);
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
    setConfirmedChange(false);
    setPending(null);
    task.setNotice('Current delegation records refreshed. Review any new change separately.');
  }

  const now = Date.now() / 1000;
  const reconciliation = delegationReconciliationCopy(confirmedChange,mustReconcile);
  return <div className="grant-stack">
    {task.feedback}
    {pendingExit && <div ref={exitPrompt} role="alertdialog"
      aria-label="Discard unsaved delegation changes?"
      onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();keepEditing();}
      }}>
      <Alert tone="warning" title="Discard unsaved delegation changes?">
        <p>Your substitute selection, schedule, or unconfirmed delegation review
          will be lost if you leave. Keep editing or explicitly discard this local
          draft. No delegation will be created or revoked by either choice.</p>
        <div className="grant-actions">
          <Button type="button" variant="secondary" data-delegation-keep-editing
            onClick={keepEditing}>Keep editing</Button>
          <Button type="button" disabled={task.busy||delegationGuard.current.blocked()||mustReconcile}
            onClick={discardAndLeave}>Discard and leave</Button>
        </div>
      </Alert>
    </div>}
    {delegationGuard.current.blocked() && (
      <Alert tone="warning" title={reconciliation.title}>
        {reconciliation.message}
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
        <Select label="Substitute approver" value={substitute} onChange={(value) => { invalidatePendingExit();setSubstitute(value);setPending(null); }}>
          <option value="">Choose a team member</option>
          {directory.map((person) => <option key={person.id} value={person.id}>{person.username}</option>)}
        </Select>
        <TextField label="Starts at" type="datetime-local" required value={starts} onChange={(event) => { invalidatePendingExit();setStarts(event.target.value);setPending(null); }} />
        <TextField label="Ends at" type="datetime-local" required value={ends} onChange={(event) => { invalidatePendingExit();setEnds(event.target.value);setPending(null); }} />
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
