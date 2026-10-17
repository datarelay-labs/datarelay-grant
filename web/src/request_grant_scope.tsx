import { when } from './common';
import type { RequestRow } from './types';

/**
 * Pure role-scoped RequestDetail projection: approval is a bounded grant,
 * NOT a report that the external system changed anything. Never infer
 * executable authorization from local time or a past decision alone.
 * The existing server consumer/API remains authoritative on every consume.
 */
export function RequestGrantScope({ row }: { row: RequestRow }) {
  const approvedNow = row.state === 'APPROVED' && row.decision === 'APPROVED';
  const expiredApproved = row.state === 'EXPIRED' && row.decision === 'APPROVED';
  const rawEnd = row.grant_until;
  const recordedEnd = typeof rawEnd === 'number' && Number.isFinite(rawEnd) &&
    rawEnd > 0 && rawEnd <= 8_640_000_000_000 ? when(rawEnd) : null;

  return (
    <section className="grant-grant-scope" aria-labelledby="grant-execution-scope-heading">
      <h3 id="grant-execution-scope-heading">Execution grant scope and validity</h3>
      {approvedNow || expiredApproved ? (
        <>
          <p><strong>{expiredApproved
            ? 'Previously approved grant expired'
            : 'Granted for this immutable action'}</strong></p>
          <dl className="grant-facts">
            <dt>Authorized operation</dt><dd>{row.action.kind}</dd>
            <dt>Authorized target</dt><dd>{row.action.target}</dd>
            <dt>{expiredApproved ? 'Recorded grant end'
              : recordedEnd ? 'Grant expires (server recorded)' : 'Grant validity'}</dt>
            <dd>{recordedEnd || 'Grant validity unavailable — verify server state before execution'}</dd>
          </dl>
          {expiredApproved ? (
            <p>This is a historical grant, not an overdue human approval or permission to execute again.</p>
          ) : (
            <p>Current approval state is server-reported, not proof that an unused or
              unexpired grant is still consumable. The server revalidates the scope
              and validity before any separate consumer commitment.</p>
          )}
        </>
      ) : (
        <p>No current execution grant recorded. A requested action or past
          vote never creates an independent execution permission.</p>
      )}
      <p>Connected systems execute separately. Neither approval, callback
        transport nor a reported outcome proves an external effect.</p>
    </section>
  );
}
