import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setCsrf } from '../../src/api';
import {
  loadEmailDecisionIntent, validateDecisionIntentToken,
} from '../../src/email_decision_adapter';
import { stageForProof } from '../../src/email_decision_flow';

const token = 'A'.repeat(43);
const context = 'B'.repeat(43);
type Mode = 'EMAIL_PIN' | 'EMAIL_PIN_PLUS_OTP' | 'EMAIL_PIN_PLUS_MFA';
type BackendOutcome = 'APPROVED' | 'HELD' | 'DENIED';

function flags(mode: Mode) {
  return {
    verification_mode: mode,
    landing_requires_login: false,
    requires_login: mode === 'EMAIL_PIN_PLUS_MFA',
    requires_additional_email_otp: mode === 'EMAIL_PIN_PLUS_OTP',
  };
}
function preview(mode: Mode = 'EMAIL_PIN', outcome: BackendOutcome = 'APPROVED') {
  return {
    ...flags(mode), outcome, pin_digits: 4, pin_required: true,
    confirmation_required: true, details_visible: false,
    assurance: 'EMAIL_LINK_PIN', execution_allowed: false,
  };
}
function pinVerified(
  mode: Mode = 'EMAIL_PIN',
  outcome: BackendOutcome = 'APPROVED',
  denialRequired = false,
) {
  return {
    ...flags(mode),
    outcome,
    confirmation_token: context,
    expires_in: 300,
    request: {
      title: 'Deploy protected service',
      action_kind: 'service.restart',
      target: 'dev-service',
      deadline: 2000000000,
      denial_reason_required: denialRequired,
    },
    assurance: 'EMAIL_LINK_PIN',
    verified_person_id: null,
    execution_allowed: false,
  };
}
const otpQueued = {
  otp_queued: true, delivery: 'QUEUED', expires_in: 180,
  verification_mode: 'EMAIL_PIN_PLUS_OTP', mfa: false,
  execution_allowed: false,
};
const otpVerified = {
  otp_verified: true, actor_assurance: 'EMAIL_LINK_PIN_PLUS_OTP',
  verified_person_id: null, mfa: false, execution_allowed: false,
};
const mfaVerified = {
  fresh_mfa_verified: true, actor_assurance: 'EMAIL_LINK_PIN_PLUS_MFA',
  verified_person_id: 'eligible-recipient-user', mfa: true, execution_allowed: false,
};
function recorded(outcome: BackendOutcome, assurance = 'EMAIL_LINK_PIN') {
  return {
    recorded: true, decision: outcome, state: outcome,
    actor_assurance: assurance, mfa_verified: assurance === 'EMAIL_LINK_PIN_PLUS_MFA',
    execution_allowed: false,
  };
}
type Reply = { body?: unknown; status?: number; networkError?: boolean };

function transport(...items: Reply[]) {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  vi.stubGlobal('fetch', async (resource: string, options: RequestInit) => {
    calls.push({ url: resource, options });
    const next = items.shift();
    if (!next) throw new Error('UNEXPECTED_ADAPTER_HTTP_CALL');
    if (next.networkError) throw new TypeError('simulated response loss');
    return Response.json(next.body, { status: next.status ?? 200 });
  });
  return calls;
}
function body(calls: ReturnType<typeof transport>, index: number) {
  const raw = calls[index]?.options.body;
  return JSON.parse(String(raw)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrf('');
});

