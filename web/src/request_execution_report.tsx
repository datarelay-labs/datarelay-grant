import { Card } from '@datarelay-labs/foundation';
import { State } from './common';
import type { RequestRow } from './types';

/** A connected system may report an outcome, but Grant has not independently
 * proven an effect. Technical evidence stays accessible, not dominant.
 */
export function RequestExecutionReport({ row }: { row: RequestRow }) {
  if (!row.execution_result) return null;

  return (
    <Card
      title="Reported execution result"
      description="Reported by the connected system; not independently verified by Grant."
    >
      <dl className="grant-facts">
        <dt>External execution state</dt>
        <dd><State value={row.execution_state} /></dd>
        <dt>Connected-system status</dt>
        <dd>{row.execution_result.status}</dd>
      </dl>
      <p>Human approval and notification delivery do not independently confirm an external effect.</p>
      <details>
        <summary>Raw external report evidence</summary>
        <p>This unverified report was supplied by the connected system. Preserve its origin when reconciling effects.</p>
        <pre>{JSON.stringify(row.execution_result, null, 2)}</pre>
      </details>
    </Card>
  );
}
