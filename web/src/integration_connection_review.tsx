import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import type { Integration } from './types';
import './integration-connections-mobile.css';

export type IntegrationTestReview = Readonly<{
  id: string;
  name: string;
  kind: Integration['kind'];
  tenant: string;
  callbackOrigin: string;
  enabled: true;
  decisionVerificationMinimum: Integration['decision_verification_minimum'];
}>;

export function listIntegrationConnections(
  rows: readonly Integration[], search: string,
): Integration[] {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter((row) => [
    row.name, row.kind === 'datarelay' ? 'DataRelay' : 'Stellar Cyber',
    row.tenant, row.callback_origin, row.decision_verification_minimum ?? '',
  ].some((value) => value.toLocaleLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Read-only directory, not a server role expansion. No connection test,
 * credential creation or protected Grant execution occurs from this list.
 */
export function IntegrationConnectionDirectory({
  rows, search, busy, onSearchChange, onReviewTest, onOpenCreation,
}: {
  rows: readonly Integration[];
  search: string;
  busy: boolean;
  onSearchChange: (next: string) => void;
  onReviewTest: (row: Integration) => void;
  onOpenCreation: () => void;
}) {
  const matches = listIntegrationConnections(rows, search);
  return (
    <Card
      className="grant-integration-directory-card"
      title="Registered connections"
      description="Examine installation-approved receivers and decision verification before explicitly reviewing an external diagnostic."
      actions={<Button disabled={busy} onClick={onOpenCreation}>Add connection</Button>}
    >
      <TextField label="Search connections" value={search} maxLength={128}
        placeholder="Connection, integration type, tenant or verification"
        onChange={(event) => onSearchChange(event.target.value.slice(0, 128))} />
      <p aria-live="polite">Showing {matches.length} of {rows.length} connections</p>
      <div className="grant-table-scroll grant-connection-desktop-list">
        <table className="grant-table">
          <thead><tr>
            <th>Connection</th><th>State</th><th>Receiver origin</th>
            <th>Decision verification minimum</th><th>Action</th>
          </tr></thead>
          <tbody>
            {matches.map((row) => <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                <small>{row.kind === 'datarelay' ? 'DataRelay' : 'Stellar Cyber'}
                  {row.tenant ? ' · Tenant ' + row.tenant : ''}</small>
                <small> · Callback: {row.event_format === 'CLOUDEVENTS'
                  ? 'CloudEvents 1.0' : 'Legacy JSON'}</small>
                <details><summary>Technical integration reference</summary>
                  <code>{row.id}</code></details>
              </td>
              <td>{row.enabled ? 'Enabled' : 'Disabled'}</td>
              <td>{row.callback_origin || 'Receiver origin unavailable'}</td>
              <td>{row.decision_verification_minimum ?? 'Unavailable'}</td>
              <td>{row.enabled
                ? <Button variant="secondary" disabled={busy}
                    onClick={() => onReviewTest(row)}>Review connection test</Button>
                : <small>Connection disabled</small>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {/* Mobile cards reflect the SAME current server-registered integration
          directory, exact search match and explicit diagnostic review gate. */}
      <ul className="grant-connection-mobile-list"
        aria-label="Registered connections mobile list">
        {matches.map((row) => (
          <li key={row.id} className="grant-connection-mobile-card">
            <div className="grant-connection-mobile-heading">
              <strong>{row.name}</strong>
              <span className="grant-connection-mobile-state">
                {row.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <dl className="grant-connection-mobile-facts">
              <div><dt>Integration</dt>
                <dd>{row.kind === 'datarelay' ? 'DataRelay' : 'Stellar Cyber'}</dd>
              </div>
              <div><dt>Tenant</dt>
                <dd>{row.tenant || 'No tenant constraint'}</dd>
              </div>
              <div><dt>Receiver origin</dt>
                <dd>{row.callback_origin || 'Receiver origin unavailable'}</dd>
              </div>
              <div><dt>Minimum human verification</dt>
                <dd>{row.decision_verification_minimum ?? 'Unavailable'}</dd>
              </div>
              <div><dt>Callback format</dt>
                <dd>{row.event_format === 'CLOUDEVENTS'
                  ? 'CloudEvents 1.0' : 'Legacy JSON'}</dd>
              </div>
            </dl>
            <details>
              <summary>Technical integration reference</summary>
              <code>{row.id}</code>
            </details>
            {row.enabled
              ? <Button variant="secondary" disabled={busy}
                  onClick={() => onReviewTest(row)}>Review connection test</Button>
              : <small>Connection disabled</small>}
          </li>
        ))}
      </ul>
      {!rows.length && <p>No registered connections. Add an integration to begin.</p>}
      {rows.length > 0 && !matches.length
        && <p>No connections match the current search.</p>}
    </Card>
  );
}

export function createIntegrationTestReview(row: Integration): IntegrationTestReview {
  if (!row?.id || !row.enabled || !row.callback_origin) {
    throw new Error('INTEGRATION_TEST_UNAVAILABLE');
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    tenant: row.tenant,
    callbackOrigin: row.callback_origin,
    enabled: true,
    decisionVerificationMinimum: row.decision_verification_minimum,
  };
}

export function isCurrentIntegrationTestReview(
  review: IntegrationTestReview | null, row: Integration | undefined,
): boolean {
  if (!review || !row) return false;
  try {
    return JSON.stringify(createIntegrationTestReview(row))
      === JSON.stringify(review);
  } catch {
    return false;
  }
}

/** A possibly committed diagnostic webhook must not be automatically retried.
 * A failed read-only GET before POST permits re-review; a successful
 * explicit Refresh with no in-flight write can unlock the next attempt.
 */
export function createIntegrationTestGuard() {
  let claimed = false;
  let inFlight = false;
  let postStarted = false;
  return {
    claim(): boolean {
      if (claimed || inFlight) return false;
      claimed = true; inFlight = true; postStarted = false;
      return true;
    },
    markPostStarted(): void {
      if (!inFlight) throw new Error('INTEGRATION_TEST_CLAIM_REQUIRED');
      postStarted = true;
    },
    settled(): void {
      inFlight = false;
      if (!postStarted) claimed = false;
    },
    blocked(): boolean { return claimed || inFlight; },
    readSucceeded(): boolean {
      if (inFlight) return false;
      claimed = false; postStarted = false;
      return true;
    },
  };
}

export type IntegrationTestReceipt = {
  transport_accepted: boolean;
  execution_allowed: boolean;
  event_id: string;
};

export function verifyIntegrationTestReceipt<T extends IntegrationTestReceipt>(receipt: T): T {
  if (!receipt || receipt.transport_accepted !== true
      || receipt.execution_allowed !== false
      || typeof receipt.event_id !== 'string'
      || !receipt.event_id.trim()) {
    throw new Error('INTEGRATION_TEST_RECEIPT_UNVERIFIED');
  }
  return receipt;
}

/** This reviewed POST is a real external diagnostic webhook. It is never
 * approval/execution, and a fresh GET does NOT provide atomic receiver CAS.
 * Server administrator RBAC, rate limiting, unpausing and destination
 * allowlisting remain the authority for the actual connection test.
 */
export async function submitReviewedIntegrationTest<T extends IntegrationTestReceipt>(
  reviewed: IntegrationTestReview,
  guard: ReturnType<typeof createIntegrationTestGuard>,
  readCurrent: () => Promise<Integration[]>,
  postOnce: (integrationId: string) => Promise<T>,
): Promise<T | null> {
  if (!guard.claim()) return null;
  try {
    const current = (await readCurrent()).find((row) => row.id === reviewed.id);
    if (!isCurrentIntegrationTestReview(reviewed, current)) {
      throw new Error('INTEGRATION_TEST_CHANGED_REVIEW_REQUIRED');
    }
    guard.markPostStarted();
    return verifyIntegrationTestReceipt(await postOnce(reviewed.id));
  } finally {
    guard.settled();
  }
}

export function IntegrationTestConfirmation({
  reviewed, busy, valid, onCancel, onConfirm,
}: {
  reviewed: IntegrationTestReview | null;
  busy: boolean;
  valid: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!reviewed) return null;
  return <Alert tone="warning" title="Confirm connection test">
    <p>This sends a real diagnostic webhook to the installation-approved
      receiver. The diagnostic is not an approval or execution, and transport
      acceptance does not establish external business effect or receiver
      identity beyond the server connection contract.</p>
    <dl className="grant-facts">
      <dt>Registered connection</dt><dd>{reviewed.name}</dd>
      <dt>Integration kind</dt>
      <dd>{reviewed.kind === 'datarelay' ? 'DataRelay' : 'Stellar Cyber'}</dd>
      <dt>Receiver origin</dt><dd>{reviewed.callbackOrigin}</dd>
      <dt>Tenant scope</dt><dd>{reviewed.tenant || 'No tenant constraint'}</dd>
      <dt>Decision verification minimum</dt>
      <dd>{reviewed.decisionVerificationMinimum ?? 'Unavailable'}</dd>
    </dl>
    {!valid && <p role="alert">The selected integration changed.
      Refresh saved connections, then review the current receiver again.</p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Back to connections</Button>
      <Button disabled={busy || !valid} onClick={onConfirm}>Confirm connection test</Button>
    </div>
  </Alert>;
}
