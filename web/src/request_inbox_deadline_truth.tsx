import { when } from './common';
import type { RequestRow } from './types';

/** Deadline and escalation are server-projected historical facts.
 * Do not calculate "overdue" from a browser clock: an approved grant
 * can expire after a completed human decision.
 */
export function InboxDeadlineTruth({row}:{row:RequestRow}){
  const available=Number.isFinite(row.deadline)&&row.deadline>0;
  const pending=row.state==='AWAITING'||row.state==='HELD';
  const dueEscalation=pending&&row.overdue===true;
  return <div aria-label="Decision deadline and authoritative approval status">
    <span>{available?when(row.deadline):'Decision deadline unavailable'}</span>
    {dueEscalation&&<small>Escalation due — human decision still outstanding</small>}
    {!dueEscalation&&row.state==='EXPIRED'&&row.decision===null&&
      <small>Approval expired without a decision</small>}
    {row.state==='EXPIRED'&&row.decision==='APPROVED'&&
      <small>Grant expired after approval — not an overdue approval</small>}
    {row.state==='APPROVED'&&row.decision==='APPROVED'&&
      <small>Human decision complete; reported execution is separate</small>}
    {row.escalation?.fired_at!=null&&<small>Escalation recorded</small>}
  </div>;
}
