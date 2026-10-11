import { useRef, useState } from 'react';
import { Alert, Button, Card } from '@datarelay-labs/foundation';
import { api } from './api';
import { Select, TextArea, useTask } from './common';
import type { Integration } from './types';
import {
  IntegrationVerificationConfirmation, createIntegrationVerificationGuard,
  prepareIntegrationVerificationReview, isCurrentIntegrationVerificationReview,
  submitReviewedIntegrationVerification,
  type IntegrationVerificationReview, type VerificationPayload,
  type IntegrationVerificationReceipt,
} from './integration_verification_review';

export const VERIFICATION_MINIMUMS = [
  'EMAIL_PIN', 'EMAIL_PIN_PLUS_OTP', 'EMAIL_PIN_PLUS_MFA',
] as const;

export type IntegrationVerificationMinimum = typeof VERIFICATION_MINIMUMS[number];

function rank(value: IntegrationVerificationMinimum): number {
  return VERIFICATION_MINIMUMS.indexOf(value);
}

export function validMinimum(
  value: unknown,
): value is IntegrationVerificationMinimum {
  return VERIFICATION_MINIMUMS.includes(value as IntegrationVerificationMinimum);
}

export function minimumDirection(
  current: IntegrationVerificationMinimum, next: IntegrationVerificationMinimum,
): 'lower' | 'same' | 'higher' {
  const difference = rank(next) - rank(current);
  return difference === 0 ? 'same' : difference < 0 ? 'lower' : 'higher';
}

/** Never issue an unqualified downgrade. A reason is mandatory at the server
 * and a future-approval-security downgrade requires explicit acknowledgement.
 */
export function prepareIntegrationVerificationChange(
  integration: Integration | undefined,
  nextMode: unknown,
  reason: string,
  confirmedReduction: boolean,
): { decision_verification_minimum: IntegrationVerificationMinimum; reason: string } {
  if (!integration || !integration.enabled) {
    throw new Error('INTEGRATION_VERIFICATION_NOT_AVAILABLE');
  }
  const current = integration.decision_verification_minimum;
  if (!validMinimum(current)) {
    throw new Error('INTEGRATION_VERIFICATION_CONTRACT_UNAVAILABLE');
  }
  if (!validMinimum(nextMode)) {
    throw new Error('INTEGRATION_VERIFICATION_MODE_INVALID');
  }
  if (current === nextMode) {
    throw new Error('INTEGRATION_VERIFICATION_NO_CHANGE');
  }
  const bounded = reason.trim();
  if (bounded.length < 5 || bounded.length > 1000) {
    throw new Error('INTEGRATION_VERIFICATION_REASON_REQUIRED');
  }
  if (minimumDirection(current, nextMode) === 'lower' && !confirmedReduction) {
    throw new Error('INTEGRATION_VERIFICATION_REDUCTION_UNCONFIRMED');
  }
  return {
    decision_verification_minimum: nextMode,
    reason: bounded,
  };
}

