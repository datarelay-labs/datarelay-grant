import { Button, Card } from '@datarelay-labs/foundation';
import { when } from './common';
import './delegation-mobile.css';
import type { DelegationRow, DirectoryMember } from './delegation_review';
import type { User } from './types';

/** Presentation-only split of the exact role-scoped delegated-approval
 * ledger. No synthetic revoke authority or optimistic approval is created.
 */
export function partitionDelegationsForWork(
  rows:readonly DelegationRow[],nowSeconds:number,
):{current:DelegationRow[];history:DelegationRow[]}{
  const current=rows.filter(row=>row.revoked_at===null&&row.ends_at>nowSeconds)
    .sort((a,b)=>(a.starts_at>nowSeconds?1:0)-(b.starts_at>nowSeconds?1:0)
      ||a.ends_at-b.ends_at||a.id.localeCompare(b.id));
  const history=rows.filter(row=>row.revoked_at!==null||row.ends_at<=nowSeconds)
    .sort((a,b)=>b.ends_at-a.ends_at||a.id.localeCompare(b.id));
  return {current,history};
}

function status(row:DelegationRow,now:number){
  return row.revoked_at!==null?'Revoked'
    :row.ends_at<=now?'Expired'
    :row.starts_at>now?'Scheduled':'Active';
}

export function DelegationWorklist({
  rows,nowSeconds,user,directory,busy,onReviewRevoke,onRefresh,
}:{
  rows:readonly DelegationRow[];
  nowSeconds:number;user:Pick<User,'id'|'username'|'role'>;
  directory:readonly DirectoryMember[];
  busy:boolean;
  onReviewRevoke:(row:DelegationRow)=>void;
  onRefresh:()=>void;
}){
  const {current,history}=partitionDelegationsForWork(rows,nowSeconds);
  const nameOf=(id:string)=>id===user.id?user.username
    :directory.find(row=>row.id===id)?.username??'Unavailable account';
  const activeCount=current.filter(row=>row.starts_at<=nowSeconds).length;
  const scheduledCount=current.length-activeCount;
  const rowsTable=(records:readonly DelegationRow[],allowActions:boolean)=>(
    <>
    <div className="grant-table-scroll grant-delegation-desktop-list">
      <table className="grant-table">
        <thead><tr><th>From → To</th><th>Window</th><th>Status</th>
          <th>Action</th></tr></thead>
        <tbody>{records.map(row=>(
          <tr key={row.id}>
            <td>{nameOf(row.delegator_id)} → {nameOf(row.substitute_id)}</td>
            <td>{when(row.starts_at)} – {when(row.ends_at)}</td>
            <td>{status(row,nowSeconds)}</td>
            <td>{allowActions&&(row.delegator_id===user.id||user.role==='admin')
              ? <Button variant="secondary" disabled={busy}
                  onClick={()=>onReviewRevoke(row)}>Review revoke</Button>
              : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
    {/* Mobile cards reflect exactly the same current/history partition and
        role-scoped revoke authority. No extra delegation API call exists. */}
    <ul className="grant-delegation-mobile-list"
      aria-label={allowActions ? 'Current delegations mobile list'
        : 'Previous delegations mobile list'}>
      {records.map((row) => (
        <li key={row.id} className="grant-delegation-mobile-card">
          <div className="grant-delegation-mobile-heading">
            <strong>{nameOf(row.delegator_id)} → {nameOf(row.substitute_id)}</strong>
            <span className="grant-delegation-mobile-status">
              {status(row,nowSeconds)}
            </span>
          </div>
          <dl className="grant-delegation-mobile-facts">
            <div><dt>Starts</dt><dd>{when(row.starts_at)}</dd></div>
            <div><dt>Ends</dt><dd>{when(row.ends_at)}</dd></div>
            <div><dt>Original approver</dt>
              <dd>{nameOf(row.delegator_id)}</dd></div>
            <div><dt>Substitute</dt>
              <dd>{nameOf(row.substitute_id)}</dd></div>
          </dl>
          {allowActions&&(row.delegator_id===user.id||user.role==='admin')
            ? <div className="grant-delegation-mobile-actions">
                <Button variant="secondary" disabled={busy}
                  onClick={()=>onReviewRevoke(row)}>Review revoke</Button>
              </div>
            : null}
        </li>
      ))}
    </ul>
    </>
  );
  return (
    <div className="grant-stack">
      <Card title="Active and scheduled delegations"
        description="See current and upcoming substitute approval windows first. Revocation is a separate reviewed action.">
        <p aria-live="polite">{activeCount} Active · {scheduledCount} Scheduled</p>
        {current.length ? rowsTable(current,true)
          : <p>No active or scheduled delegations.</p>}
        <Button variant="secondary" disabled={busy} onClick={onRefresh}>Refresh</Button>
      </Card>
      <details>
        <summary>Previous delegations ({history.length})</summary>
        <section aria-label="Previous delegation history">
          <p>Expired and revoked windows are retained as read-only history.
            Recorded approval decisions are not deleted.</p>
          {history.length?rowsTable(history,false)
            :<p>No previous delegations.</p>}
        </section>
      </details>
    </div>
  );
}
