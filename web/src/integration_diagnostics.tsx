import { useState } from 'react';
import { Alert, Button, Card, StatusBadge } from '@datarelay-labs/foundation';
import { api } from './api';
import { TextArea } from './common';
import { Select, useTask, when } from './common';
import type { Integration } from './types';
import { ConfigurationPortabilityV2 } from './configuration_portability_v2';

type CredentialMetadata = {
  id: string;
  scopes: string[];
  role: 'producer' | 'executor' | 'observer' | 'mixed' | 'unclassified';
  enabled: boolean;
  created_at: number;
};
type AuditEvent = { at: number; event: string; credential_id: string | null };
type ConnectionEvent = { at: number; status: 'accepted' | 'failed'; execution_allowed: false };
type Diagnostics = {
  integration: { id: string; name: string; kind: string; tenant: string; enabled: boolean };
  request_activity: { count: number; last_created_at: number | null };
  transport: {
    last_accepted_at: number | null;
    last_failure_at: number | null;
    latest_state: string | null;
    last_success_is_execution: false;
    failed_events: number;
    health: 'disabled' | 'degraded' | 'transport_accepted' | 'not_verified';
  };
  credentials: CredentialMetadata[];
  credential_history: AuditEvent[];
  connection_tests: ConnectionEvent[];
};
export type DryRunPreview = {
  schema_version: number;
  preview_only: true;
  can_apply: false;
  summary: { integrations: number; policies: number; templates: number };
  conflicts: { kind: string; name: string; reason: string }[];
  readiness: {
    automatic_apply_available: false;
    manual_review_only: true;
    required_actions: number;
  };
  requirements: {
    kind: 'integration' | 'policy' | 'template';
    name: string;
    reason: string;
    operator_action: string;
  }[];
  warnings: string[];
};
type ConfigurationManifest = {
  schema_version: number;
  secret_free: true;
  import_supported: false;
  executable_restore_bundle: false;
  integrations: { id: string; name: string; kind: string; tenant: string; enabled: boolean }[];
  policies: Record<string, unknown>[];
  templates: { id: string; name: string; enabled: boolean; event_types: string[] }[];
  warning: string;
};