export function IntegrationMinimumEditor({
  integration, selectedMode, reason, confirmedReduction,
  busy, onMode, onReason, onConfirm, onSave,
}: {
  integration: Integration;
  selectedMode: IntegrationVerificationMinimum;
  reason: string;
  confirmedReduction: boolean;
  busy: boolean;
  onMode: (value: IntegrationVerificationMinimum) => void;
  onReason: (value: string) => void;
  onConfirm: (value: boolean) => void;
  onSave: () => void;
}) {
  const current = integration.decision_verification_minimum;
  if (!validMinimum(current)) {
    return <Alert tone="critical" title="Verification minimum unavailable">
      The connected backend did not expose the current integration verification
      minimum. No change is allowed without reading the existing security floor.
    </Alert>;
  }
  if (!integration.enabled) {
    return <Alert tone="warning" title="Integration disabled">
      The integration must be enabled before its verification policy can be changed.
    </Alert>;
  }
  const direction = validMinimum(selectedMode)
    ? minimumDirection(current, selectedMode)
    : 'same';
  const reasonReady = reason.trim().length >= 5 && reason.trim().length <= 1000;
  const isChange = direction !== 'same';

  return (
    <div className="grant-stack">
      <p>
        Current minimum: <strong>{current}</strong>. This is the integration-level
        floor, not necessarily the effective requirement for each approval
        policy. The server also enforces request-time snapshots and action floors.
      </p>
      <Select
        label="Required email decision verification"
        value={selectedMode}
        onChange={(value) => onMode(value as IntegrationVerificationMinimum)}
      >
        <option value="EMAIL_PIN">Email link + four-digit PIN</option>
        <option value="EMAIL_PIN_PLUS_OTP">Email PIN + same-mailbox OTP (NOT MFA)</option>
        <option value="EMAIL_PIN_PLUS_MFA">Email PIN + fresh signed-in Grant TOTP</option>
      </Select>
      <TextArea
        label="Reason for verification policy change"
        value={reason}
        onChange={onReason}
        required
      />
      <small>Reason must contain 5–1,000 characters and must not include
        credentials or sensitive tokens. Changes are audited and do not
        overwrite the request-time security snapshots.</small>
      {direction === 'lower' ? (
        <Alert tone="warning" title="Confirm lower verification minimum">
          <p>
            Lowering this minimum can allow weaker verification for NEW
            requests. Existing request snapshots remain enforced. A PIN or
            extra code in the SAME mailbox is NOT independent MFA.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmedReduction}
              onChange={(event) => onConfirm(event.target.checked)}
            /> I understand this lowers the integration security minimum
          </label>
        </Alert>
      ) : null}
      {selectedMode === 'EMAIL_PIN_PLUS_MFA' ? (
        <p>
          Fresh MFA needs a signed-in, enabled Grant account with a newly
          verified TOTP. The loginless decision Web screen and direct-user
          E2E are not complete.
        </p>
      ) : null}
      <Button
        disabled={busy || !isChange || !reasonReady ||
          (direction === 'lower' && !confirmedReduction)}
        onClick={onSave}
      >
        {direction === 'lower' ? 'Review lower minimum' : 'Review verification minimum change'}
      </Button>
    </div>
  );
}

