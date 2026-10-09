import { useState } from 'react';
import { Alert, Button, Card } from '@datarelay-labs/foundation';
import { api } from './api';
import { Select, useTask } from './common';
import type { Integration } from './types';

type V2Policy = {
  id: string;
  source_lifecycle: string;
  config: {
    name: string;
    approver_id: string;
    integration_id: string;
    approver_group_id: string | null;
    approval_mode: string;
  };
};
type V2Bundle = {
  schema_version: 2;
  format: 'grant.configuration';
  credential_material_included: false;
  integrations: { id: string; name: string; kind: string; tenant: string }[];
  policies: V2Policy[];
  templates: {
    id: string; name: string; templates: Record<string, { subject: string; body: string }>;
  }[];
};
type V2Mappings = {
  integrations: Record<string, string>;
  approvers: Record<string, string>;
  groups: Record<string, string>;
};
type V2Preview = {
  schema_version: 2;
  preview_only: true;
  can_import_drafts: boolean;
  will_activate: false;
  preview_digest: string;
  summary: { integrations: number; policies: number; templates: number };
  conflicts: { kind: string; name: string; reason: string }[];
  warnings: string[];
};
type ImportedDrafts = {
  imported: { policies: number; templates: number };
  policy_ids: string[];
  template_ids: string[];
  all_policies_draft: true;
  activated: false;
};
type LocalUser = {
  id: string; displayName: string; status: string; role: { value: string; label: string };
};
type LocalGroup = { id: string; name: string; enabled: boolean; member_ids: string[] };

const EMPTY_MAPPINGS: V2Mappings = { integrations: {}, approvers: {}, groups: {} };

function safeBundle(value: unknown): V2Bundle {
  if (value === null || typeof value !== 'object') throw Error('Provide a v2 configuration bundle.');
  const v = value as Record<string, unknown>;
  if (
    v.schema_version !== 2 || v.format !== 'grant.configuration' ||
    v.credential_material_included !== false ||
    !Array.isArray(v.integrations) || !Array.isArray(v.policies) ||
    !Array.isArray(v.templates)
  ) throw Error('Only complete v2 Grant configuration bundles are supported.');
  // Structural and security validation is ALWAYS performed by the server.
  return value as V2Bundle;
}

export function ConfigurationV2Preview({ preview }: { preview: V2Preview }) {
  return <div className="grant-stack" data-testid="grant-v2-preview">
    <Alert tone={preview.can_import_drafts ? 'warning' : 'critical'}
      title={preview.can_import_drafts ? 'Ready for Draft-only import' : 'Fix mappings or collisions'}>
      <p>{preview.summary.policies} policies and {preview.summary.templates} notification
        sets will be reviewed. Any imported policy stays DISABLED / DRAFT.</p>
      <p>No integration destination, credentials, request, or existing policy is changed.
        Source ACTIVE status is never carried over.</p>
    </Alert>
    {preview.conflicts.length ? <Card title="Blocking validation findings">
      <ul>{preview.conflicts.map((item, i) =>
        <li key={i}><strong>{item.kind}: {item.name}</strong> — {item.reason}</li>)}</ul>
    </Card> : null}
  </div>;
}

