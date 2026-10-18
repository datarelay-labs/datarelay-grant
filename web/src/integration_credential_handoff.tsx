import { Alert } from '@datarelay-labs/foundation';
import type { Integration } from './types';
import { when } from './common';
import type { CredentialMetadata } from './integration_credential_workspace';
import { createCredentialReadGate } from './integration_credential_workspace';

export type IssuedCredentialReceiptMetadata = Readonly<{
  id:string;scopes:readonly string[];
}>;
export type IssuedCredentialHandoff = Readonly<{
  sequence:number;
  integrationId:string;
  integrationName:string;
  expectedCredentialId:string;
  selectedCredentialId:string;
  rows:readonly CredentialMetadata[];
}>;

/** Only server-read, role-scoped metadata is passed to the credential list.
 * Never move raw issuance receipts/secrets or unknown API fields across UI
 * components. A receipt ID is selected only when saved history confirms
 * that exact active ID with the same issued scopes.
 */
export function makeIssuedCredentialHandoff(
  integrationId:string,
  integrations:readonly Integration[],
  metadata:readonly CredentialMetadata[],
  receipt:IssuedCredentialReceiptMetadata|null,
  sequence:number,
):IssuedCredentialHandoff {
  const integration=integrations.find(row=>row.id===integrationId);
  if(!integrationId||!integration || !Number.isSafeInteger(sequence)||sequence<1){
    throw new Error('CREDENTIAL_HANDOFF_INTEGRATION_MISSING');
  }
  if(!Array.isArray(metadata) || new Set(metadata.map(row=>row?.id)).size!==metadata.length ||
    metadata.some(row=>!row||typeof row.id!=='string'||!row.id.trim()
      ||typeof row.enabled!=='boolean'
      ||!Number.isFinite(row.created_at)
      ||!Array.isArray(row.scopes)
      ||row.scopes.some((scope:unknown)=>typeof scope!=='string'))){
    throw new Error('CREDENTIAL_HANDOFF_METADATA_INVALID');
  }
  const rows=metadata.map(row=>({
    id:row.id,scopes:[...row.scopes],enabled:row.enabled,
    created_at:row.created_at,
  }));
  const expectedCredentialId=receipt?.id??'';
  // The backend persists sorted(set(scopes)) but the issue receipt echoes
  // reviewed input order. Privilege equality is exact set equality, not
  // array insertion order, and duplicate or missing scopes must fail.
  const exactScopes=(saved:readonly string[],issued:readonly string[])=>
    saved.length===issued.length
    && new Set(saved).size===saved.length
    && new Set(issued).size===issued.length
    && saved.every(scope=>issued.includes(scope));
  const matched=Boolean(receipt && rows.some(row=>row.id===receipt.id
    && row.enabled && exactScopes(row.scopes,receipt.scopes)));
  return {
    sequence,integrationId,integrationName:integration.name,
    expectedCredentialId,
    selectedCredentialId:matched?expectedCredentialId:'',
    rows,
  };
}

/** Adopt once, and invalidate all outstanding GETs from the previous
 * list selection. This is a read-only transfer, never a token issuance.
 */
export function acceptIssuedCredentialHandoff(
  gate:ReturnType<typeof createCredentialReadGate>,
  handoff:IssuedCredentialHandoff|null,
  lastSequence:number,
  present:(handoff:IssuedCredentialHandoff)=>void,
):number{
  if(!handoff||handoff.sequence<=lastSequence)return lastSequence;
  gate.select(handoff.integrationId);
  gate.invalidate(handoff.integrationId);
  present(handoff);
  return handoff.sequence;
}

export function IssuedCredentialHandoffNotice({handoff}:{
  handoff:IssuedCredentialHandoff|null;
}){
  if(!handoff)return null;
  return <Alert tone="warning" title="Issued credentials — saved metadata">
    <p>Showing role-scoped saved credential metadata for
      {' '}{handoff.integrationName} (<code>{handoff.integrationId}</code>).
      No new credential was issued by this handoff and no raw secret
      is available here.</p>
    {handoff.selectedCredentialId
      ? <p>Issued credential <code>{handoff.selectedCredentialId}</code>
          {' '}is verified in the saved list and selected for inspection.</p>
      : handoff.expectedCredentialId
        ? <p>Credential <code>{handoff.expectedCredentialId}</code> is
            {' '}not yet verified in saved credentials. Do not assume its
            absence means the issue POST failed or issue another token
            automatically. Refresh the original integration again.</p>
        : <p>There was no issuance receipt for an exact token ID. Inspect
            the current saved list for this integration before reviewing
            any separate issuance. A successful GET cannot prove an
            ambiguous POST failed.</p>}
  </Alert>;
}

export function SelectedCredentialMetadata({integrationId,credential}:{
  integrationId:string;credential:CredentialMetadata|null;
}){
  if(!credential)return null;
  return <section aria-label="Selected credential metadata">
    <h4>Selected credential — read-only metadata</h4>
    <dl className="grant-facts">
      <dt>Integration ID</dt><dd><code>{integrationId}</code></dd>
      <dt>Issued credential ID</dt><dd><code>{credential.id}</code></dd>
      <dt>Current status</dt><dd>{credential.enabled?'Enabled':'Revoked'}</dd>
      <dt>Scopes</dt><dd>{credential.scopes.join(', ')}</dd>
      <dt>Issued</dt><dd>{when(credential.created_at)}</dd>
    </dl>
    <p>Raw credentials cannot be retrieved. Viewing metadata does not
      authorize an approval, privileged revoke, or external execution.</p>
  </section>;
}
