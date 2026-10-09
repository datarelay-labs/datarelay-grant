/**
 * Real G10A decision-intent API adapter. This module is intentionally not
 * mounted into App/router until the separately gated public Web URL is allowed.
 *
 * It binds a URL-safe emailed intent token to the existing same-origin Grant
 * API, parses runtime responses (never TypeScript-casts trust), and adapts
 * APPROVED/HELD/DENIED to the presentation's APPROVE/HOLD/DENY choices.
 * The backend remains the only approval and protected-execution authority.
 */
import { ApiError, api } from './api';
import {
  canConfirmEmailDecision, initialStageForProof, isFourDigitPin, isSixDigitCode,
  stageAfterStepUp,
  type EmailDecisionChoice, type EmailDecisionMode, type EmailDecisionProof,
} from './email_decision_flow';
import type { EmailDecisionAdapter } from './email_decision_portal';

type JsonRecord = Record<string, unknown>;
type ServerOutcome = 'APPROVED' | 'HELD' | 'DENIED';

export interface LoadedEmailDecisionIntent {
  choice: EmailDecisionChoice;
  verificationMode: EmailDecisionMode;
  adapter: EmailDecisionAdapter;
}

const outcomes: Record<ServerOutcome, EmailDecisionChoice> = {
  APPROVED: 'APPROVE',
  HELD: 'HOLD',
  DENIED: 'DENY',
};
const serverOutcomes: Record<EmailDecisionChoice, ServerOutcome> = {
  APPROVE: 'APPROVED',
  HOLD: 'HELD',
  DENY: 'DENIED',
};
const modeRank: Record<EmailDecisionMode, number> = {
  EMAIL_PIN: 0,
  EMAIL_PIN_PLUS_OTP: 1,
  EMAIL_PIN_PLUS_MFA: 2,
};

function invalid(): never {
  throw new ApiError(0, 'INVALID_DECISION_RESPONSE');
}
function object(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as JsonRecord;
}
function bounded(value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) return invalid();
  return value;
}
function text(value: unknown, max: number): string {
  const result = bounded(value, max);
  if (!result.trim()) return invalid();
  return result;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalid();
  return value;
}
function noExecution(record: JsonRecord): void {
  if (record.execution_allowed !== false) invalid();
}
function choice(value: unknown): EmailDecisionChoice {
  if (value !== 'APPROVED' && value !== 'HELD' && value !== 'DENIED') return invalid();
  return outcomes[value];
}
function modeAndRequirements(raw: JsonRecord): EmailDecisionMode {
  const value = raw.verification_mode;
  if (value !== 'EMAIL_PIN' &&
      value !== 'EMAIL_PIN_PLUS_OTP' &&
      value !== 'EMAIL_PIN_PLUS_MFA') return invalid();
  if (raw.landing_requires_login !== false ||
      raw.requires_login !== (value === 'EMAIL_PIN_PLUS_MFA') ||
      raw.requires_additional_email_otp !== (value === 'EMAIL_PIN_PLUS_OTP')) {
    return invalid();
  }
  return value;
}
function matchingContext(context: unknown, proof: EmailDecisionProof | null): EmailDecisionProof {
  if (!proof || context !== proof.context) {
    throw new ApiError(0, 'INVALID_DECISION_CONTEXT');
  }
  return proof;
}

/** Only a syntactically valid high-entropy link token can enter an API path. */
export function validateDecisionIntentToken(token: string): string {
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{32,100}$/.test(token)) {
    throw new ApiError(0, 'INVALID_DECISION_TOKEN');
  }
  return token;
}

function readPreview(raw: unknown): { choice: EmailDecisionChoice; mode: EmailDecisionMode } {
  const value = object(raw);
  noExecution(value);
  if (value.pin_required !== true || value.pin_digits !== 4 ||
      value.confirmation_required !== true || value.details_visible !== false ||
      value.assurance !== 'EMAIL_LINK_PIN' ||
      'request' in value || 'confirmation_token' in value) return invalid();
  return { choice: choice(value.outcome), mode: modeAndRequirements(value) };
}

function readPinVerification(
  raw: unknown,
  selected: EmailDecisionChoice,
  previewMode: EmailDecisionMode,
): EmailDecisionProof {
  const value = object(raw);
  noExecution(value);
  const observedMode = modeAndRequirements(value);
  if (modeRank[observedMode] < modeRank[previewMode] ||
      choice(value.outcome) !== selected ||
      value.assurance !== 'EMAIL_LINK_PIN' ||
      value.verified_person_id !== null ||
      !Number.isInteger(value.expires_in) ||
      (value.expires_in as number) <= 0 ||
      (value.expires_in as number) > 300) {
    return invalid();
  }
  const context = bounded(value.confirmation_token, 100, 32);
  if (!/^[a-zA-Z0-9_-]+$/.test(context)) return invalid();

  const request = object(value.request);
  const title = text(request.title, 250);
  const kind = text(request.action_kind, 100);
  const target = text(request.target, 500);
  const denialReasonRequired = bool(request.denial_reason_required);
  const proof: EmailDecisionProof = {
    context,
    choice: selected,
    mode: observedMode,
    assurance: observedMode === 'EMAIL_PIN' ? 'PIN_VERIFIED' :
      observedMode === 'EMAIL_PIN_PLUS_OTP' ? 'OTP_REQUIRED' : 'MFA_REQUIRED',
    summary: { subject: title, action: kind + ' → ' + target },
    denialReasonRequired,
  };
  if (initialStageForProof(proof, selected) === 'invalid') return invalid();
  return proof;
}