export function IntegrationVerificationManagement({
  integrations, onChanged,
}: {
  integrations: Integration[];
  onChanged: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [selectedMode, setSelectedMode] =
    useState<IntegrationVerificationMinimum>('EMAIL_PIN');
  const [reason, setReason] = useState('');
  const [confirmedReduction, setConfirmedReduction] = useState(false);
  const [reviewed,setReviewed]=useState<IntegrationVerificationReview|null>(null);
  const [reconcileRequired,setReconcileRequired]=useState(false);
  const guard=useRef(createIntegrationVerificationGuard());
  const selectedRef=useRef('');
  const task = useTask();
  const integration = integrations.find((item) => item.id === selectedId);

  function choose(id: string) {
    selectedRef.current=id;
    setSelectedId(id);
    setReviewed(null);
    const current = integrations.find((item) => item.id === id);
    setSelectedMode(validMinimum(current?.decision_verification_minimum)
      ? current.decision_verification_minimum : 'EMAIL_PIN');
    setReason('');
    setConfirmedReduction(false);
  }

  function chooseMinimum(mode: IntegrationVerificationMinimum) {
    setSelectedMode(mode);
    setConfirmedReduction(false);
    setReviewed(null);
  }
  const candidate:VerificationPayload|null=(()=>{
    try{
      return prepareIntegrationVerificationChange(
        integration,selectedMode,reason,confirmedReduction);
    }catch{return null;}
  })();

  function reviewChange(){
    if(guard.current.blocked())return;
    if(!candidate){
      task.setNotice('Select an enabled integration and a changed verification minimum, provide a valid reason, and explicitly acknowledge any reduction.');
      setReviewed(null);
      return;
    }
    try{
      setReviewed(prepareIntegrationVerificationReview(integration,candidate));
    }catch{
      setReviewed(null);
      task.setNotice('The selected verification floor is unavailable. Refresh saved integrations and review again.');
    }
  }

  async function confirmChange(){
    const intent=reviewed;
    if(!intent||!candidate
      ||!isCurrentIntegrationVerificationReview(intent,integration,candidate)
      ||selectedRef.current!==intent.integrationId){
      setReviewed(null);
      throw Error('VERIFICATION_REVIEW_CHANGED');
    }
    if(guard.current.blocked())return;
    setReviewed(null);
    setReconcileRequired(true);
    try{
      const receipt=await submitReviewedIntegrationVerification(
        intent,guard.current,
        ()=>api<Integration[]>('/integrations'),
        (id,exact)=>api<IntegrationVerificationReceipt>(
          '/integrations/'+encodeURIComponent(id)+'/decision-verification',
          'PUT',exact),
        ()=>selectedRef.current===intent.integrationId,
      );
      if(!receipt||selectedRef.current!==intent.integrationId)return;
      // The server PUT receipt proves the selected policy update was
      // acknowledged; an optional GET cannot turn a committed PUT into a
      // reason for a second mutation.
      task.setNotice('Server acknowledged verification policy change. Explicitly refresh saved integration metadata before reviewing another update; existing request snapshots remain unchanged.');
      try {await onChanged();} catch {
        // Keep the one-shot latch; a failed optional read is not a failed PUT.
      }
    }finally{
      if(!guard.current.blocked())setReconcileRequired(false);
    }
  }

  async function refreshAttempt(){
    const id=guard.current.attemptedFor();
    if(!id||selectedRef.current!==id){
      throw Error('SELECT_ORIGINAL_VERIFICATION_INTEGRATION_FIRST');
    }
    const current=await api<Integration[]>('/integrations');
    const row=current.find(item=>item.id===id);
    if(!row||!row.enabled||!validMinimum(row.decision_verification_minimum)){
      throw Error('VERIFICATION_SAVED_STATE_UNAVAILABLE');
    }
    if(selectedRef.current!==id)return;
    // Reconcile the same selected integration with authoritative role-scoped
    // readback, not a different connection's change or an automatic retry.
    await onChanged();
    if(selectedRef.current!==id)return;
    if(guard.current.readSucceeded(id)){
      setReconcileRequired(false);
      setReviewed(null);
      setSelectedMode(row.decision_verification_minimum);
      setReason('');
      setConfirmedReduction(false);
      task.setNotice('Saved verification minimum confirmed for this integration: '+row.decision_verification_minimum+'. Review again before a separate change.');
    }
  }

  return (
    <Card
      title="Approval verification minimum"
      description="Administrator-configured per-integration minimum. This changes verification policy only; it does not issue credentials, authorize a decision, or execute an action."
    >
      {task.feedback}
      <Select
        label="Integration security policy"
        value={selectedId}
        onChange={choose}
        required={false}
      >
        <option value="">Select registered integration</option>
        {integrations.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
      {integration ? (
        <IntegrationMinimumEditor
          integration={integration}
          selectedMode={selectedMode}
          reason={reason}
          confirmedReduction={confirmedReduction}
          busy={task.busy||guard.current.blocked()}
          onMode={chooseMinimum}
          onReason={value=>{setReason(value);setReviewed(null);}}
          onConfirm={value=>{setConfirmedReduction(value);setReviewed(null);}}
          onSave={reviewChange}
        />
      ) : (
        <p>Select an integration to inspect its current verification minimum.</p>
      )}
      <IntegrationVerificationConfirmation reviewed={reviewed}
        valid={Boolean(candidate&&isCurrentIntegrationVerificationReview(
          reviewed,integration,candidate))}
        busy={task.busy||guard.current.blocked()}
        onBack={()=>setReviewed(null)}
        onConfirm={()=>{void task.run(confirmChange);}}/>
      {guard.current.blocked()&&<Alert tone="warning"
        title="Reconcile verification minimum change">
        {reconcileRequired
          ? 'A verification minimum PUT may already have committed. Do not retry automatically.'
          : 'An earlier verification minimum update still needs a current saved-state check.'}
        {' '}Select the originally changed integration
        {' '}{guard.current.attemptedFor()} and refresh its saved minimum.
        This client review does not supply server-side two-admin CAS.
        <Button variant="secondary" disabled={task.busy||
          selectedRef.current!==guard.current.attemptedFor()}
          onClick={()=>void task.run(refreshAttempt)}>
          Refresh verification minimum
        </Button>
      </Alert>}
    </Card>
  );
}
