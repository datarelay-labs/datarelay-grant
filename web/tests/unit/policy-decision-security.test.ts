import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DECISION_VERIFICATION_MODES,
  DecisionSecurityFields,
  readDecisionSecurity,
  serializeDecisionSecurity,
  policyDecisionSecuritySummary,
  type DecisionSecurityDraft,
} from '../../src/policy_decision_security';
import type { Integration, Profile } from '../../src/types';

const active: Profile = {
  id: 'policy-id', version_id: 'policy-v2', version: 2,
  name: 'Two-party privileged approval',
  integration_id: 'integration-id', approver_id: 'approver-id',
  approval_mode: 'ALL', approver_group_id: 'group-id',
  approvals_required: null, action_kind: 'service.privileged',
  email_template_id: null,
  deadline_seconds: 86400, reminder_seconds: 3600,
  max_reminders: 3, grant_seconds: 900,
  tenant_selector: '', environment: '', severity: '', risk_level: '',
  denial_reason_required: true,
  verification_mode: 'EMAIL_PIN_PLUS_MFA',
  decision_link_ttl_seconds: 900,
  lifecycle: 'ACTIVE', enabled: true,
};
const integration: Integration = {
  id: 'integration-id', name: 'Trusted Connector',
  kind: 'datarelay', tenant: '', enabled: true,
  callback_origin: 'https://demo.example.invalid',
  decision_verification_minimum: 'EMAIL_PIN_PLUS_OTP',
};

function html(draft: DecisionSecurityDraft, source?: Integration) {
  return renderToStaticMarkup(
    createElement(DecisionSecurityFields, {
      draft, update: () => undefined,
      ...(source ? { integration: source } : {}),
    }),
  );
}

