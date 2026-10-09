import { useState } from 'react';
import { Alert, Button, Card } from '@datarelay-labs/foundation';
import { api } from './api';
import { Select, TextArea, useTask } from './common';
import type { Integration } from './types';

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
        {direction === 'lower' ? 'Confirm lower minimum' : 'Save verification minimum'}
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
  const task = useTask();
  const integration = integrations.find((item) => item.id === selectedId);

  function choose(id: string) {
    setSelectedId(id);
    const current = integrations.find((item) => item.id === id);
    setSelectedMode(validMinimum(current?.decision_verification_minimum)
      ? current.decision_verification_minimum : 'EMAIL_PIN');
    setReason('');
    setConfirmedReduction(false);
  }

  function chooseMinimum(mode: IntegrationVerificationMinimum) {
    setSelectedMode(mode);
    setConfirmedReduction(false);
  }

  async function save() {
    const payload = prepareIntegrationVerificationChange(
      integration, selectedMode, reason, confirmedReduction,
    );
    await api(
      '/integrations/' + encodeURIComponent(integration!.id) + '/decision-verification',
      'PUT',
      payload,
    );
    await onChanged();
    setReason('');
    setConfirmedReduction(false);
    task.setNotice(
      'Integration verification minimum updated and audited. Existing '
      + 'request snapshots were not overwritten.',
    );
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
          busy={task.busy}
          onMode={chooseMinimum}
          onReason={setReason}
          onConfirm={setConfirmedReduction}
          onSave={() => void task.run(save)}
        />
      ) : (
        <p>Select an integration to inspect its current verification minimum.</p>
      )}
    </Card>
  );
}
