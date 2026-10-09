/**
 * G10A-5 presentation contract, deliberately decoupled from routing and transport.
 * The real server is authoritative for intent, eligibility, confirmation and
 * execution separation. A URL GET must never call a mutating adapter method.
 */
export type EmailDecisionChoice = 'APPROVE' | 'HOLD' | 'DENY';
export type EmailDecisionMode = 'EMAIL_PIN' | 'EMAIL_PIN_PLUS_OTP' | 'EMAIL_PIN_PLUS_MFA';
export type EmailDecisionAssurance =
  | 'PIN_VERIFIED' | 'OTP_REQUIRED' | 'OTP_VERIFIED'
  | 'MFA_REQUIRED' | 'MFA_VERIFIED';

export interface EmailDecisionProof {
  /** Opaque, scoped, short-lived server context. Never render or put in a URL. */
  context: string;
  choice: EmailDecisionChoice;
  mode: EmailDecisionMode;
  assurance: EmailDecisionAssurance;
  /** Bounded details released by the server only after correct PIN. */
  summary: { subject: string; action?: string };
  denialReasonRequired: boolean;
}

export type EmailDecisionStage = 'ready' | 'otp' | 'mfa' | 'invalid';

export function isFourDigitPin(value: string): boolean {
  return value.length === 4 && /^[0-9]{4}$/.test(value);
}

export function isSixDigitCode(value: string): boolean {
  return value.length === 6 && /^[0-9]{6}$/.test(value);
}

/**
 * No client-provided field may downgrade the effective server security tier.
 * Treat impossible or incomplete responses as invalid, not PIN-only.
 */
export function stageForProof(
  proof: EmailDecisionProof | null | undefined,
  expectedChoice: EmailDecisionChoice,
): EmailDecisionStage {
  if (!proof || typeof proof.context !== 'string' || proof.context.length < 8 ||
      proof.choice !== expectedChoice ||
      !['APPROVE', 'HOLD', 'DENY'].includes(proof.choice) ||
      typeof proof.denialReasonRequired !== 'boolean' ||
      !proof.summary || typeof proof.summary.subject !== 'string' ||
      !proof.summary.subject.trim() || proof.summary.subject.length > 300 ||
      (proof.summary.action !== undefined &&
        (typeof proof.summary.action !== 'string' || proof.summary.action.length > 500))) {
    return 'invalid';
  }
  if (proof.mode === 'EMAIL_PIN') {
    return proof.assurance === 'PIN_VERIFIED' ? 'ready' : 'invalid';
  }
  if (proof.mode === 'EMAIL_PIN_PLUS_OTP') {
    if (proof.assurance === 'OTP_REQUIRED') return 'otp';
    return proof.assurance === 'OTP_VERIFIED' ? 'ready' : 'invalid';
  }
  if (proof.mode === 'EMAIL_PIN_PLUS_MFA') {
    if (proof.assurance === 'MFA_REQUIRED') return 'mfa';
    return proof.assurance === 'MFA_VERIFIED' ? 'ready' : 'invalid';
  }
  return 'invalid';
}

/**
 * A PIN verification response cannot pre-satisfy optional OTP/MFA.
 * Those modes require their own deliberate subsequent verification POST.
 */
export function initialStageForProof(
  proof: EmailDecisionProof | null | undefined,
  choice: EmailDecisionChoice,
): EmailDecisionStage {
  const stage = stageForProof(proof, choice);
  if (!proof) return 'invalid';
  if (proof.mode === 'EMAIL_PIN') {
    return stage === 'ready' ? 'ready' : 'invalid';
  }
  if (proof.mode === 'EMAIL_PIN_PLUS_OTP') {
    return stage === 'otp' ? 'otp' : 'invalid';
  }
  if (proof.mode === 'EMAIL_PIN_PLUS_MFA') {
    return stage === 'mfa' ? 'mfa' : 'invalid';
  }
  return 'invalid';
}

/**
 * The second POST must complete the same policy, outcome and request display
 * bound to the already-verified PIN; no silent downgrade or action swap.
 * A server may rotate its short-lived opaque context; server-side binding,
 * one-use and authentication checks remain mandatory and authoritative.
 */
export function stageAfterStepUp(
  previous: EmailDecisionProof,
  next: EmailDecisionProof,
  choice: EmailDecisionChoice,
): EmailDecisionStage {
  const waiting = initialStageForProof(previous, choice);
  if ((waiting !== 'otp' && waiting !== 'mfa') ||
      stageForProof(next, choice) !== 'ready' ||
      previous.mode !== next.mode ||
      previous.choice !== next.choice ||
      previous.denialReasonRequired !== next.denialReasonRequired ||
      previous.summary.subject !== next.summary.subject ||
      previous.summary.action !== next.summary.action) {
    return 'invalid';
  }
  return 'ready';
}

export function canConfirmEmailDecision(
  proof: EmailDecisionProof | null | undefined,
  choice: EmailDecisionChoice,
  denialReason: string,
): boolean {
  if (stageForProof(proof, choice) !== 'ready') return false;
  if (choice !== 'DENY') return true;
  const reason = denialReason.trim();
  if (reason.length > 1000) return false;
  return !proof!.denialReasonRequired || reason.length > 0;
}

export function decisionReason(
  choice: EmailDecisionChoice,
  value: string,
): string | undefined {
  return choice === 'DENY' && value.trim() ? value.trim() : undefined;
}
