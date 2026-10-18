import {Button, Card} from '@datarelay-labs/foundation';
import {InboxApprovalProgress} from './request_inbox_task_worklist';
import {State,when} from './common';
import type {RequestRow} from './types';

/** Entra-style selected task context, projected ONLY from the already-loaded
 * role-scoped request worklist. This never re-fetches a wider list, mutates
 * approval state, or confuses reporting with verified external execution.
 */
export type InboxPreviewSelection={query:string;requestId:string};

export function currentSelectedInboxRequest(
  selected:InboxPreviewSelection|null,
  rows:readonly RequestRow[],
  currentQuery:string,
  loading:boolean,
):RequestRow|null{
  if(!selected||loading||!currentQuery||selected.query!==currentQuery
    ||!/^[a-f0-9-]{36}$/.test(selected.requestId))return null;
  return rows.find(row=>row?.id===selected.requestId
    &&typeof row.title==='string'
    &&typeof row.action?.kind==='string'
    &&typeof row.action?.target==='string')??null;
}

export function InboxSelectedRequestPreview({
  row,onOpen,onClose,
}:{
  row:RequestRow;onOpen:()=>void;onClose:()=>void;
}){
  return <aside role="region" aria-label="Selected request context"
    className="grant-inbox-context">
    <Card title="Selected request context"
      description="Preview of the current role-visible worklist row. Opening details never records a decision.">
      <p><strong>{row.title}</strong></p>
      <dl className="grant-facts">
        <dt>External request</dt><dd>{row.external_id||'—'}</dd>
        <dt>Requester</dt><dd>{row.requester_id||'Unavailable'}</dd>
        <dt>Exact action</dt><dd><code>{row.action.kind}</code></dd>
        <dt>Target</dt><dd><code>{row.action.target}</code></dd>
        <dt>Reason</dt><dd>{row.reason||'No reason provided'}</dd>
        <dt>Submitted</dt><dd>{when(row.created_at)}</dd>
        <dt>Human decision deadline</dt><dd>{when(row.deadline)}</dd>
        <dt>Human decision</dt><dd><State value={row.state}/></dd>
        <dt>Approval seats</dt><dd><InboxApprovalProgress row={row}/></dd>
        {row.approval_progress?.group_name&&<>
          <dt>Approver group</dt><dd>{row.approval_progress.group_name}</dd>
        </>}
        <dt>Callback delivery</dt><dd><State value={row.delivery_state}/>
          <small>Transport only; inbox receipt is not verified.</small></dd>
        <dt>External execution</dt><dd><State value={row.execution_state}/>
          <small>Executor-reported state only: reported, not independently verified.</small></dd>
      </dl>
      <p>Review the full request's current seat, policy snapshot and
        activity before choosing a human decision. Approval does not
        execute the external business operation.</p>
      <div className="grant-actions">
        <Button onClick={onOpen}>Open full request</Button>
        <Button variant="secondary" onClick={onClose}>Close preview</Button>
      </div>
    </Card>
  </aside>;
}
