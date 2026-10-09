import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailDecisionPortal } from '../../src/email_decision_portal';
import {
  canConfirmEmailDecision, decisionReason, isFourDigitPin, isSixDigitCode,
  stageForProof, type EmailDecisionProof,
} from '../../src/email_decision_flow';

const valid: EmailDecisionProof = {
  context: 'opaque-server-scope-never-in-html',
  choice: 'APPROVE',
  mode: 'EMAIL_PIN',
  assurance: 'PIN_VERIFIED',
  summary: { subject: 'Protected change', action: 'Restart application' },
  denialReasonRequired: false,
};

describe('G10A loginless capability confirmation safety', () => {
  it('requires exactly four ASCII digits including valid leading zero', () => {
    for (const value of ['0000', '0123', '9999']) {
      expect(isFourDigitPin(value)).toBe(true);
    }
    for (const value of ['123', '12345', ' 1234', '1234 ', '1234\n', '１２３４', '12a4']) {
      expect(isFourDigitPin(value)).toBe(false);
    }
  });

  it('rejects invalid six-digit OTP and TOTP code formats', () => {
    expect(isSixDigitCode('000001')).toBe(true);
    for (const value of ['12345', '1234567', '123456\n', '１２３４５６', '12345x']) {
      expect(isSixDigitCode(value)).toBe(false);
    }
  });

  it('fails closed on a wrong link-selected outcome', () => {
    expect(stageForProof(valid, 'DENY')).toBe('invalid');
    expect(canConfirmEmailDecision(valid, 'DENY', 'a reason')).toBe(false);
  });

  it('refuses malformed server-issued proof rather than treating it as PIN verified', () => {
    for (const patch of [
      { context: '' }, { context: 'short' }, { summary: undefined },
      { summary: { subject: '' } }, { summary: { subject: 'x'.repeat(301) } },
      { summary: { subject: 'OK', action: 'x'.repeat(501) } },
      { denialReasonRequired: undefined },
      { assurance: 'OTP_VERIFIED' }, { mode: 'UNKNOWN_MODE' },
    ]) {
      const malformed = { ...valid, ...patch } as EmailDecisionProof;
      expect(stageForProof(malformed, 'APPROVE')).toBe('invalid');
    }
    expect(stageForProof(null, 'APPROVE')).toBe('invalid');
  });

  it('allows only a verified EMAIL_PIN proof to reach the deliberate confirmation step', () => {
    expect(stageForProof(valid, 'APPROVE')).toBe('ready');
    expect(canConfirmEmailDecision(valid, 'APPROVE', '')).toBe(true);
  });

  it('keeps same-mailbox OTP a distinct required stage, not MFA', () => {
    const proof = { ...valid, mode: 'EMAIL_PIN_PLUS_OTP' as const, assurance: 'OTP_REQUIRED' as const };
    expect(stageForProof(proof, 'APPROVE')).toBe('otp');
    expect(canConfirmEmailDecision(proof, 'APPROVE', '')).toBe(false);
    expect(stageForProof({ ...proof, assurance: 'PIN_VERIFIED' }, 'APPROVE')).toBe('invalid');
    expect(stageForProof({ ...proof, assurance: 'MFA_VERIFIED' }, 'APPROVE')).toBe('invalid');
    expect(stageForProof({ ...proof, assurance: 'OTP_VERIFIED' }, 'APPROVE')).toBe('ready');
  });

  it('requires fresh MFA for EMAIL_PIN_PLUS_MFA and rejects fallback to PIN/OTP', () => {
    const proof = { ...valid, mode: 'EMAIL_PIN_PLUS_MFA' as const, assurance: 'MFA_REQUIRED' as const };
    expect(stageForProof(proof, 'APPROVE')).toBe('mfa');
    expect(canConfirmEmailDecision(proof, 'APPROVE', '')).toBe(false);
    for (const assurance of ['PIN_VERIFIED', 'OTP_REQUIRED', 'OTP_VERIFIED'] as const) {
      expect(stageForProof({ ...proof, assurance }, 'APPROVE')).toBe('invalid');
    }
    expect(stageForProof({ ...proof, assurance: 'MFA_VERIFIED' }, 'APPROVE')).toBe('ready');
  });

  it('enforces server-required Deny reason without consuming a decision capability', () => {
    const proof: EmailDecisionProof = { ...valid, choice: 'DENY', denialReasonRequired: true };
    for (const reason of ['', '   ', 'x'.repeat(1001)]) {
      expect(canConfirmEmailDecision(proof, 'DENY', reason)).toBe(false);
    }
    expect(canConfirmEmailDecision(proof, 'DENY', 'Not authorized')).toBe(true);
  });

  it('permits optional Deny reason and never sends reasons with Approve/Hold', () => {
    expect(canConfirmEmailDecision({ ...valid, choice: 'DENY' }, 'DENY', '')).toBe(true);
    expect(decisionReason('DENY', ' ')).toBeUndefined();
    expect(decisionReason('DENY', '  Not approved  ')).toBe('Not approved');
    expect(decisionReason('APPROVE', 'do not send')).toBeUndefined();
    expect(decisionReason('HOLD', 'do not send')).toBeUndefined();
  });

  it('keeps Hold provisional and distinct from terminal approval', () => {
    const proof: EmailDecisionProof = { ...valid, choice: 'HOLD' };
    expect(stageForProof(proof, 'HOLD')).toBe('ready');
    expect(stageForProof(proof, 'APPROVE')).toBe('invalid');
  });

  it('renders an inert GET/SSR PIN form without dispatching any adapter action or leaking context/details', () => {
    const adapter = {
      verifyPin: vi.fn(async () => valid),
      requestOtp: vi.fn(async () => undefined),
      verifyOtp: vi.fn(async () => valid),
      verifyFreshMfa: vi.fn(async () => valid),
      confirm: vi.fn(async () => ({ recorded: true, outcome: 'APPROVE' as const })),
    };
    const markup = renderToStaticMarkup(createElement(EmailDecisionPortal, { choice: 'APPROVE', adapter }));
    expect(markup).toContain('Verify code');
    expect(markup).toContain('does not make a decision');
    expect(markup).not.toContain('Protected change');
    expect(markup).not.toContain('opaque-server-scope-never-in-html');
    for (const action of Object.values(adapter)) expect(action).not.toHaveBeenCalled();
  });
});
