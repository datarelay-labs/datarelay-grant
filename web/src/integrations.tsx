import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api, errorText } from './api';
import { IntegrationDiagnostics } from './integration_diagnostics';
import { IntegrationVerificationManagement } from './integration_verification';
import { Form, Select, TextArea, useTask } from './common';
import type { Integration } from './types';
import {
 IntegrationConnectionDirectory, IntegrationTestConfirmation,
 createIntegrationTestReview, isCurrentIntegrationTestReview,
 createIntegrationTestGuard, submitReviewedIntegrationTest,
 type IntegrationTestReview, type IntegrationTestReceipt,
} from './integration_connection_review';
import {
  IntegrationCreationConfirmation, createIntegrationCreationGuard,
  prepareIntegrationCreationReview, isCurrentIntegrationCreationReview,
  submitReviewedIntegrationCreation,
  type IntegrationRegistrationDraft, type IntegrationCreationReview,
  type IntegrationCreationReceipt,
} from './integration_creation_review';
import {
  CredentialWorklist, CredentialRevokeConfirmation,
  createCredentialReadGate, readScopedCredentials,
  currentCredentialProjection, createCredentialRevokeReview,
  isCurrentCredentialRevokeReview, createCredentialRevokeGuard,
  submitReviewedCredentialRevocation, type CredentialMetadata,
  type CredentialRevokeReview, type CredentialRevokeReceipt,
} from './integration_credential_workspace';
import {
  CredentialIssueConfirmation, OneTimeCredentialSecret,
  prepareCredentialIssueReview, isCurrentCredentialIssueReview,
  createCredentialIssueGuard, submitReviewedCredentialIssue,
  type CredentialIssueReview, type CredentialIssueReceipt,
} from './integration_credential_create_review';
import {
  makeIssuedCredentialHandoff, acceptIssuedCredentialHandoff,
  IssuedCredentialHandoffNotice, SelectedCredentialMetadata,
  type IssuedCredentialHandoff, type IssuedCredentialReceiptMetadata,
} from './integration_credential_handoff';

/** A read-only deep link into the already administrator-guarded diagnostic view.
 * Never use URL input to enter registration or credential mutation workflows. */
export function readIntegrationsInitialView(search: string): 'connections' | 'diagnostics' {
 const params = new URLSearchParams(search);
 return [...params.keys()].length === 1 && params.get('view') === 'diagnostics'
   ? 'diagnostics' : 'connections';
}

