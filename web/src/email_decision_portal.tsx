import { useRef, useState, type FormEvent } from 'react';
import {
  canConfirmEmailDecision, decisionReason, isFourDigitPin, isSixDigitCode,
  stageForProof,
  type EmailDecisionChoice, type EmailDecisionProof, type EmailDecisionStage,
} from './email_decision_flow';

/**
 * The route layer must supply a server-bound adapter that holds the emailed
 * capability outside this component. The component never fetches on mount.
 * Server-side POST contracts must still enforce one-use links, CSRF, Origin,
 * actor/seat authority, current policy floor and exact action binding.
 */
export interface EmailDecisionAdapter {
  verifyPin(pin: string): Promise<EmailDecisionProof>;
  requestOtp(context: string): Promise<void>;
  verifyOtp(context: string, code: string): Promise<EmailDecisionProof>;
  verifyFreshMfa(context: string, totp: string): Promise<EmailDecisionProof>;
  confirm(context: string, details: { denialReason?: string }): Promise<{
    outcome: EmailDecisionChoice;
    recorded: boolean;
  }>;
}

export interface EmailDecisionPortalProps {
  /** The selected outcome from a previously parsed, server-bound link. */
  choice: EmailDecisionChoice;
  adapter: EmailDecisionAdapter;
}

const outcomes: Record<EmailDecisionChoice, string> = {
  APPROVE: 'Approve',
  HOLD: 'Hold',
  DENY: 'Deny',
};

type Phase = 'pin' | EmailDecisionStage | 'done';