describe('G10A policy-denial/verification/TTL integration contracts', () => {
  it('starts with secure backend defaults for new policies (no forced TTL)', () => {
    const defaults = readDecisionSecurity();
    expect(defaults).toEqual({
      denialReasonRequired: false,
      verificationMode: 'INHERIT',
      linkTtlInput: '',
      contractAvailable: true,
    });
    expect(serializeDecisionSecurity(defaults)).toEqual({
      denial_reason_required: false,
      verification_mode: 'INHERIT',
      decision_link_ttl_seconds: null,
    });
  });

  it('round-trips existing higher-security policies without resetting Deny, MFA or TTL', () => {
    const draft = readDecisionSecurity(active);
    expect(draft).toEqual({
      denialReasonRequired: true,
      verificationMode: 'EMAIL_PIN_PLUS_MFA',
      linkTtlInput: '900',
      contractAvailable: true,
    });
    expect(serializeDecisionSecurity(draft)).toEqual({
      denial_reason_required: true,
      verification_mode: 'EMAIL_PIN_PLUS_MFA',
      decision_link_ttl_seconds: 900,
    });
  });

  it('labels policy-list assurance without falsely claiming it is the effective integration floor', () => {
    expect(policyDecisionSecuritySummary(active))
      .toBe('Policy: Fresh Grant TOTP · Deny reason required · Link 900s');
    expect(policyDecisionSecuritySummary({
      ...active, verification_mode: 'EMAIL_PIN_PLUS_OTP',
      denial_reason_required: false, decision_link_ttl_seconds: null,
    })).toBe('Policy: Same-mailbox OTP (not MFA)');
    expect(policyDecisionSecuritySummary({
      ...active, verification_mode: 'INHERIT',
      denial_reason_required: false, decision_link_ttl_seconds: null,
    })).toBe('Policy: Inherited');
    expect(policyDecisionSecuritySummary({
      ...active, verification_mode: undefined,
    })).toBe('Email verification unavailable');
  });

  it('supports null inherited TTL and optional Deny policy from versioned backend', () => {
    const inherited = readDecisionSecurity({
      ...active, denial_reason_required: false,
      verification_mode: 'EMAIL_PIN_PLUS_OTP', decision_link_ttl_seconds: null,
    });
    expect(inherited.contractAvailable).toBe(true);
    expect(serializeDecisionSecurity(inherited)).toEqual({
      denial_reason_required: false,
      verification_mode: 'EMAIL_PIN_PLUS_OTP',
      decision_link_ttl_seconds: null,
    });
  });

  it('fails closed when the server omits any versioned security field', () => {
    for (const invalid of [
      { ...active, denial_reason_required: undefined },
      { ...active, verification_mode: undefined },
      { ...active, decision_link_ttl_seconds: undefined },
    ]) {
      const draft = readDecisionSecurity(invalid);
      expect(draft.contractAvailable).toBe(false);
      expect(() => serializeDecisionSecurity(draft))
        .toThrow('POLICY_VERIFICATION_CONTRACT_UNAVAILABLE');
      expect(html(draft)).toContain('Policy edits are disabled');
    }
  });

  it('rejects unexpected verification modes rather than silently weakening MFA', () => {
    const unexpected = {
      ...active, verification_mode: 'FAKE_EMAIL_MFA',
    } as unknown as Profile;
    const draft = readDecisionSecurity(unexpected);
    expect(draft.contractAvailable).toBe(false);
    expect(() => serializeDecisionSecurity(draft))
      .toThrow('POLICY_VERIFICATION_CONTRACT_UNAVAILABLE');
    expect(() => serializeDecisionSecurity({
      ...readDecisionSecurity(active),
      verificationMode: 'FAKE_EMAIL_MFA' as 'EMAIL_PIN',
    })).toThrow('POLICY_VERIFICATION_MODE_INVALID');
  });

  it('rejects malformed, float, negative, non-integer and out-of-range link TTL', () => {
    const invalidValues = [
      '299', '2592001', '-1', '0', '1.5', '300.5', 'NaN', 'Infinity',
      '300seconds', '0x120', '300e1', '900.0', '1_000',
    ];
    for (const value of invalidValues) {
      expect(() => serializeDecisionSecurity({
        ...readDecisionSecurity(active), linkTtlInput: value,
      })).toThrow('DECISION_LINK_TTL_OUT_OF_RANGE');
    }
    for (const value of [NaN, 299, 2592001, 2.5]) {
      const draft = readDecisionSecurity({
        ...active, decision_link_ttl_seconds: value,
      });
      expect(draft.contractAvailable).toBe(false);
    }
  });

  it('accepts precisely bounded manual TTLs and blank inheritance', () => {
    for (const [input, expected] of [
      ['300', 300], ['2592000', 2592000], ['604800', 604800], [' 900 ', 900],
      ['  ', null],
    ] as const) {
      const result = serializeDecisionSecurity({
        ...readDecisionSecurity(active), linkTtlInput: input,
      });
      expect(result.decision_link_ttl_seconds).toBe(expected);
    }
  });

  it('labels same-mailbox OTP accurately and provides a truthful integration minimum', () => {
    const markup = html(readDecisionSecurity(active), integration);
    expect(markup).toContain('Email decisions &amp; verification');
    expect(markup).toContain('Require a reason when denying');
    expect(markup).toContain('checked=""');
    for (const mode of DECISION_VERIFICATION_MODES) {
      expect(markup).toContain('value="' + mode + '"');
    }
    expect(markup).toContain('EMAIL_PIN_PLUS_OTP');
    expect(markup).toContain('same-mailbox');
    expect(markup).toContain('NOT MFA');
    expect(markup).toContain('fresh signed-in Grant TOTP');
    expect(markup).toContain('effective requirement may be stricter');
    expect(markup).not.toContain('Successfully verified person');
  });

  it('does not falsely imply unsupported SSO/provider or completed user E2E', () => {
    const markup = html(readDecisionSecurity());
    expect(markup).toContain('not exposed by this server');
    expect(markup).toContain('still pending');
    expect(markup).toContain('original request');
    expect(markup).toContain('install');
  });
});