export function Integrations() {
 const initialView = typeof window === 'undefined'
   ? 'connections' : readIntegrationsInitialView(window.location.search);
 const [purpose,setPurpose]=useState('producer'); const [rows,setRows]=useState<Integration[]>([]); const [name,setName]=useState(''); const [kind,setKind]=useState('datarelay'); const [url,setUrl]=useState(''); const [tenant,setTenant]=useState(''); const [headers,setHeaders]=useState('{}'); const [hmac,setHmac]=useState(''); const [selected,setSelected]=useState(''); const [scopes,setScopes]=useState(['request:create','request:read']); const [token,setToken]=useState('');
 const [issuedTokenId,setIssuedTokenId]=useState('');
 const [issuedHandoff,setIssuedHandoff]=useState<IssuedCredentialHandoff|null>(null);
 const handoffSequence=useRef(0);
 const issueReadGate=useRef(createCredentialReadGate());
 const lastIssuedReceipt=useRef<IssuedCredentialReceiptMetadata|null>(null);
 const [reviewedCredentialIssue,setReviewedCredentialIssue]=useState<CredentialIssueReview|null>(null);
 const [issueNeedsRefresh,setIssueNeedsRefresh]=useState(false);
 const issueGate=useRef(createCredentialIssueGuard());
 const selectedCredentialRef=useRef('');
 const credentialViewRef=useRef<'connections'|'create'|'security'|'diagnostics'>(initialView);
 const [view,setView]=useState<'connections'|'create'|'security'|'diagnostics'>(initialView);
 const [search,setSearch]=useState('');
 const [reviewedTest,setReviewedTest]=useState<IntegrationTestReview|null>(null);
 const [testNeedsRefresh,setTestNeedsRefresh]=useState(false);
 const testGate=useRef(createIntegrationTestGuard());
 const [decisionMinimum,setDecisionMinimum]=useState('');
 const [eventFormat,setEventFormat]=useState('LEGACY');
 const [reviewedCreation,setReviewedCreation]=useState<IntegrationCreationReview|null>(null);
 const [creationNeedsRefresh,setCreationNeedsRefresh]=useState(false);
 const creationGate=useRef(createIntegrationCreationGuard());
 const draft:IntegrationRegistrationDraft={
   name,kind,tenant:kind==='stellar'?tenant:'',callbackUrl:url,
   headers,hmacSecret:hmac,decisionMinimum,eventFormat,
 };
 const task=useTask();
 const load=async()=>setRows(await api<Integration[]>('/integrations'));
 async function refreshConnections() {
   await load();
   if (testGate.current.readSucceeded()) setTestNeedsRefresh(false);
   if (creationGate.current.readSucceeded()) setCreationNeedsRefresh(false);
   setReviewedTest(null);
   setReviewedCreation(null);
 }
 function openTask(next: 'connections'|'create'|'security'|'diagnostics') {
   credentialViewRef.current=next;
   setReviewedTest(null);
   setReviewedCreation(null);
   setReviewedCredentialIssue(null);
   if(next!=='security'){
     issueReadGate.current.select('');
     lastIssuedReceipt.current=null;setIssuedHandoff(null);
     setToken('');setIssuedTokenId('');
   }
   setView(next);
 }
 function chooseCredentialIntegration(integrationId:string) {
   selectedCredentialRef.current=integrationId;
   issueReadGate.current.select(integrationId);
   lastIssuedReceipt.current=null;setIssuedHandoff(null);
   setSelected(integrationId);
   setReviewedCredentialIssue(null);
   setToken('');setIssuedTokenId('');
 }
 function editCredentialPurpose(next:string) {
   setPurpose(next);
   setReviewedCredentialIssue(null);
   if(next==='producer')setScopes(['request:create','request:read']);
   else if(next==='executor')setScopes(['request:read','grant:consume','result:write']);
   else if(next==='read_only')setScopes(['request:read']);
 }
 function editCredentialScope(scope:string,checked:boolean) {
   setPurpose('custom');
   setReviewedCredentialIssue(null);
   setScopes(current=>checked
     ? [...current,scope] : current.filter(value=>value!==scope));
 }
 function reviewCredentialCreation() {
   if(issueGate.current.blocked())return;
   try {
     const source=rows.find(row=>row.id===selected)??null;
     setReviewedCredentialIssue(prepareCredentialIssueReview(source,scopes,purpose));
   } catch {
     setReviewedCredentialIssue(null);
     task.setNotice('Choose an enabled registered integration and at least one valid scope. Review custom producer/executor privileges carefully.');
   }
 }
 async function confirmCredentialCreation() {
   const frozen=reviewedCredentialIssue;
   const current=rows.find(row=>row.id===selected)??null;
   if(!frozen || !isCurrentCredentialIssueReview(frozen,current,scopes,purpose)
     ||selectedCredentialRef.current!==frozen.integrationId
     ||credentialViewRef.current!=='security') {
     setReviewedCredentialIssue(null);
     throw new Error('CREDENTIAL_ISSUE_CHANGED_REVIEW_REQUIRED');
   }
   if(issueGate.current.blocked())return;
   setReviewedCredentialIssue(null);
   issueReadGate.current.invalidate(frozen.integrationId);
   lastIssuedReceipt.current=null;setIssuedHandoff(null);
   setToken('');setIssuedTokenId('');
   setIssueNeedsRefresh(true);
   try {
     const result=await submitReviewedCredentialIssue(
       frozen,issueGate.current,
       ()=>api<Integration[]>('/integrations'),
       (integrationId,selectedScopes)=>api<CredentialIssueReceipt>(
         '/integrations/tokens','POST',
         {integration_id:integrationId,scopes:selectedScopes}),
       ()=>selectedCredentialRef.current===frozen.integrationId
         &&credentialViewRef.current==='security',
     );
     if(!result||selectedCredentialRef.current!==frozen.integrationId
       ||credentialViewRef.current!=='security')return;
     // Raw secret exists only in ephemeral React component state, and
     // the backend can never return it again from its token list.
     lastIssuedReceipt.current={id:result.id,scopes:[...result.scopes]};
     setIssuedTokenId(result.id);
     setToken(result.token);
     task.setNotice('Credential creation acknowledged by the server. Copy the raw secret once, then explicitly refresh the saved credential list before any new issue.');
   } finally {
     if(!issueGate.current.blocked())setIssueNeedsRefresh(false);
   }
 }
 async function refreshIssuedCredential() {
   const attempted=issueGate.current.attemptedFor();
   if(!attempted||selectedCredentialRef.current!==attempted
     ||credentialViewRef.current!=='security'){
     throw new Error('SELECT_ORIGINAL_CREDENTIAL_INTEGRATION_FIRST');
   }
   // Supersede any earlier same-selection refresh and all old integration
   // responses. The issued metadata already fetched here is handed directly
   // to the real list; never make a second request just to change selection.
   issueReadGate.current.select(attempted);
   const request=issueReadGate.current.begin(attempted);
   if(!request)return;
   const [current,issued]=await Promise.all([
     api<Integration[]>('/integrations'),
     api<CredentialMetadata[]>('/integrations/'+encodeURIComponent(attempted)+'/tokens'),
   ]);
   if(!issueReadGate.current.isCurrent(request)
     ||selectedCredentialRef.current!==attempted
     ||credentialViewRef.current!=='security')return;
   if(!Array.isArray(current)||!Array.isArray(issued))
     throw new Error('CREDENTIAL_LIST_INVALID');
   const handoff=makeIssuedCredentialHandoff(
     attempted,current,issued,lastIssuedReceipt.current,++handoffSequence.current);
   setRows(current);
   setIssuedHandoff(handoff);
   // A known receipt ID missing from saved history can mean readback lag.
   // Show the list, but do not release the issuance latch prematurely.
   if(handoff.expectedCredentialId&&!handoff.selectedCredentialId){
     task.setNotice('Current saved metadata is visible under Issued credentials, but the acknowledged credential ID is not yet verified. Do not reissue automatically; refresh the same integration again.');
     return;
   }
   if(issueGate.current.readSucceeded(attempted)){
     setIssueNeedsRefresh(false);
     setReviewedCredentialIssue(null);
     task.setNotice('Issued credentials now shows this exact integration and its saved credential metadata. Only verified ID and scopes are selectable; raw secrets cannot be retrieved.');
   }
 }
 function reviewConnectionTest(row: Integration) {
   if (testGate.current.blocked()) return;
   setReviewedTest(createIntegrationTestReview(row));
 }
 async function confirmConnectionTest() {
   const frozen=reviewedTest;
   if (!frozen || !isCurrentIntegrationTestReview(
     frozen, rows.find((row)=>row.id===frozen.id),
   )) {
     setReviewedTest(null);
     throw new Error('INTEGRATION_TEST_CHANGED_REVIEW_REQUIRED');
   }
   if (testGate.current.blocked()) return;
   setReviewedTest(null);
   setTestNeedsRefresh(true);
   try {
     const result=await submitReviewedIntegrationTest(
       frozen,testGate.current,
       ()=>api<Integration[]>('/integrations'),
       (integrationId)=>api<IntegrationTestReceipt>(
         '/integrations/'+encodeURIComponent(integrationId)+'/test','POST'),
     );
     if (!result) return;
     task.setNotice('Diagnostic transport accepted by the receiver. This is not human approval or verified external execution. Refresh saved connections before another test.');
   } finally {
     if (!testGate.current.blocked()) setTestNeedsRefresh(false);
   }
 }
 useEffect(()=>{void task.run(load);},[]);
 function reviewCreation() {
   if (creationGate.current.blocked()) return;
   try {
     setReviewedCreation(prepareIntegrationCreationReview(draft));
   } catch {
     setReviewedCreation(null);
     task.setNotice('Provide a name, installation-approved HTTPS callback, valid JSON string headers, Stellar tenant where required, and explicitly select the decision verification minimum.');
   }
 }
 async function confirmCreation() {
   const frozen=reviewedCreation;
   if (!frozen || !isCurrentIntegrationCreationReview(frozen,draft)) {
     setReviewedCreation(null);
     throw new Error('INTEGRATION_CREATION_CHANGED_REVIEW_REQUIRED');
   }
   if (creationGate.current.blocked()) return;
   setReviewedCreation(null);
   setCreationNeedsRefresh(true);
   try {
     const result=await submitReviewedIntegrationCreation(
       frozen,creationGate.current,
       (payload)=>api<IntegrationCreationReceipt>('/integrations','POST',payload),
     );
     if (!result) return;
     setName('');setUrl('');setTenant('');setHeaders('{}');setHmac('');
     setDecisionMinimum('');setEventFormat('LEGACY');
     try { await load(); } catch {}
     task.setNotice('Registration acknowledged by the server. Receiver connectivity and decision authorization are separate; refresh saved connections before another registration.');
   } finally {
     if (!creationGate.current.blocked()) setCreationNeedsRefresh(false);
   }
 }
 return <div className="grant-stack">
 {task.feedback}
 <section className="grant-page-heading" aria-labelledby="grant-integrations-title">
  <div>
   <p className="grant-eyebrow">Configuration</p>
   <h2 id="grant-integrations-title">Integrations</h2>
   <p>Review installation-registered destinations first. Test transport,
     security settings and scoped credentials are separate administrator tasks.</p>
  </div>
 </section>
 <nav className="grant-tabs" aria-label="Integration tasks">
  <button type="button" aria-current={view==='connections'?'page':undefined}
    onClick={()=>openTask('connections')}>Connections</button>
  <button type="button" aria-current={view==='create'?'page':undefined}
    onClick={()=>openTask('create')}>Add connection</button>
  <button type="button" aria-current={view==='security'?'page':undefined}
    onClick={()=>openTask('security')}>Credential tools</button>
  <button type="button" aria-current={view==='diagnostics'?'page':undefined}
    onClick={()=>openTask('diagnostics')}>Diagnostics</button>
 </nav>
 {(testGate.current.blocked() || creationGate.current.blocked()) && <Alert tone="warning"
   title="Reconcile connection change before another attempt">
   {creationGate.current.blocked()
     ? (creationNeedsRefresh
       ? 'A connection registration POST may already have committed. No automatic retry is allowed.'
       : 'Connection registration requires a fresh saved-connections read.')
     : (testNeedsRefresh
       ? 'A diagnostic webhook POST may have been accepted; it will not be retried automatically.'
       : 'The previous connection test needs a fresh saved-connections read.')}
   <Button variant="secondary" disabled={task.busy}
     onClick={()=>void task.run(refreshConnections)}>
     Refresh saved connections
   </Button>
 </Alert>}
 {view==='connections' && <>
  <IntegrationConnectionDirectory rows={rows} search={search}
    busy={task.busy || testGate.current.blocked()}
    onSearchChange={setSearch}
    onOpenCreation={()=>openTask('create')}
    onReviewTest={reviewConnectionTest} />
  <IntegrationTestConfirmation reviewed={reviewedTest} busy={task.busy || testGate.current.blocked()}
    valid={isCurrentIntegrationTestReview(
      reviewedTest,rows.find((row)=>row.id===reviewedTest?.id))}
    onCancel={()=>setReviewedTest(null)}
    onConfirm={()=>{void task.run(confirmConnectionTest);}} />
 </>}
 {view==='security' && <>
  <IntegrationVerificationManagement integrations={rows} onChanged={load} />
 </>}
 {view==='create' && <>
  <Card title="Add integration">
    <p>1. Define a registered connection and select its explicit email
      decision verification minimum. 2. Review the destination origin,
      credential presence and assurance level. 3. Confirm one creation POST.
      Registration is not a connection test or approval.</p>
    <Form busy={task.busy || creationGate.current.blocked()} onSubmit={reviewCreation}
      label="Review connection registration">
      <TextField label="Integration name" required maxLength={100} value={name}
        onChange={(e)=>{setName(e.target.value);setReviewedCreation(null);}}/>
      <Select label="Integration type" value={kind}
        onChange={(value)=>{setKind(value);setReviewedCreation(null);}}>
        <option value="datarelay">DataRelay</option>
        <option value="stellar">Stellar Cyber</option>
      </Select>
      {kind==='stellar' && <TextField label="Allowed Stellar tenant ID"
        required maxLength={200} value={tenant}
        onChange={(e)=>{setTenant(e.target.value);setReviewedCreation(null);}}/>}
      <Select label="Decision verification minimum" value={decisionMinimum}
        onChange={(value)=>{setDecisionMinimum(value);setReviewedCreation(null);}}>
        <option value="">Choose required approval verification</option>
        <option value="EMAIL_PIN">Email link + PIN (mailbox possession)</option>
        <option value="EMAIL_PIN_PLUS_OTP">Email PIN + same-mailbox OTP (not MFA)</option>
        <option value="EMAIL_PIN_PLUS_MFA">Email PIN + fresh independent Grant TOTP</option>
      </Select>
      <Select label="Outbound callback format" value={eventFormat}
        onChange={(value)=>{setEventFormat(value);setReviewedCreation(null);}}>
        <option value="LEGACY">Legacy Grant JSON (existing receivers)</option>
        <option value="CLOUDEVENTS">CloudEvents 1.0 structured JSON (receiver opt-in)</option>
      </Select>
      <p>Choose CloudEvents only for a receiver that explicitly supports the
        new envelope. Existing integrations and queued messages remain in
        their original format. This does not change execution authorization.</p>
      <TextField label="Registered callback URL" type="url" required
        maxLength={2048} value={url}
        onChange={(e)=>{setUrl(e.target.value);setReviewedCreation(null);}}
        hint="The server enforces installation-approved destinations. HTTPS outside loopback development."/>
      <TextArea label="Callback headers (JSON; stored encrypted)" value={headers}
        onChange={(value)=>{setHeaders(value);setReviewedCreation(null);}}/>
      <TextField label="Optional callback HMAC secret" type="password"
        autoComplete="off" value={hmac} maxLength={256}
        onChange={(e)=>{setHmac(e.target.value);setReviewedCreation(null);}}/>
    </Form>
    <IntegrationCreationConfirmation reviewed={reviewedCreation}
      valid={isCurrentIntegrationCreationReview(reviewedCreation,draft)}
      busy={task.busy || creationGate.current.blocked()}
      onCancel={()=>setReviewedCreation(null)}
      onConfirm={()=>{void task.run(confirmCreation);}}/>
  </Card>
 </>}
 {view==='security' && <>
  <Card title="Create scoped integration credential"
    description="Review the exact enabled connection and least-privilege scopes before one credential creation. It cannot make human decisions.">
    <Form busy={task.busy || issueGate.current.blocked()}
      label="Review scoped credential" onSubmit={reviewCredentialCreation}>
      <Select label="Token integration" value={selected} onChange={chooseCredentialIntegration}>
        <option value="">Select an enabled integration</option>
        {rows.filter(row=>row.enabled).map(row=>
          <option key={row.id} value={row.id}>{row.name}</option>)}
      </Select>
      <Select label="Credential purpose" value={purpose} onChange={editCredentialPurpose}>
        <option value="producer">Producer — submit and read requests</option>
        <option value="executor">Executor — consume approved grants and report results</option>
        <option value="read_only">Read-only request observer</option>
        <option value="custom">Advanced custom scopes</option>
      </Select>
      <fieldset className="grant-stack">
        <legend>Exact API scopes to review</legend>
        {['request:create','request:read','grant:consume','result:write'].map(scope=>
          <label key={scope}>
            <input type="checkbox" checked={scopes.includes(scope)}
              onChange={event=>editCredentialScope(scope,event.target.checked)}/>
            {' '}{scope}
          </label>)}
      </fieldset>
      {scopes.includes('request:create')&&
        scopes.some(value=>['grant:consume','result:write'].includes(value))&&
        <Alert tone="warning" title="Mixed integration credential">
          This credential combines producer and executor privileges.
          Review the mixed scope warning at final Confirm. Prefer separate
          credentials for least privilege when practical.
        </Alert>}
    </Form>
    <CredentialIssueConfirmation
      reviewed={reviewedCredentialIssue}
      valid={isCurrentCredentialIssueReview(reviewedCredentialIssue,
        rows.find(row=>row.id===selected)??null,scopes,purpose)}
      busy={task.busy || issueGate.current.blocked()}
      onBack={()=>setReviewedCredentialIssue(null)}
      onConfirm={()=>{void task.run(confirmCredentialCreation);}}
    />
    {issueGate.current.blocked()&&
      <Alert tone="warning" title="Reconcile credential issuance">
        {issueNeedsRefresh
          ? 'A scoped credential creation POST may have committed. Never retry it automatically.'
          : 'This credential creation needs a fresh role-scoped history read.'}
        {' '}Select the original integration
        {' '}{issueGate.current.attemptedFor()} and explicitly refresh saved
        credential identifiers. History never returns the raw secret.
        <Button variant="secondary" disabled={task.busy
          || selectedCredentialRef.current!==issueGate.current.attemptedFor()}
          onClick={()=>void task.run(refreshIssuedCredential)}>
          Refresh issued credentials
        </Button>
      </Alert>}
    <OneTimeCredentialSecret raw={token} tokenId={issuedTokenId}
      onHide={()=>{setToken('');setIssuedTokenId('');}}/>
  </Card>
  <CredentialList integrations={rows} handoff={issuedHandoff}/>
 </>}
 {view==='diagnostics' && <IntegrationDiagnostics integrations={rows}/>}
 </div>;
}

