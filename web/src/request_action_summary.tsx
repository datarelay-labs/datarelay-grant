import { Fragment } from 'react';
import { Button, Card } from '@datarelay-labs/foundation';
import type { RequestRow } from './types';

/** Present the immutable business action first and keep the full parameter
 * values visible. Only technical identity/hash and raw source logs collapse.
 * Callbacks delegate to the existing product router; no approval occurs here.
 */
export function RequestActionSummary({
  row, canReplace, navigate,
}: {
  row: RequestRow;
  canReplace: boolean;
  navigate: (path: string) => void;
}) {
  const parameters = Object.entries(row.action.parameters);

  return (
    <Card
      title="Exact action requiring approval"
      description="Review the immutable operation, target and parameters before deciding. Approval never executes this action directly."
    >
      {row.predecessor_id ? (
        <p>
          Linked replacement request ·{' '}
          <Button variant="ghost" onClick={() => navigate('/requests/' + row.predecessor_id)}>
            View prior request
          </Button>
        </p>
      ) : null}

      <dl className="grant-facts">
        <dt>Operation</dt><dd>{row.action.kind}</dd>
        <dt>Target</dt><dd>{row.action.target}</dd>
        {parameters.length ? (
          parameters.map(([key, value]) => (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
            </Fragment>
          ))
        ) : (
          <><dt>Parameters</dt><dd>None</dd></>
        )}
      </dl>

      <details>
        <summary>Technical action fingerprint &amp; raw parameter JSON</summary>
        <dl className="grant-facts">
          <dt>Action fingerprint</dt><dd className="grant-mono">{row.action_hash}</dd>
        </dl>
        <pre>{JSON.stringify(row.action.parameters, null, 2)}</pre>
      </details>
      <details>
        <summary>Original source reference</summary>
        <pre>{JSON.stringify(row.source, null, 2)}</pre>
      </details>
      <p>Action content cannot be edited. Cancel this request and submit a new linked request when the action changes.</p>
      {canReplace ? (
        <Button variant="secondary" onClick={() => navigate('/requests/' + row.id + '/replace')}>
          Create replacement request
        </Button>
      ) : null}
    </Card>
  );
}