/** Safe rendering of server-owned, read-only schema-v1 migration planning. */
export function ConfigurationImportReadiness({ preview }: { preview: DryRunPreview }) {
  const kinds = ['integration', 'policy', 'template'] as const;
  return (
    <div className="grant-stack" data-testid="grant-configuration-readiness">
      <Alert tone="warning" title="Manual preparation required — no changes applied">
        <p>Integrations: {preview.summary.integrations};
          policies: {preview.summary.policies};
          templates: {preview.summary.templates}.</p>
        <p>{preview.conflicts.length} existing identities or unresolved mappings.</p>
        <p>{preview.readiness.required_actions} administrator preparation tasks.</p>
        <p>This is a secret-free planning manifest, not a restorable configuration.
          No credentials, recipients or notification message bodies were exported.
          Automatic import and activation are unavailable.</p>
      </Alert>
      <Card title="Required administrator actions"
        description="Resolve these in the destination installation before creating and activating any new policies.">
        {kinds.map((kind) => {
          const rows = preview.requirements.filter((row) => row.kind === kind);
          return rows.length ? (
            <section key={kind} aria-label={kind + ' preparation'}>
              <h4>{kind === 'integration' ? 'Integrations' :
                kind === 'policy' ? 'Approval policies' : 'Notification templates'}</h4>
              <ul>
                {rows.map((row, index) => (
                  <li key={row.reason + ':' + row.name + ':' + index}>
                    <strong>{row.name}</strong>
                    <p>{row.operator_action}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null;
        })}
        {!preview.requirements.length ? (
          <p>No portable records were supplied. Nothing can be applied from this preview.</p>
        ) : null}
      </Card>
    </div>
  );
}

export function IntegrationDiagnostics({ integrations }: { integrations: Integration[] }) {
  const task = useTask();
  const [selected, setSelected] = useState('');
  const [details, setDetails] = useState<Diagnostics | null>(null);
  const [manifest, setManifest] = useState<ConfigurationManifest | null>(null);
  const [pastedManifest, setPastedManifest] = useState('');
  const [conflictPreview, setConflictPreview] = useState<DryRunPreview | null>(null);

  async function inspect(id: string) {
    setSelected(id);
    setDetails(null);
    if (id) {
      setDetails(await api<Diagnostics>('/integrations/' + encodeURIComponent(id) + '/diagnostics'));
    }
  }

  async function loadManifest() {
    setConflictPreview(null);
    setManifest(await api<ConfigurationManifest>('/integrations/configuration-export'));
  }

  async function dryRunImport() {
    const source = pastedManifest.trim() || (manifest ? JSON.stringify(manifest) : '');
    if (!source || source.length > 64000) {
      task.setNotice('Provide a bounded G8 metadata manifest before previewing conflicts.');
      return;
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(source);
    } catch {
      task.setNotice('Manifest must be valid JSON metadata; no credentials or secrets.');
      return;
    }
    setConflictPreview(await api<DryRunPreview>('/admin/configuration/preview', 'POST', candidate));
    task.setNotice('Preview complete. No policy, credential or integration configuration was changed.');
  }

  function saveManifest() {
    if (!manifest) return;
    const data = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    });
    const objectURL = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = objectURL;
    anchor.download = 'grant-configuration-manifest.json';
    anchor.click();
    URL.revokeObjectURL(objectURL);
  }

  return <div className="grant-stack">
    {task.feedback}
    <Card title="Integration health and activity" description="Read-only observations. HTTP callback accepted never proves the action was executed.">
      <Select label="Inspect integration health" value={selected}
        onChange={(id) => void task.run(() => inspect(id))} required={false}>
        <option value="">Select registered integration</option>
        {integrations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
      {details && <>
        <dl className="grant-facts">
          <dt>Integration</dt><dd>{details.integration.name}</dd>
          <dt>Kind</dt><dd>{details.integration.kind}</dd>
          <dt>Allowed tenant</dt><dd>{details.integration.tenant || 'Installation default'}</dd>
          <dt>Requests</dt><dd>{details.request_activity.count}</dd>
          <dt>Last request</dt><dd>{when(details.request_activity.last_created_at)}</dd>
          <dt>Last HTTP callback acceptance</dt><dd>{when(details.transport.last_accepted_at)}</dd>
          <dt>Last callback delivery failure</dt><dd>{when(details.transport.last_failure_at)}</dd>
          <dt>Latest callback delivery state</dt><dd>{details.transport.latest_state ?? 'Not observed'}</dd>
          <dt>Callback health</dt><dd>{details.transport.health.replaceAll('_', ' ')}</dd>
          <dt>Failed callbacks</dt><dd>{details.transport.failed_events}</dd>
        </dl>
        <Card title="Credential roles" description="Metadata only. Producer credentials cannot decide approvals; executor/reporting credentials do not have to create requests.">
          {details.credentials.map((item) => <div className="grant-delivery" key={item.id}>
            <div><strong>{item.role.replaceAll('_', ' ')}</strong>
              <small>{item.scopes.join(', ')} · {when(item.created_at)}</small>
              <code>{item.id}</code>
            </div>
            <StatusBadge tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? 'Enabled' : 'Revoked'}</StatusBadge>
          </div>)}
          {!details.credentials.length && <p>No credentials have been issued.</p>}
        </Card>
        <Card title="Credential audit history" description="Only creation/revocation metadata, not raw credentials.">
          {details.credential_history.map((event, index) => <div className="grant-timeline" key={index}>
            <strong>{event.event.replaceAll('_', ' ')}</strong>
            <small>{when(event.at)} · {event.credential_id ?? 'Unavailable'}</small>
          </div>)}
          {!details.credential_history.length && <p>No recorded credential events.</p>}
        </Card>
        <Card title="Connection test history" description="Acceptance and failure report transport only. Tests never approve or run a business action.">
          {details.connection_tests.map((event, index) => <div className="grant-timeline" key={index}>
            <strong>{event.status === 'accepted' ? 'HTTP test accepted' : 'HTTP test failed'}</strong>
            <small>{when(event.at)} · Execution not permitted</small>
          </div>)}
          {!details.connection_tests.length && <p>No recorded connection tests.</p>}
        </Card>
      </>}
    </Card>
    <Card title="Safe configuration export" description="Planning manifest only, not a runnable or restorable configuration. Excludes callback destinations, authentication material and message text.">
      <div className="grant-actions">
        <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(loadManifest)}>Preview safe export</Button>
        {manifest && <Button variant="secondary" onClick={saveManifest}>Save JSON manifest</Button>}
      </div>
      {manifest && <Alert tone="warning" title="No automatic import or execution">
        {manifest.warning}
      </Alert>}
      {manifest && <pre className="grant-mono">{JSON.stringify(manifest, null, 2)}</pre>}
    </Card>
    <Card title="Configuration import conflict preview" description="Strict schema-v1 metadata dry run. Paste a safe manifest or use the current preview above. This cannot apply, activate or edit configuration.">
      <TextArea label="Safe metadata manifest (optional JSON)" value={pastedManifest}
        onChange={(value) => { setPastedManifest(value); setConflictPreview(null); }} />
      <div className="grant-actions">
        <Button disabled={task.busy} onClick={() => void task.run(dryRunImport)}>Preview import conflicts</Button>
      </div>
      {conflictPreview ? <ConfigurationImportReadiness preview={conflictPreview} /> : null}
    </Card>
    <ConfigurationPortabilityV2 integrations={integrations} />
  </div>;
}
