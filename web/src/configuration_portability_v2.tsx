import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card } from '@datarelay-labs/foundation';
import { api, errorText } from './api';
import { Select } from './common';
import type { Integration } from './types';
import { createConfigurationPreviewReadScope, readCurrentConfigurationExport } from './integration_configuration_preview_guard';
import {
  acceptV2Bundle, acceptV2Preview, reviewV2Identity, canCommitReviewedV2,
  type V2Bundle, type V2Mappings, type V2Preview,
} from './configuration_portability_v2_guard';

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
  const scope = useRef(createConfigurationPreviewReadScope());
  useEffect(() => () => scope.current.invalidate(), []);
  const [bundle, setBundle] = useState<V2Bundle | null>(null);
  const [mapping, setMapping] = useState<V2Mappings>(EMPTY_MAPPINGS);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [groups, setGroups] = useState<LocalGroup[]>([]);
  const [reviewed, setReviewed] = useState<{preview: V2Preview; identity: string} | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [imported, setImported] = useState<ImportedDrafts | null>(null);
  const [importing, setImporting] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const importingRef = useRef(false);
  const [feedback, setFeedback] = useState<{
    tone: 'critical' | 'success'; title: string; message: string;
  } | null>(null);

  const identity = bundle ? reviewV2Identity(bundle, mapping) : '';
  const preview = reviewed?.identity === identity ? reviewed.preview : null;
  const approverIds = [
    ...new Set((bundle?.policies ?? []).map((item) => item.config.approver_id)),
  ];
  const groupIds = [
    ...new Set((bundle?.policies ?? [])
      .filter((item) => (item.config.approval_mode ?? 'SINGLE') !== 'SINGLE')
      .map((item) => item.config.approver_group_id)
      .filter((id): id is string => Boolean(id))),
  ];
  const readyToImport = canCommitReviewedV2(
    reviewed?.identity ?? '', identity, Boolean(preview?.can_import_drafts),
    preview?.preview_digest ?? '', confirmation,
  );

  function invalidateReview() {
    scope.current.invalidate();
    setReviewed(null);
    setConfirmation('');
    setImported(null);
    setReviewBusy(false);
    setFeedback(null);
  }
  function startNewSource() {
    invalidateReview();
    setBundle(null);
    setMapping({ integrations: {}, approvers: {}, groups: {} });
    setUsers([]);
    setGroups([]);
  }
  async function loadDestinations(): Promise<{users: LocalUser[]; groups: LocalGroup[]}> {
    const [accountRows, groupRows] = await Promise.all([
      api<LocalUser[]>('/admin/users'), api<LocalGroup[]>('/approver-groups'),
    ]);
    return {
      users: accountRows.filter((u) => u.status === 'enabled'),
      groups: groupRows.filter((g) => g.enabled && g.member_ids.length > 0),
    };
  }
  function publishSource(next: V2Bundle, destinations: {users: LocalUser[]; groups: LocalGroup[]}) {
    setBundle(next);
    setMapping({ integrations: {}, approvers: {}, groups: {} });
    setUsers(destinations.users);
    setGroups(destinations.groups);
  }
  async function downloadV2() {
    if (importingRef.current) return;
    startNewSource();
    try {
      const accepted = await readCurrentConfigurationExport(scope.current, async () => {
        const source = acceptV2Bundle(await api<unknown>('/admin/configuration/export-v2'));
        const destinations = await loadDestinations();
        return {source, destinations};
      }, ({source, destinations}) => {
        const data = new Blob([JSON.stringify(source, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(data);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'grant-configuration-v2.json';
        anchor.click();
        URL.revokeObjectURL(url);
        publishSource(source, destinations);
      });
      if (accepted) setFeedback({tone:'success', title:'Export ready',
        message:'Complete v2 export generated. Review message bodies as sensitive before sharing.'});
    } catch (error) {
      setFeedback({tone:'critical', title:'Export unavailable', message:errorText(error)});
    }
  }
  async function openFile(file: File | undefined) {
    if (!file || importingRef.current) return; // Canceled chooser is a no-op.
    startNewSource(); // Invalidate the previous review BEFORE async file parsing.
    if (file.size > 400_000) {
      setFeedback({tone:'critical', title:'Invalid configuration file',
        message:'Configuration bundle exceeds the 400 KB source limit.'});
      return;
    }
    let sourceValidated = false;
    try {
      const accepted = await readCurrentConfigurationExport(scope.current, async () => {
        const source = acceptV2Bundle(JSON.parse(await file.text()));
        sourceValidated = true;
        const destinations = await loadDestinations();
        return {source, destinations};
      }, ({source, destinations}) => publishSource(source, destinations));
      if (accepted) setFeedback({tone:'success', title:'Bundle loaded',
        message:'Bundle loaded locally. Select existing destinations before preview.'});
    } catch (error) {
      // The file can be valid even when existing destination choices are unavailable.
      // Superseded failures have already been discarded by the generation guard.
      setFeedback(sourceValidated
        ? {tone:'critical', title:'Unable to load destinations',
          message:'The configuration file was read successfully. ' + errorText(error) +
            ' Select the same file again to retry.'}
        : {tone:'critical', title:'Invalid configuration file',
          message:'Invalid JSON or incomplete version-2 configuration bundle.'});
    }
  }
  function choose(group: keyof V2Mappings, sourceId: string, localId: string) {
    if (importingRef.current) return;
    invalidateReview();
    setMapping((value) => ({
      ...value, [group]: {...value[group], [sourceId]: localId},
    }));
  }
  async function review() {
    if (!bundle || importingRef.current) return;
    setReviewed(null);
    setConfirmation('');
    setImported(null);
    setFeedback(null);
    setReviewBusy(true);
    const requestedIdentity = reviewV2Identity(bundle, mapping);
    try {
      const accepted = await readCurrentConfigurationExport(scope.current, async () =>
        acceptV2Preview(await api<unknown>('/admin/configuration/preview-v2', 'POST', {
          bundle, mappings: mapping,
        })), (result) => {
          setReviewed({preview:result, identity:requestedIdentity});
          setFeedback({tone:'success', title:'Preview checked',
            message:result.can_import_drafts
              ? 'Mapping and target records checked. Explicit confirmation is still required.'
              : 'Resolve all blocking mappings and name conflicts before import.'});
        });
      if (accepted) setReviewBusy(false);
    } catch (error) {
      setReviewBusy(false);
      setFeedback({tone:'critical', title:'Preview unavailable', message:errorText(error)});
    }
  }
  async function commitDrafts() {
    if (importingRef.current || !bundle || !preview || !readyToImport) return;
    importingRef.current = true;
    setImporting(true);
    setFeedback(null);
    try {
      const result = await api<ImportedDrafts>('/admin/configuration/import-v2', 'POST', {
        bundle, mappings: mapping, preview_digest: preview.preview_digest,
        confirmation: 'IMPORT_DRAFTS_ONLY',
      });
      setImported(result);
      setReviewed(null);
      setConfirmation('');
      setFeedback({tone:'success', title:'Drafts imported',
        message:'Draft policies created. Verify each policy in Testing before a separate activation.'});
    } catch (error) {
      setFeedback({tone:'critical', title:'Draft import failed', message:errorText(error)});
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }

  return <Card title="Version-2 configuration portability"
    description="Administrator-reviewed import of COMPLETE approval policies and notification event templates. All imported policies start as disabled Drafts.">
    <div className="grant-stack" data-testid="grant-v2-import-workspace">
      {feedback ? <Alert tone={feedback.tone} title={feedback.title}>{feedback.message}</Alert> : null}
      <Alert tone="warning" title="Administrator review required">
        Export includes actual notification message text and source approval identifiers.
        Review it before sharing. Passwords, API keys, callback destinations and
        external integration credentials are NOT included or transferred.
      </Alert>
      <div className="grant-actions">
        <Button variant="secondary" disabled={importing}
          onClick={() => void downloadV2()}>
          Export complete v2 JSON
        </Button>
        <label>
          Open a v2 JSON file
          <input type="file" accept=".json,application/json"
            data-testid="grant-v2-json-file" disabled={importing}
            onChange={(e) => { const file=e.currentTarget.files?.[0]; e.currentTarget.value=''; void openFile(file); }} />
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
                row.tenant === (source.tenant ?? '')).map((row) =>
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
        <Button disabled={importing} onClick={() => void review()}>{reviewBusy ? 'Checking Draft-only import…' : 'Validate Draft-only import'}
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
            <Button disabled={importing || !readyToImport}
              onClick={() => void commitDrafts()}>
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