/**
 * GET is read-only and may safely be followed by a mail scanner. It returns
 * only the chosen outcome and verification requirement, never private details.
 * No other network call happens until explicit user action on the portal.
 */
export async function loadEmailDecisionIntent(token: string): Promise<LoadedEmailDecisionIntent> {
  const safe = validateDecisionIntentToken(token);
  const path = '/decision-intents/' + safe;
  const preflight = readPreview(await api<unknown>(path));
  let active: EmailDecisionProof | null = null;
  let otpRequested = false;
  let confirmationAttempted = false;

  const adapter: EmailDecisionAdapter = {
    async verifyPin(pin) {
      if (!isFourDigitPin(pin) || active) throw new ApiError(0, 'INVALID_DECISION_PIN_STATE');
      const parsed = readPinVerification(
        await api<unknown>(path + '/verify', 'POST', { pin }),
        preflight.choice, preflight.mode,
      );
      active = parsed;
      return parsed;
    },

    async requestOtp(context) {
      const proof = matchingContext(context, active);
      if (initialStageForProof(proof, preflight.choice) !== 'otp' || otpRequested) {
        throw new ApiError(0, 'EMAIL_OTP_NOT_REQUIRED');
      }
      // A lost response may still have queued a message; never blindly retry.
      otpRequested = true;
      const response = object(await api<unknown>(
        path + '/otp/request', 'POST', { confirmation_token: context },
      ));
      noExecution(response);
      if (response.otp_queued !== true || response.delivery !== 'QUEUED' ||
          response.verification_mode !== 'EMAIL_PIN_PLUS_OTP' ||
          response.mfa !== false) return invalid();
    },

    async verifyOtp(context, code) {
      const proof = matchingContext(context, active);
      if (!otpRequested || initialStageForProof(proof, preflight.choice) !== 'otp' ||
          !isSixDigitCode(code)) throw new ApiError(0, 'EMAIL_OTP_NOT_READY');
      const response = object(await api<unknown>(
        path + '/otp/verify', 'POST', { confirmation_token: context, otp: code },
      ));
      noExecution(response);
      if (response.otp_verified !== true || response.mfa !== false ||
          response.actor_assurance !== 'EMAIL_LINK_PIN_PLUS_OTP' ||
          response.verified_person_id !== null) return invalid();
      const verified: EmailDecisionProof = { ...proof, assurance: 'OTP_VERIFIED' };
      if (stageAfterStepUp(proof, verified, preflight.choice) !== 'ready') return invalid();
      active = verified;
      return verified;
    },

    async verifyFreshMfa(context, code) {
      const proof = matchingContext(context, active);
      if (initialStageForProof(proof, preflight.choice) !== 'mfa' ||
          !isSixDigitCode(code)) throw new ApiError(0, 'FRESH_MFA_NOT_READY');
      // The same-origin API carries the current signed-in human's CSRF header.
      // An absent/wrong recipient session must be rejected by the server.
      const response = object(await api<unknown>(
        path + '/mfa/verify', 'POST', { confirmation_token: context, code },
      ));
      noExecution(response);
      if (response.fresh_mfa_verified !== true || response.mfa !== true ||
          response.actor_assurance !== 'EMAIL_LINK_PIN_PLUS_MFA' ||
          typeof response.verified_person_id !== 'string' ||
          !response.verified_person_id ||
          response.verified_person_id.length > 100) return invalid();
      const verified: EmailDecisionProof = { ...proof, assurance: 'MFA_VERIFIED' };
      if (stageAfterStepUp(proof, verified, preflight.choice) !== 'ready') return invalid();
      active = verified;
      return verified;
    },

    async confirm(context, details) {
      const proof = matchingContext(context, active);
      const reason = typeof details?.denialReason === 'string' ? details.denialReason : '';
      if (confirmationAttempted ||
          !canConfirmEmailDecision(proof, preflight.choice, reason)) {
        throw new ApiError(0, 'DECISION_NOT_READY');
      }
      // A timed-out POST may already have recorded a human decision. The
      // adapter deliberately never repeats it without external reconciliation.
      confirmationAttempted = true;
      const response = object(await api<unknown>(
        path + '/confirm', 'POST', { confirmation_token: context, reason },
      ));
      noExecution(response);
      const expected = serverOutcomes[preflight.choice];
      if (response.recorded !== true || response.decision !== expected ||
          response.actor_assurance !== (
            proof.assurance === 'MFA_VERIFIED' ? 'EMAIL_LINK_PIN_PLUS_MFA' :
            proof.assurance === 'OTP_VERIFIED' ? 'EMAIL_LINK_PIN_PLUS_OTP' : 'EMAIL_LINK_PIN'
          ) ||
          response.mfa_verified !== (proof.assurance === 'MFA_VERIFIED')) return invalid();
      active = null;
      return { recorded: true, outcome: preflight.choice };
    },
  };
  return { choice: preflight.choice, verificationMode: preflight.mode, adapter };
}
