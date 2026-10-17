import { TextField } from '@datarelay-labs/foundation';
import { Select } from './common';
import type { Integration, Profile } from './types';

export const DECISION_VERIFICATION_MODES = [
  'INHERIT', 'EMAIL_PIN', 'EMAIL_PIN_PLUS_OTP', 'EMAIL_PIN_PLUS_MFA',
] as const;
export type DecisionVerificationMode = typeof DECISION_VERIFICATION_MODES[number];
export type DecisionSecurityDraft = {
  denialReasonRequired: boolean;
  verificationMode: DecisionVerificationMode;
  linkTtlInput: string;
  contractAvailable: boolean;
};

/** Fail closed if the connected server does not expose its versioned
 * verification controls. Otherwise editing would reset secure policy values.
 */
export function readDecisionSecurity(profile?: Profile): DecisionSecurityDraft {
  if (!profile) {
    return {
      denialReasonRequired: false,
      verificationMode: 'INHERIT',
      linkTtlInput: '',
      contractAvailable: true,
    };
  }

  const hasVersionedFields =
    typeof profile.denial_reason_required === 'boolean' &&
    Object.prototype.hasOwnProperty.call(profile, 'decision_link_ttl_seconds') &&
    DECISION_VERIFICATION_MODES.includes(
      profile.verification_mode as DecisionVerificationMode,
    );
  if (!hasVersionedFields) {
    return {
      denialReasonRequired: false,
      verificationMode: 'INHERIT',
      linkTtlInput: '',
      contractAvailable: false,
    };
  }

  const ttl = profile.decision_link_ttl_seconds;
  if (ttl !== null && (
    !Number.isInteger(ttl) || ttl === undefined || ttl < 300 || ttl > 2592000
  )) {
    return {
      denialReasonRequired: false,
      verificationMode: 'INHERIT',
      linkTtlInput: '',
      contractAvailable: false,
    };
  }
  return {
    denialReasonRequired: profile.denial_reason_required!,
    verificationMode: profile.verification_mode as DecisionVerificationMode,
    linkTtlInput: ttl === null ? '' : String(ttl),
    contractAvailable: true,
  };
}

export function serializeDecisionSecurity(draft: DecisionSecurityDraft): {
  denial_reason_required: boolean;
  verification_mode: DecisionVerificationMode;
  decision_link_ttl_seconds: number | null;
} {
  if (!draft.contractAvailable) {
    throw new Error('POLICY_VERIFICATION_CONTRACT_UNAVAILABLE');
  }
  if (!DECISION_VERIFICATION_MODES.includes(draft.verificationMode)) {
    throw new Error('POLICY_VERIFICATION_MODE_INVALID');
  }
  const raw = draft.linkTtlInput.trim();
  let ttl: number | null = null;
  if (raw !== '') {
    ttl = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(ttl) || ttl < 300 || ttl > 2592000) {
      throw new Error('DECISION_LINK_TTL_OUT_OF_RANGE');
    }
  }
  return {
    denial_reason_required: draft.denialReasonRequired,
    verification_mode: draft.verificationMode,
    decision_link_ttl_seconds: ttl,
  };
}

/** Keep table badges truthful: show the chosen policy setting, never claim
 * it is the effective assurance after server-side security floors.
 */
export function policyDecisionSecuritySummary(profile: Profile): string {
  const values = readDecisionSecurity(profile);
  if (!values.contractAvailable) return 'Email verification unavailable';
  const label: Record<DecisionVerificationMode, string> = {
    INHERIT: 'Inherited',
    EMAIL_PIN: 'Email PIN',
    EMAIL_PIN_PLUS_OTP: 'Same-mailbox OTP (not MFA)',
    EMAIL_PIN_PLUS_MFA: 'Fresh Grant TOTP',
  };
  return [
    'Policy: ' + label[values.verificationMode],
    ...(values.denialReasonRequired ? ['Deny reason required'] : []),
    ...(values.linkTtlInput !== '' ? ['Link ' + values.linkTtlInput + 's'] : []),
  ].join(' · ');
}

/** A policy's chosen mode can be made STRICTER by installation/integration or
 * the trusted action-level floor. This component never claims an effective
 * assurance strength the client has not independently verified.
 */
export function DecisionSecurityFields({
  draft, update, integration,
}: {
  draft: DecisionSecurityDraft;
  update: (next: DecisionSecurityDraft) => void;
  integration?: Integration;
}) {
  return (
    <section className="grant-editor-section" aria-labelledby="policy-email-decisions">
      <div>
        <h3 id="policy-email-decisions">Email decisions &amp; verification</h3>
        <p>
          Saved as part of this draft policy version. Existing requests
          retain their request-time security snapshot and deadline; current
          installation or integration policy can demand stronger verification.
        </p>
      </div>
      <label className="grant-checkbox">
        <input
          type="checkbox"
          checked={draft.denialReasonRequired}
          onChange={(event) => update({
            ...draft, denialReasonRequired: event.target.checked,
          })}
        />
        Require a reason when denying a request
      </label>
      <div className="grant-grid">
        <Select
          label="Email decision verification"
          value={draft.verificationMode}
          onChange={(verificationMode) => update({
            ...draft, verificationMode: verificationMode as DecisionVerificationMode,
          })}
        >
          <option value="INHERIT">Inherit installation default</option>
          <option value="EMAIL_PIN">Email link + four-digit PIN</option>
          <option value="EMAIL_PIN_PLUS_OTP">Email PIN + separate same-mailbox OTP</option>
          <option value="EMAIL_PIN_PLUS_MFA">Email PIN + fresh signed-in Grant TOTP</option>
        </Select>
        <TextField
          label="Decision link validity (seconds)"
          type="number"
          min={300}
          max={2592000}
          placeholder="Blank = installation default"
          value={draft.linkTtlInput}
          onChange={(event) => update({
            ...draft, linkTtlInput: event.target.value,
          })}
        />
      </div>
      <p>
        A blank validity inherits the installation setting (normally seven
        days); the server always caps the link at the original request
        deadline. The installed integration minimum
        {' '}is {integration?.decision_verification_minimum ?? 'not exposed by this server'}.
        The effective requirement may be stricter because of installation
        settings and other active policies for the same action.
      </p>
      <p>
        A four-digit PIN and an additional OTP sent to the SAME mailbox do
        not independently verify the named person and are NOT MFA.
        Fresh MFA requires an enabled, signed-in Grant account with newly
        verified TOTP. A separate user-facing decision screen and real
        mailbox/user E2E are still pending.
      </p>
      {!draft.contractAvailable ? (
        <p role="alert">
          This backend did not return the required versioned email-decision
          fields. Policy edits are disabled to prevent silently downgrading
          a configured verification requirement.
        </p>
      ) : null}
    </section>
  );
}