/** Deliberate two-step reviewer UI. This never imports schema-v1 metadata. */
export function ConfigurationPortabilityV2({ integrations }: { integrations: Integration[] }) {
  const task = useTask();
  const [bundle, setBundle] = useState<V2Bundle | null>(null);
  const [mapping, setMapping] = useState<V2Mappings>(EMPTY_MAPPINGS);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [groups, setGroups] = useState<LocalGroup[]>([]);
  const [preview, setPreview] = useState<V2Preview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [imported, setImported] = useState<ImportedDrafts | null>(null);

  const approverIds = [
    ...new Set((bundle?.policies ?? []).map((item) => item.config.approver_id)),
  ];
  const groupIds = [
    ...new Set((bundle?.policies ?? [])
      .filter((item) => item.config.approval_mode !== 'SINGLE')
      .map((item) => item.config.approver_group_id)
      .filter((id): id is string => Boolean(id))),
  ];

  function resetReview(next: V2Bundle) {
    setBundle(next);
    setMapping({ integrations: {}, approvers: {}, groups: {} });
    setPreview(null);
    setConfirmation('');
    setImported(null);
  }

  async function loadDestinations() {
    const [accountRows, groupRows] = await Promise.all([
      api<LocalUser[]>('/admin/users'),
      api<LocalGroup[]>('/approver-groups'),
    ]);
    setUsers(accountRows.filter((u) => u.status === 'enabled'));
    setGroups(groupRows.filter((g) => g.enabled && g.member_ids.length > 0));
  }

  async function downloadV2() {
    const exportPayload = safeBundle(await api<unknown>('/admin/configuration/export-v2'));
    const data = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const href = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'grant-configuration-v2.json';
    anchor.click();
    URL.revokeObjectURL(href);
    await loadDestinations();
    resetReview(exportPayload);
    task.setNotice('Complete v2 export generated. Review message bodies as sensitive before sharing.');
  }

  async function openFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 400_000) {
      task.setNotice('Configuration bundle exceeds the 400 KB source limit.');
      return;
    }
    try {
      const parsed = safeBundle(JSON.parse(await file.text()));
      await loadDestinations();
      resetReview(parsed);
      task.setNotice('Bundle loaded locally. Select existing destinations before preview.');
    } catch {
      task.setNotice('Invalid JSON or incomplete version-2 configuration bundle.');
    }
  }

  function choose(group: keyof V2Mappings, sourceId: string, localId: string) {
    setMapping((value) => ({
      ...value,
      [group]: { ...value[group], [sourceId]: localId },
    }));
    setPreview(null);
    setImported(null);
    setConfirmation('');
  }

  async function review() {
    if (!bundle) return;
    const result = await api<V2Preview>('/admin/configuration/preview-v2', 'POST', {
      bundle, mappings: mapping,
    });
    setPreview(result);
    setConfirmation('');
    setImported(null);
    task.setNotice(result.can_import_drafts
      ? 'Mapping and target records checked. Explicit confirmation is still required.'
      : 'Resolve all blocking mappings and name conflicts before import.');
  }

  async function commitDrafts() {
    if (!bundle || !preview?.can_import_drafts ||
        confirmation !== 'IMPORT_DRAFTS_ONLY') return;
    const result = await api<ImportedDrafts>('/admin/configuration/import-v2', 'POST', {
      bundle, mappings: mapping,
      preview_digest: preview.preview_digest,
      confirmation: 'IMPORT_DRAFTS_ONLY',
    });
    setImported(result);
    setPreview(null);
    setConfirmation('');
    task.setNotice('Draft policies created. Verify each policy in Testing before a separate activation.');
  }

  return <Card title="Version-2 configuration portability"
    description="Administrator-reviewed import of COMPLETE approval policies and notification event templates. All imported policies start as disabled Drafts.">
    <div className="grant-stack" data-testid="grant-v2-import-workspace">
      {task.feedback}
      <Alert tone="warning" title="Administrator review required">
        Export includes actual notification message text and source approval identifiers.
        Review it before sharing. Passwords, API keys, callback destinations and
        external integration credentials are NOT included or transferred.
      </Alert>
      <div className="grant-actions">
        <Button variant="secondary" disabled={task.busy}
          onClick={() => void task.run(downloadV2)}>
          Export complete v2 JSON
        </Button>
        <label>
          Open a v2 JSON file
          <input type="file" accept=".json,application/json"
            data-testid="grant-v2-json-file" disabled={task.busy}
            onChange={(e) => void task.run(() => openFile(e.target.files?.[0]))} />
        </label>
      </div>
      {bundle ? <>
        <p>Source: {bundle.integrations.length} integration references;
          {bundle.policies.length} policies;
          {bundle.templates.length} complete notification sets.</p>
        <p>Every source identity must be matched to an existing, enabled local target.
          Grant does not import integrations, users or groups.</p>
        {bundle.integrations.map((source) =>
          <Select key={'int:'+source.id} label={'Map source integration: ' + source.name}
            value={mapping.integrations[source.id] || ''}
            onChange={(v) => choose('integrations', source.id, v)}>
            <option value="">Choose an existing integration</option>
            {integrations.filter((row) => row.enabled && row.kind === source.kind &&
                row.tenant === source.tenant).map((row) =>
              <option key={row.id} value={row.id}>{row.name}</option>)}
          </Select>)}
        {approverIds.map((sourceId) =>
          <Select key={'user:'+sourceId} label={'Map source approver: ' + sourceId}
            value={mapping.approvers[sourceId] || ''}
            onChange={(v) => choose('approvers', sourceId, v)}>
            <option value="">Choose an enabled local user</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
          </Select>)}
        {groupIds.map((sourceId) =>
          <Select key={'group:'+sourceId} label={'Map source approval group: ' + sourceId}
            value={mapping.groups[sourceId] || ''}
            onChange={(v) => choose('groups', sourceId, v)}>
            <option value="">Choose a local approval group</option>
            {groups.map((group) =>
              <option key={group.id} value={group.id}>{group.name}</option>)}
          </Select>)}
        <Button disabled={task.busy} onClick={() => void task.run(review)}>
          Validate Draft-only import
        </Button>
        {preview ? <>
          <ConfigurationV2Preview preview={preview} />
          <Card title="Review exact imported Draft names"
            description="All source states are discarded. Imported policies stay disabled until separately tested and activated.">
            <ul>{bundle.policies.map((item) => (
              <li key={item.id}>
                <strong>{item.config.name}</strong> — source {item.source_lifecycle},
                destination DRAFT (disabled)
              </li>
            ))}</ul>
            {!bundle.policies.length ? <p>No approval policies in this bundle.</p> : null}
            <p>{bundle.templates.length} complete notification sets will be created
              with new local IDs; no existing message template is overwritten.</p>
          </Card>
          {preview.can_import_drafts ? <>
            <p>Separate confirmation: type <code>IMPORT_DRAFTS_ONLY</code>.
              This creates new disabled policy Drafts, not active approvals.</p>
            <label>
              Import confirmation
              <input type="text" autoComplete="off" value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                maxLength={18} />
            </label>
            <Button disabled={task.busy || confirmation !== 'IMPORT_DRAFTS_ONLY'}
              onClick={() => void task.run(commitDrafts)}>
              Create reviewed Drafts only
            </Button>
          </> : null}
        </> : null}
      </> : null}
      {imported ? <Alert tone="success" title="Disabled Draft import recorded">
        Created {imported.imported.policies} Draft policies and {imported.imported.templates}
        notification sets. No policy was activated. Review under Approval policies,
        run policy Testing and activate separately as administrator.
      </Alert> : null}
    </div>
  </Card>;
}
