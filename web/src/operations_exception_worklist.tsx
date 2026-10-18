import {Button,Card} from '@datarelay-labs/foundation';
import './operations-exceptions-mobile.css';

const catalog=[
  {
    key:'delivery_failed',
    title:'Delivery failed',
    task:'Review the exact request and transport failure. Transport acceptance is not mailbox receipt or external execution.',
  },
  {
    key:'approved_unused',
    title:'Approved, not consumed',
    task:'Inspect the approved exact-action grant before expiry. Approval never automatically executes the requested operation.',
  },
  {
    key:'execution_unknown',
    title:'Execution unknown',
    task:'Reconcile the reported executor status and request evidence. The external business effect is not independently verified.',
  },
  {
    key:'execution_failed',
    title:'Execution failed',
    task:'Inspect the reported execution failure. A reported failure is not a verified external rollback or safe retry.',
  },
  {
    key:'expired',
    title:'Approval expired',
    task:'Review the expired approval deadline. A new explicit request is required when the original authorization is no longer valid.',
  },
] as const;
export type OperationsExceptionKey=typeof catalog[number]['key'];
type Counts=Partial<Record<OperationsExceptionKey,number>>;
export type OperationsExceptionRow={
  key:OperationsExceptionKey;queue:OperationsExceptionKey;
  title:string;task:string;count:number|null;
};
/** Only server-defined exception categories exist here. Invalid or absent
 * metrics are unknown, never a healthy or zero-result claim.
 */
export function buildOperationsExceptionRows(
  counts:Counts|null|undefined,
):OperationsExceptionRow[]{
  return catalog.map(item=>{
    const count=counts?.[item.key];
    return {
      ...item,queue:item.key,
      count:typeof count==='number'&&Number.isSafeInteger(count)&&count>=0
        ?count:null,
    };
  });
}
/** One read-only task first worklist, not a KPI/NOC status dashboard.
 * Selection opens the existing administrator-authorized exact queue; no
 * request, email, credential or external executor write occurs here.
 */
export function OperationsExceptionWorklist({
  counts,onOpen,
}:{
  counts:Counts|null|undefined;
  onOpen:(key:OperationsExceptionKey)=>void;
}){
  const rows=buildOperationsExceptionRows(counts);
  return <section aria-label="Exceptions to resolve" className="grant-stack">
    <Card title="Exceptions to resolve"
      description="Review the exact role-scoped request queue before choosing a response. This worklist never retries execution, resends email or records approval.">
      {!counts&&<p role="status">Waiting for current administrator-scoped snapshot.
        No empty or healthy state is assumed.</p>}
      <div className="grant-table-scroll grant-exceptions-desktop-list">
        <table className="grant-table" aria-label="Approval and execution exceptions">
          <thead><tr>
            <th scope="col">Exception</th>
            <th scope="col">Affected requests</th>
            <th scope="col">Operator next step</th>
            <th scope="col">Source queue</th>
          </tr></thead>
          <tbody>{rows.map(row=><tr key={row.key}>
            <th scope="row">{row.title}</th>
            <td>{row.count===null?'Unavailable'
              :row.count===0?'No matching requests'
              :row.count+' affected'}</td>
            <td>{row.task}</td>
            <td><Button variant="secondary" disabled={!counts}
              onClick={()=>onOpen(row.queue)}>
                Open {row.title} queue
              </Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {/* The identical server-categorized tasks and exact queue callbacks.
          Unknown counts stay unavailable, never a falsely healthy zero. */}
      <ul className="grant-exceptions-mobile-list"
        aria-label="Approval and execution exceptions mobile list">
        {rows.map((row) => (
          <li key={row.key} className="grant-exceptions-mobile-card">
            <div className="grant-exceptions-mobile-heading">
              <strong>{row.title}</strong>
              <span>{row.count===null ? 'Unavailable'
                :row.count===0 ? 'No matching requests'
                :row.count+' affected'}</span>
            </div>
            <p>{row.task}</p>
            <Button variant="secondary" disabled={!counts}
              onClick={() => onOpen(row.queue)}>
              Open {row.title} queue
            </Button>
          </li>
        ))}
      </ul>
      <p>These figures are request counts from the current server snapshot.
        A transport delivery report or an executor-reported result is
        not independently verified evidence of an external business effect.
        Review the request history before any separately authorized action.</p>
    </Card>
  </section>;
}