/** Role-scoped credential worklist. Credentials for a previously selected
 * connection cannot appear under the next connection while GETs overlap.
 */
export function CredentialList({integrations,handoff=null}:{
 integrations:Integration[];handoff?:IssuedCredentialHandoff|null;
}) {
 const [selected,setSelected]=useState('');
 const [projection,setProjection]=useState<{key:string;rows:CredentialMetadata[]}|null>(null);
 const [reviewed,setReviewed]=useState<CredentialRevokeReview|null>(null);
 const [selectedTokenId,setSelectedTokenId]=useState('');
 const [acceptedHandoff,setAcceptedHandoff]=useState<IssuedCredentialHandoff|null>(null);
 const adoptedSequence=useRef(0);
 const [needsReconciliation,setNeedsReconciliation]=useState(false);
 const readGate=useRef(createCredentialReadGate());
 const revokeGuard=useRef(createCredentialRevokeGuard());
 const task=useTask();
 const rows=currentCredentialProjection(projection,selected);
 useEffect(()=>{
   adoptedSequence.current=acceptIssuedCredentialHandoff(
     readGate.current,handoff,adoptedSequence.current,incoming=>{
       setSelected(incoming.integrationId);
       setProjection({key:incoming.integrationId,rows:[...incoming.rows]});
       setSelectedTokenId(incoming.selectedCredentialId);
       setReviewed(null);
       setAcceptedHandoff(incoming);
     });
 },[handoff]);

 async function readSelected(integrationId=selected):Promise<boolean> {
   return readScopedCredentials(readGate.current,integrationId,
     ()=>api<CredentialMetadata[]>('/integrations/'
       +encodeURIComponent(integrationId)+'/tokens'),
     (fresh)=>setProjection({key:integrationId,rows:fresh}));
 }

 function selectIntegration(id:string) {
   setSelectedTokenId('');setAcceptedHandoff(null);
   readGate.current.select(id);
   setSelected(id);
   setProjection(null);
   setReviewed(null);
   if(!id) return;
   // Do not funnel through useTask's stale busy bit: a second role-scoped
   // choice must load even while the old choice is still in flight.
   void readSelected(id).catch((error)=>{
     if(readGate.current.isSelected(id)) task.setNotice(errorText(error));
   });
 }

 async function refresh() {
   const accepted=await readSelected(selected);
   if(!accepted) return;
   setAcceptedHandoff(null);
   if(revokeGuard.current.readSucceeded(selected)) setNeedsReconciliation(false);
   setReviewed(null);
   task.setNotice('Current credential identifiers and scopes refreshed. No raw secret was returned.');
 }

 function reviewRevoke(row:CredentialMetadata) {
   if(revokeGuard.current.blocked()) return;
   setReviewed(createCredentialRevokeReview(selected,row));
 }

 async function confirmRevoke() {
   const intent=reviewed;
   if(!intent||!isCurrentCredentialRevokeReview(intent,selected,
     rows.find(row=>row.id===intent.tokenId))) {
     setReviewed(null);
     throw new Error('CREDENTIAL_CHANGED_REVIEW_REQUIRED');
   }
   if(revokeGuard.current.blocked()) return;
   setReviewed(null);
   setNeedsReconciliation(true);
   try {
     const result=await submitReviewedCredentialRevocation(
       intent,revokeGuard.current,
       ()=>api<CredentialMetadata[]>('/integrations/'
         +encodeURIComponent(intent.integrationId)+'/tokens'),
       (tokenId)=>api<CredentialRevokeReceipt>(
         '/integrations/tokens/'+encodeURIComponent(tokenId)+'/revoke','POST'),
       ()=>readGate.current.isSelected(intent.integrationId),
     );
     if(!result||!readGate.current.isSelected(intent.integrationId)) return;
     readGate.current.invalidate(intent.integrationId);
     setSelectedTokenId('');setAcceptedHandoff(null);
     setProjection(null);
     // Read-only follow-up does not release the possibly committed
     // credential effect latch; explicit Refresh must reconcile it.
     readGate.current.select(intent.integrationId);
     try { await readSelected(intent.integrationId); }
     catch {}
     task.setNotice('Server acknowledged credential revocation. Previously committed external actions are not undone. Refresh this integration before another credential change.');
   } finally {
     if(!revokeGuard.current.blocked()) setNeedsReconciliation(false);
   }
 }

 return <Card title="Issued credentials"
   description="Select one integration to inspect its active token IDs and scoped roles. Revocation affects future requests, not prior external actions.">
   {task.feedback}
   <Select label="Inspect credential integration" required={false} value={selected}
     onChange={selectIntegration}>
     <option value="">Select registered connection</option>
     {integrations.map(item=><option key={item.id} value={item.id}>
       {item.name}</option>)}
   </Select>
   <Button variant="secondary" disabled={task.busy||!selected}
     onClick={()=>void task.run(async()=>{await refresh();})}>
     Refresh credentials
   </Button>
   {revokeGuard.current.blocked() &&
     <Alert tone="warning" title="Reconcile credential revocation">
       {needsReconciliation
         ? 'A credential revocation POST may already have succeeded. No automatic retry.'
         : 'A previous credential revocation needs an explicit saved-token refresh.'}
       {' '}Return to the originally selected integration
       {' '}{revokeGuard.current.attemptedFor()} and refresh its credentials
       before another privileged change.
     </Alert>}
   <IssuedCredentialHandoffNotice handoff={
     acceptedHandoff?.integrationId===selected?acceptedHandoff:null}/>
   {selected
     ? <CredentialWorklist rows={rows}
         busy={task.busy||revokeGuard.current.blocked()}
         selectedId={selectedTokenId}
         onSelect={row=>{setSelectedTokenId(row.id);setReviewed(null);}}
         onReviewRevoke={reviewRevoke}/>
     : <p>Select a registered connection to inspect issued credential IDs.</p>}
   <SelectedCredentialMetadata integrationId={selected}
     credential={rows.find(row=>row.id===selectedTokenId)??null}/>
   <CredentialRevokeConfirmation reviewed={reviewed}
     valid={isCurrentCredentialRevokeReview(reviewed,selected,
       rows.find(row=>row.id===reviewed?.tokenId))}
     busy={task.busy||revokeGuard.current.blocked()}
     onBack={()=>setReviewed(null)}
     onConfirm={()=>{void task.run(confirmRevoke);}}/>
 </Card>;
}
