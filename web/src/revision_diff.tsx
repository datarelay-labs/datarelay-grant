import { useEffect, useState } from 'react';
import { Card } from '@datarelay-labs/foundation';
import { api, ApiError } from './api';

type RevisionDiff = {
  request_id: string;
  predecessor_id: string;
  predecessor_state: string;
  action_changed: boolean;
  fresh_approval_required: true;
  changes: Record<string, { before: unknown; after: unknown }>;
};
function display(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function RevisionComparison({ requestId }: { requestId: string }) {
  const [diff, setDiff] = useState<RevisionDiff | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void api<RevisionDiff>('/requests/' + encodeURIComponent(requestId) + '/comparison')
      .then((data) => { if (current) setDiff(data); })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof ApiError && reason.status === 404
          ? 'Prior request is not visible to this account.'
          : 'Unable to retrieve the previous request comparison.');
      });
    return () => { current = false; };
  }, [requestId]);
  return <Card title="Replacement revision comparison" description="Material fields are compared against the cancelled original. A new explicit approval is mandatory.">
    {error && <p>{error}</p>}
    {!error && !diff && <p>Loading revision differences…</p>}
    {diff && <>
      <p>Previous request: <code>{diff.predecessor_id}</code> ({diff.predecessor_state}). New request: <code>{diff.request_id}</code>.</p>
      <p>{diff.action_changed ? 'The requested action changed. Previous authorization cannot be reused.' : 'The action is unchanged but the replacement requires a new decision.'}</p>
      {!Object.keys(diff.changes).length && <p>No material fields changed.</p>}
      {Object.entries(diff.changes).map(([field, changed]) => <div className="grant-timeline" key={field}>
        <strong>Changed {field}</strong>
        <p>Before</p><pre>{display(changed.before)}</pre>
        <p>After</p><pre>{display(changed.after)}</pre>
      </div>)}
    </>}
  </Card>;
}