describe('G10A-5 original backend API adapter (unmounted)', () => {
  it('rejects unsafe or malformed email bearer tokens BEFORE making a request', async () => {
    const calls = transport();
    for (const value of [
      '', 'short', '/other', '../intent', 'https://example.com',
      'A'.repeat(31), 'a'.repeat(101), 'A'.repeat(40) + '/x',
      'A'.repeat(42) + '%',
    ]) {
      expect(() => validateDecisionIntentToken(value)).toThrow(ApiError);
      await expect(loadEmailDecisionIntent(value)).rejects.toThrow(ApiError);
    }
    expect(calls).toHaveLength(0);
    expect(validateDecisionIntentToken(token)).toBe(token);
  });

  it('issues exactly one side-effect-free same-origin GET with zero private details', async () => {
    const calls = transport({ body: preview('EMAIL_PIN_PLUS_OTP', 'HELD') });
    const loaded = await loadEmailDecisionIntent(token);
    expect(loaded.choice).toBe('HOLD');
    expect(loaded.verificationMode).toBe('EMAIL_PIN_PLUS_OTP');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/decision-intents/' + token);
    expect(calls[0]?.options.method).toBe('GET');
    expect(calls[0]?.options.credentials).toBe('same-origin');
    expect(calls[0]?.options.cache).toBe('no-store');
    expect(calls[0]?.options.redirect).toBe('error');
    expect(calls[0]?.options.body).toBeUndefined();
  });

  it('maps backend APPROVED to real PIN proof and records one explicit confirmation', async () => {
    const calls = transport(
      { body: preview() }, { body: pinVerified() },
      { body: recorded('APPROVED') },
    );
    const loaded = await loadEmailDecisionIntent(token);
    const proof = await loaded.adapter.verifyPin('0123');
    expect(proof).toEqual({
      context, choice: 'APPROVE', mode: 'EMAIL_PIN', assurance: 'PIN_VERIFIED',
      summary: { subject: 'Deploy protected service', action: 'service.restart → dev-service' },
      denialReasonRequired: false,
    });
    expect(stageForProof(proof, loaded.choice)).toBe('ready');
    expect(calls[1]?.url).toBe('/api/v1/decision-intents/' + token + '/verify');
    expect(calls[1]?.options.method).toBe('POST');
    expect(body(calls, 1)).toEqual({ pin: '0123' });
    const result = await loaded.adapter.confirm(context, {});
    expect(result).toEqual({ recorded: true, outcome: 'APPROVE' });
    expect(body(calls, 2)).toEqual({ confirmation_token: context, reason: '' });
    await expect(loaded.adapter.confirm(context, {})).rejects.toThrow(ApiError);
    expect(calls).toHaveLength(3);
  });

  it('handles HELD as a provisional independent choice; DENIED requires server-enforced reason', async () => {
    const calls = transport(
      { body: preview('EMAIL_PIN', 'DENIED') },
      { body: pinVerified('EMAIL_PIN', 'DENIED', true) },
      { body: recorded('DENIED') },
    );
    const loaded = await loadEmailDecisionIntent(token);
    const proof = await loaded.adapter.verifyPin('0000');
    expect(proof.choice).toBe('DENY');
    await expect(loaded.adapter.confirm(context, {})).rejects.toThrow(ApiError);
    await expect(loaded.adapter.confirm(context, { denialReason: '   ' })).rejects.toThrow(ApiError);
    expect(calls).toHaveLength(2); // invalid reason never consumes an HTTP intent
    const result = await loaded.adapter.confirm(context, { denialReason: '  Not authorized  ' });
    expect(result).toEqual({ recorded: true, outcome: 'DENY' });
    expect(body(calls, 2).reason).toBe('  Not authorized  ');
    expect(calls).toHaveLength(3);
  });

  it('requires an explicitly requested same-mailbox OTP before confirming', async () => {
    const calls = transport(
      { body: preview('EMAIL_PIN_PLUS_OTP') },
      { body: pinVerified('EMAIL_PIN_PLUS_OTP') },
      { body: otpQueued }, { body: otpVerified },
      { body: recorded('APPROVED', 'EMAIL_LINK_PIN_PLUS_OTP') },
    );
    const { adapter } = await loadEmailDecisionIntent(token);
    const pending = await adapter.verifyPin('4321');
    expect(stageForProof(pending, 'APPROVE')).toBe('otp');
    await expect(adapter.confirm(context, {})).rejects.toThrow(ApiError);
    await expect(adapter.verifyOtp(context, '123456')).rejects.toThrow(ApiError);
    expect(calls).toHaveLength(2);
    await adapter.requestOtp(context);
    expect(calls[2]?.url).toMatch(/\/otp\/request$/);
    expect(body(calls, 2)).toEqual({ confirmation_token: context });
    const ready = await adapter.verifyOtp(context, '000001');
    expect(ready.assurance).toBe('OTP_VERIFIED');
    expect(ready.context).toBe(context);
    expect(calls[3]?.url).toMatch(/\/otp\/verify$/);
    expect(body(calls, 3)).toEqual({ confirmation_token: context, otp: '000001' });
    expect((await adapter.confirm(context, {})).recorded).toBe(true);
    expect(calls).toHaveLength(5);
  });

  it('requires a fresh MFA response and carries the current product CSRF header', async () => {
    const calls = transport(
      { body: preview('EMAIL_PIN_PLUS_MFA') },
      { body: pinVerified('EMAIL_PIN_PLUS_MFA') },
      { body: mfaVerified },
      { body: recorded('APPROVED', 'EMAIL_LINK_PIN_PLUS_MFA') },
    );
    setCsrf('synthetic-csrf-same-origin');
    const { adapter } = await loadEmailDecisionIntent(token);
    await adapter.verifyPin('9999');
    await expect(adapter.confirm(context, {})).rejects.toThrow(ApiError);
    const proof = await adapter.verifyFreshMfa(context, '000123');
    expect(proof.assurance).toBe('MFA_VERIFIED');
    expect(calls[2]?.url).toMatch(/\/mfa\/verify$/);
    expect(body(calls, 2)).toEqual({ confirmation_token: context, code: '000123' });
    const h = calls[2]?.options.headers as Record<string, string>;
    expect(h['X-CSRF-Token']).toBe('synthetic-csrf-same-origin');
    expect((await adapter.confirm(context, {})).recorded).toBe(true);
    expect(body(calls, 3)).toEqual({ confirmation_token: context, reason: '' });
    expect(calls).toHaveLength(4);
  });

  it('fails closed on a public preview that leaks private request details or says execution is allowed', async () => {
    for (const patch of [
      { request: { title: 'confidential' } },
      { details_visible: true }, { execution_allowed: true },
      { requires_login: true }, { requires_additional_email_otp: true },
      { pin_required: false }, { confirmation_required: false },
      { verification_mode: 'UNRECOGNIZED' }, { assurance: 'VERIFIED_PERSON' },
    ]) {
      const calls = transport({ body: { ...preview(), ...patch } });
      await expect(loadEmailDecisionIntent(token)).rejects.toThrow(ApiError);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('fails closed on inconsistent PIN verification outcome, mode downgrade or invalid confirmation', async () => {
    const patches = [
      { outcome: 'DENIED' }, { execution_allowed: true },
      { verified_person_id: 'arbitrary-user' },
      { confirmation_token: 'too-short' },
      { requires_login: false }, { request: { title: 'missing policy' } },
      { assurance: 'EMAIL_LINK_PIN_PLUS_MFA' },
    ];
    for (const patch of patches) {
      const calls = transport(
        { body: preview('EMAIL_PIN_PLUS_MFA') },
        { body: { ...pinVerified('EMAIL_PIN_PLUS_MFA'), ...patch } },
      );
      const { adapter } = await loadEmailDecisionIntent(token);
      await expect(adapter.verifyPin('0000')).rejects.toThrow(ApiError);
      expect(calls).toHaveLength(2);
      vi.unstubAllGlobals();
    }
    const calls = transport(
      { body: preview('EMAIL_PIN_PLUS_MFA') },
      { body: pinVerified('EMAIL_PIN') },
    );
    const { adapter } = await loadEmailDecisionIntent(token);
    await expect(adapter.verifyPin('0000')).rejects.toThrow(ApiError);
    expect(calls).toHaveLength(2);
  });

  it('accepts a tightened policy on PIN POST but still demands its extra MFA stage', async () => {
    const calls = transport(
      { body: preview() }, { body: pinVerified('EMAIL_PIN_PLUS_MFA') },
    );
    const { adapter } = await loadEmailDecisionIntent(token);
    const proof = await adapter.verifyPin('1234');
    expect(proof.mode).toBe('EMAIL_PIN_PLUS_MFA');
    expect(stageForProof(proof, 'APPROVE')).toBe('mfa');
    expect(calls).toHaveLength(2);
  });

  it('accepts the full backend max bounded action type and target without hiding details', async () => {
    const max = pinVerified();
    max.request.action_kind = 'a'.repeat(100);
    max.request.target = 'b'.repeat(500);
    const calls = transport({ body: preview() }, { body: max });
    const { adapter } = await loadEmailDecisionIntent(token);
    const proof = await adapter.verifyPin('0001');
    expect(proof.summary.action?.length).toBe(603);
    expect(stageForProof(proof, 'APPROVE')).toBe('ready');
    expect(calls).toHaveLength(2);
  });

  it('rejects wrong/absent OTP or MFA reply instead of manufacturing a verified proof', async () => {
    for (const mode of ['EMAIL_PIN_PLUS_OTP', 'EMAIL_PIN_PLUS_MFA'] as const) {
      const replies: Reply[] = [
        { body: preview(mode) }, { body: pinVerified(mode) },
        ...(mode === 'EMAIL_PIN_PLUS_OTP' ? [{ body: otpQueued }] : []),
        { body: { ...(mode === 'EMAIL_PIN_PLUS_OTP' ? otpVerified : mfaVerified), execution_allowed: true } },
      ];
      const calls = transport(...replies);
      const { adapter } = await loadEmailDecisionIntent(token);
      await adapter.verifyPin('1234');
      if (mode === 'EMAIL_PIN_PLUS_OTP') {
        await adapter.requestOtp(context);
        await expect(adapter.verifyOtp(context, '654321')).rejects.toThrow(ApiError);
      } else {
        await expect(adapter.verifyFreshMfa(context, '654321')).rejects.toThrow(ApiError);
      }
      await expect(adapter.confirm(context, {})).rejects.toThrow(ApiError);
      expect(calls).toHaveLength(mode === 'EMAIL_PIN_PLUS_OTP' ? 4 : 3);
      vi.unstubAllGlobals();
    }
  });

  it('does not retry uncertain confirm; a response lost after the POST cannot record a second vote', async () => {
    const calls = transport(
      { body: preview() }, { body: pinVerified() }, { networkError: true },
    );
    const { adapter } = await loadEmailDecisionIntent(token);
    await adapter.verifyPin('1357');
    await expect(adapter.confirm(context, {})).rejects.toThrow();
    await expect(adapter.confirm(context, {})).rejects.toThrow(ApiError);
    expect(calls).toHaveLength(3);
  });

  it('rejects recorded=true without the exact outcome and execution=false flag', async () => {
    const calls = transport(
      { body: preview() }, { body: pinVerified() },
      { body: { ...recorded('APPROVED'), decision: 'DENIED', execution_allowed: true } },
    );
    const { adapter } = await loadEmailDecisionIntent(token);
    await adapter.verifyPin('4444');
    await expect(adapter.confirm(context, {})).rejects.toThrow(ApiError);
    expect(calls).toHaveLength(3);
  });

  it('never retries OTP request when the mail queue response is lost', async () => {
    const calls = transport(
      { body: preview('EMAIL_PIN_PLUS_OTP') },
      { body: pinVerified('EMAIL_PIN_PLUS_OTP') },
      { networkError: true },
    );
    const { adapter } = await loadEmailDecisionIntent(token);
    await adapter.verifyPin('4444');
    await expect(adapter.requestOtp(context)).rejects.toThrow();
    await expect(adapter.requestOtp(context)).rejects.toThrow(ApiError);
    expect(calls).toHaveLength(3);
  });
});
