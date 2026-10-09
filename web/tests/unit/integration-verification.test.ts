import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  IntegrationMinimumEditor, IntegrationVerificationManagement,
  minimumDirection, prepareIntegrationVerificationChange, validMinimum,
  VERIFICATION_MINIMUMS,
  type IntegrationVerificationMinimum,
} from '../../src/integration_verification';
import type { Integration } from '../../src/types';

const current: Integration = {
  id: 'integration-uuid', name: 'Customer automation',
  kind: 'datarelay', tenant: '', enabled: true,
  callback_origin: 'https://internal.example.invalid',
  decision_verification_minimum: 'EMAIL_PIN_PLUS_MFA',
};

function panel(
  row: Integration,
  mode: IntegrationVerificationMinimum,
  reason = 'Verified customer authorization',
  confirmation = false,
) {
  return renderToStaticMarkup(createElement(IntegrationMinimumEditor, {
    integration: row,
    selectedMode: mode,
    reason,
    confirmedReduction: confirmation,
    busy: false,
    onMode: () => undefined,
    onReason: () => undefined,
    onConfirm: () => undefined,
    onSave: () => undefined,
  }));
}

describe('G10A administrator-owned integration verification minimum', () => {
  it('enforces exactly the three supported backend modes and monotonic order', () => {
    expect(VERIFICATION_MINIMUMS).toEqual([
      'EMAIL_PIN', 'EMAIL_PIN_PLUS_OTP', 'EMAIL_PIN_PLUS_MFA',
    ]);
    expect(validMinimum('EMAIL_PIN')).toBe(true);
    expect(validMinimum('EMAIL_PIN_PLUS_OTP')).toBe(true);
    expect(validMinimum('EMAIL_PIN_PLUS_MFA')).toBe(true);
    for (const invalid of ['', 'INHERIT', 'FAKE_MFA', null, undefined, 0, {}]) {
      expect(validMinimum(invalid)).toBe(false);
    }
    expect(minimumDirection('EMAIL_PIN', 'EMAIL_PIN_PLUS_MFA')).toBe('higher');
    expect(minimumDirection('EMAIL_PIN_PLUS_MFA', 'EMAIL_PIN')).toBe('lower');
    expect(minimumDirection('EMAIL_PIN_PLUS_OTP', 'EMAIL_PIN_PLUS_OTP')).toBe('same');
  });

  it('requires an enabled installation-registered integration and its observed minimum', () => {
    for (const invalid of [
      undefined,
      { ...current, enabled: false },
      { ...current, decision_verification_minimum: undefined },
    ]) {
      expect(() => prepareIntegrationVerificationChange(
        invalid, 'EMAIL_PIN_PLUS_OTP', 'Customer approved changing policy', true,
      )).toThrow();
    }
    expect(panel({ ...current, decision_verification_minimum: undefined }, 'EMAIL_PIN'))
      .toContain('current integration verification');
  });

  it('rejects equal or unrecognized mode values before issuing any request', () => {
    expect(() => prepareIntegrationVerificationChange(
      current, 'EMAIL_PIN_PLUS_MFA', 'No real security change', false,
    )).toThrow('INTEGRATION_VERIFICATION_NO_CHANGE');
    expect(() => prepareIntegrationVerificationChange(
      current, 'FAKE_EMAIL_MFA', 'Some policy change', true,
    )).toThrow('INTEGRATION_VERIFICATION_MODE_INVALID');
  });

  it('requires explicit administrator reason between five and one thousand characters', () => {
    for (const reason of ['test', '  no  ', '', 'x'.repeat(1001)]) {
      expect(() => prepareIntegrationVerificationChange(
        { ...current, decision_verification_minimum: 'EMAIL_PIN' },
        'EMAIL_PIN_PLUS_MFA', reason, false,
      )).toThrow('INTEGRATION_VERIFICATION_REASON_REQUIRED');
    }
    expect(prepareIntegrationVerificationChange(
      { ...current, decision_verification_minimum: 'EMAIL_PIN' },
      'EMAIL_PIN_PLUS_MFA', '  Stronger Grant TOTP requirement  ', false,
    )).toEqual({
      decision_verification_minimum: 'EMAIL_PIN_PLUS_MFA',
      reason: 'Stronger Grant TOTP requirement',
    });
  });

  it('rejects all lowering of minimum unless current choice explicitly confirmed', () => {
    expect(() => prepareIntegrationVerificationChange(
      current, 'EMAIL_PIN_PLUS_OTP', 'Customer security review allowed this reduction', false,
    )).toThrow('INTEGRATION_VERIFICATION_REDUCTION_UNCONFIRMED');
    expect(prepareIntegrationVerificationChange(
      current, 'EMAIL_PIN', 'Approved for new low assurance requests', true,
    )).toEqual({
      decision_verification_minimum: 'EMAIL_PIN',
      reason: 'Approved for new low assurance requests',
    });
  });

  it('renders downgrade warning and disables destructive confirmation by default', () => {
    const html = panel(current, 'EMAIL_PIN_PLUS_OTP', 'Lower for next request', false);
    expect(html).toContain('Current minimum');
    expect(html).toContain('EMAIL_PIN_PLUS_MFA');
    expect(html).toContain('Confirm lower verification minimum');
    expect(html).toContain('can allow weaker verification for NEW');
    expect(html).toContain('NOT independent MFA');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Confirm lower minimum');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('callback_headers');
    expect(html).not.toContain('hmac_secret');
  });

  it('renders stronger verification without the downgrade acknowledgement checkbox', () => {
    const low = { ...current, decision_verification_minimum: 'EMAIL_PIN' as const };
    const html = panel(low, 'EMAIL_PIN_PLUS_MFA');
    expect(html).toContain('Save verification minimum');
    expect(html).not.toContain('Confirm lower verification minimum');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('fresh signed-in Grant TOTP');
    expect(html).toContain('not complete');
  });

  it('refuses disabled integration edits and never invents a minimum', () => {
    const disabled = panel({ ...current, enabled: false }, 'EMAIL_PIN');
    expect(disabled).toContain('Integration disabled');
    expect(disabled).not.toContain('Confirm lower minimum');
    const oldServer = panel({
      ...current, decision_verification_minimum: undefined,
    }, 'EMAIL_PIN');
    expect(oldServer).toContain('current integration verification');
    expect(oldServer).not.toContain('Confirm lower minimum');
  });

  it('renders select-only management without exposing user or credential secrets', () => {
    const html = renderToStaticMarkup(
      createElement(IntegrationVerificationManagement, {
        integrations: [current],
        onChanged: async () => undefined,
      }),
    );
    expect(html).toContain('Approval verification minimum');
    expect(html).toContain('Customer automation');
    expect(html).toContain('Select an integration');
    expect(html).not.toContain('HMAC');
    expect(html).not.toContain('IntegrationMinimumEditor');
    expect(html).not.toContain('Store this credential');
  });

  it('the security change is distinct from approval, grant consumption, and execution', () => {
    const html = panel(current, 'EMAIL_PIN');
    expect(html).toContain('request-time snapshots');
    expect(html).toContain('NOT MFA');
    expect(html).not.toContain('Execute action');
    expect(html).not.toContain('Approve request');
    expect(html).not.toContain('Revoke token');
  });
});