export function EmailDecisionPortal({ choice, adapter }: EmailDecisionPortalProps) {
  const [phase, setPhase] = useState<Phase>('pin');
  const [proof, setProof] = useState<EmailDecisionProof | null>(null);
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      // Do not expose server error bodies, URL capabilities or verification codes.
      setError('Verification could not be completed. The link may be expired, used or unavailable.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function acceptProof(next: EmailDecisionProof, previous?: EmailDecisionProof) {
    const step = stageForProof(next, choice);
    // A step-up response cannot silently downgrade its previously required mode.
    if (step === 'invalid' ||
        (previous && (previous.mode !== next.mode || previous.choice !== next.choice ||
          previous.denialReasonRequired !== next.denialReasonRequired))) {
      setProof(null);
      setCode('');
      setPin('');
      setPhase('invalid');
      return;
    }
    setProof(next);
    setPhase(step);
  }

  function onPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isFourDigitPin(pin)) {
      setError('Enter the exact four-digit PIN from your email.');
      return;
    }
    void run(async () => {
      const next = await adapter.verifyPin(pin);
      setPin('');
      acceptProof(next);
    });
  }

  function onOtpRequest() {
    if (!proof || phase !== 'otp') return;
    void run(async () => {
      await adapter.requestOtp(proof.context);
      setOtpRequested(true);
    });
  }

  function onStepUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof || (phase !== 'otp' && phase !== 'mfa')) return;
    if (!isSixDigitCode(code) || (phase === 'otp' && !otpRequested)) {
      setError('Enter a valid six-digit code after completing the required step.');
      return;
    }
    void run(async () => {
      const next = phase === 'otp'
        ? await adapter.verifyOtp(proof.context, code)
        : await adapter.verifyFreshMfa(proof.context, code);
      setCode('');
      acceptProof(next, proof);
    });
  }

  function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof || phase !== 'ready' ||
        !canConfirmEmailDecision(proof, choice, denialReason)) {
      setError('Complete the required verification and denial reason before confirming.');
      return;
    }
    void run(async () => {
      const result = await adapter.confirm(proof.context, {
        denialReason: decisionReason(choice, denialReason),
      });
      if (!result.recorded || result.outcome !== choice) {
        setPhase('invalid');
        setProof(null);
        return;
      }
      setProof(null);
      setCode('');
      setPin('');
      setDenialReason('');
      setPhase('done');
    });
  }

  return (
    <section className="grant-card grant-form" aria-labelledby="email-decision-heading">
      <h1 id="email-decision-heading">{outcomes[choice]} request</h1>
      {phase !== 'done' ? (
        <p>
          Opening this email link does not make a decision. You must verify
          your code, review the limited request details, and explicitly confirm.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}

      {phase === 'pin' ? (
        <form onSubmit={onPin}>
          <label htmlFor="grant-email-pin">Four-digit code from the email</label>
          <input
            id="grant-email-pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{4}"
            maxLength={4}
            value={pin}
            disabled={busy}
            onChange={(event) => setPin(event.target.value)}
            required
          />
          <p>The link and this code establish mailbox access, not personal identity.</p>
          <button type="submit" disabled={busy || !isFourDigitPin(pin)}>
            {busy ? 'Verifying…' : 'Verify code'}
          </button>
        </form>
      ) : null}

      {proof && (phase === 'otp' || phase === 'mfa' || phase === 'ready') ? (
        <div aria-label="Verified request summary">
          <h2>Review request</h2>
          <dl>
            <dt>Subject</dt>
            <dd>{proof.summary.subject}</dd>
            {proof.summary.action ? (
              <>
                <dt>Action</dt>
                <dd>{proof.summary.action}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}

      {proof && phase === 'otp' ? (
        <div>
          <p>
            This policy requires a second code sent to the same mailbox.
            This extra code is not independent MFA.
          </p>
          <button type="button" disabled={busy || otpRequested} onClick={onOtpRequest}>
            {otpRequested ? 'Code requested' : 'Request one-time code'}
          </button>
          {otpRequested ? (
            <form onSubmit={onStepUp}>
              <label htmlFor="grant-email-otp">Six-digit email code</label>
              <input
                id="grant-email-otp" type="password" inputMode="numeric"
                autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
                value={code} disabled={busy} required
                onChange={(event) => setCode(event.target.value)}
              />
              <button type="submit" disabled={busy || !isSixDigitCode(code)}>
                Verify email code
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {proof && phase === 'mfa' ? (
        <div>
          <p>
            Fresh Grant TOTP verification requires an authenticated session
            for the exact eligible recipient. If you are not signed in as
            that recipient, this high-assurance decision cannot proceed.
          </p>
          <form onSubmit={onStepUp}>
            <label htmlFor="grant-email-mfa">Fresh six-digit authenticator code</label>
            <input
              id="grant-email-mfa" type="password" inputMode="numeric"
              autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              value={code} disabled={busy} required
              onChange={(event) => setCode(event.target.value)}
            />
            <button type="submit" disabled={busy || !isSixDigitCode(code)}>
              Verify fresh Grant TOTP
            </button>
          </form>
        </div>
      ) : null}

      {proof && phase === 'ready' ? (
        <form onSubmit={onConfirm}>
          {choice === 'DENY' ? (
            <>
              <label htmlFor="grant-email-denial-reason">
                Reason for denial {proof.denialReasonRequired ? '(required)' : '(optional)'}
              </label>
              <textarea
                id="grant-email-denial-reason"
                maxLength={1000}
                value={denialReason}
                required={proof.denialReasonRequired}
                disabled={busy}
                onChange={(event) => setDenialReason(event.target.value)}
              />
            </>
          ) : null}
          {choice === 'HOLD' ? (
            <p>Hold is provisional. It does not approve or execute this action.</p>
          ) : null}
          <p>
            Confirming records your choice for this approval seat.
            It does not execute the protected business action.
          </p>
          <button
            type="submit"
            disabled={busy || !canConfirmEmailDecision(proof, choice, denialReason)}
          >
            {busy ? 'Recording…' : 'Confirm ' + outcomes[choice]}
          </button>
        </form>
      ) : null}

      {phase === 'invalid' ? (
        <p role="alert">
          This link or verification context is no longer usable.
          Request a new approval email from an authorized administrator.
        </p>
      ) : null}
      {phase === 'done' ? (
        <p role="status">
          Your decision was recorded. This is not a confirmation that the
          protected action has executed.
        </p>
      ) : null}
    </section>
  );
}
