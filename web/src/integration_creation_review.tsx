import { Alert, Button } from '@datarelay-labs/foundation';
import type { Integration } from './types';

type VerificationFloor = NonNullable<Integration['decision_verification_minimum']>;
const floors: readonly VerificationFloor[] = [
  'EMAIL_PIN', 'EMAIL_PIN_PLUS_OTP', 'EMAIL_PIN_PLUS_MFA',
] as const;

export type IntegrationRegistrationDraft = {
  name: string;
  kind: string;
  tenant: string;
  callbackUrl: string;
  headers: string;
  hmacSecret: string;
  decisionMinimum: string;
};

export type IntegrationCreationPayload = {
  name: string;
  kind: Integration['kind'];
  tenant: string;
  callback_url: string;
  callback_headers: Record<string, string>;
  hmac_secret: string;
  decision_verification_minimum: VerificationFloor;
};

export type IntegrationCreationReview = Readonly<{
  payload: IntegrationCreationPayload;
  receiverOrigin: string;
  headerCount: number;
  hmacConfigured: boolean;
  draftSignature: string;
}>;

/** The server continues to own installation allowlists and secret storage.
 * Review locks all raw input without ever rendering callback query strings,
 * raw HTTP headers, credentials or HMAC secret.
 */
export function prepareIntegrationCreationReview(
  draft: IntegrationRegistrationDraft,
): IntegrationCreationReview {
  const name = draft.name.trim();
  const kind = draft.kind;
  const minimum = draft.decisionMinimum as VerificationFloor;
  if (!name || name.length > 100 || !['datarelay', 'stellar'].includes(kind)
      || (kind === 'stellar' && !draft.tenant.trim())
      || draft.tenant.length > 200 || draft.hmacSecret.length > 256
      || draft.callbackUrl.length > 2048
      || !floors.includes(minimum)) {
    throw new Error('INTEGRATION_CREATION_REVIEW_INVALID');
  }
  let receiver: URL;
  try { receiver = new URL(draft.callbackUrl); }
  catch { throw new Error('INTEGRATION_CREATION_REVIEW_INVALID'); }
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(receiver.hostname);
  if (!receiver.hostname || receiver.username || receiver.password
      || !(receiver.protocol === 'https:'
        || (receiver.protocol === 'http:' && localhost))) {
    throw new Error('INTEGRATION_CREATION_REVIEW_INVALID');
  }
  let headers: unknown;
  try { headers = JSON.parse(draft.headers); }
  catch { throw new Error('INTEGRATION_CREATION_REVIEW_INVALID'); }
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)
      || Object.entries(headers).some(([key,value]) => !key
        || typeof value !== 'string')) {
    throw new Error('INTEGRATION_CREATION_REVIEW_INVALID');
  }
  const validatedHeaders = headers as Record<string,string>;
  return {
    payload: {
      name, kind: kind as Integration['kind'], tenant: draft.tenant,
      callback_url: draft.callbackUrl,
      callback_headers: { ...validatedHeaders },
      hmac_secret: draft.hmacSecret,
      decision_verification_minimum: minimum,
    },
    receiverOrigin: receiver.origin,
    headerCount: Object.keys(validatedHeaders).length,
    hmacConfigured: Boolean(draft.hmacSecret),
    draftSignature: JSON.stringify(draft),
  };
}

export function isCurrentIntegrationCreationReview(
  reviewed: IntegrationCreationReview|null,
  draft: IntegrationRegistrationDraft,
): boolean {
  if (!reviewed) return false;
  try {
    return JSON.stringify(reviewed)
      === JSON.stringify(prepareIntegrationCreationReview(draft));
  } catch { return false; }
}

export function createIntegrationCreationGuard() {
  let claimed = false;
  let inFlight = false;
  let postStarted = false;
  return {
    claim(): boolean {
      if (claimed || inFlight) return false;
      claimed=true;inFlight=true;postStarted=false;
      return true;
    },
    markPostStarted(): void {
      if (!inFlight) throw new Error('INTEGRATION_CREATION_CLAIM_REQUIRED');
      postStarted = true;
    },
    settled(): void {
      inFlight=false;
      if (!postStarted) claimed=false;
    },
    blocked(): boolean { return claimed || inFlight; },
    readSucceeded(): boolean {
      if (inFlight) return false;
      claimed=false;postStarted=false;return true;
    },
  };
}

export type IntegrationCreationReceipt =
  Pick<Integration, 'id' | 'name' | 'kind' | 'decision_verification_minimum'>;

export function verifyIntegrationCreationReceipt<T extends IntegrationCreationReceipt>(
  reviewed: IntegrationCreationReview, receipt:T,
):T {
  if (!receipt?.id || receipt.name !== reviewed.payload.name
      || receipt.kind !== reviewed.payload.kind
      || receipt.decision_verification_minimum
        !== reviewed.payload.decision_verification_minimum) {
    throw new Error('INTEGRATION_CREATION_RECEIPT_MISMATCH');
  }
  return receipt;
}

/** Exactly one privileged POST after a separate user-visible Confirm.
 * A possibly committed creation remains latched until an explicit read-only
 * Refresh. A server accepted registration does NOT imply a tested receiver.
 */
export async function submitReviewedIntegrationCreation<T extends IntegrationCreationReceipt>(
  reviewed: IntegrationCreationReview,
  guard: ReturnType<typeof createIntegrationCreationGuard>,
  postOnce: (payload:IntegrationCreationPayload)=>Promise<T>,
):Promise<T|null> {
  if (!guard.claim()) return null;
  try {
    guard.markPostStarted();
    const result=await postOnce(reviewed.payload);
    return verifyIntegrationCreationReceipt(reviewed,result);
  } finally {
    guard.settled();
  }
}

export function IntegrationCreationConfirmation({
  reviewed, valid, busy, onCancel, onConfirm,
}: {
  reviewed:IntegrationCreationReview|null;
  valid:boolean;busy:boolean;
  onCancel:()=>void;onConfirm:()=>void;
}) {
  if (!reviewed) return null;
  const payload=reviewed.payload;
  return <Alert tone="warning" title="Review registered connection">
    <p>Registration stores an installation-approved receiver and its
      configured credentials. It does not test the callback, approve a
      human decision or execute a protected action. Confirmation triggers
      one privileged creation attempt.</p>
    <dl className="grant-facts">
      <dt>Connection name</dt><dd>{payload.name}</dd>
      <dt>Integration kind</dt><dd>
        {payload.kind==='datarelay'?'DataRelay':'Stellar Cyber'}</dd>
      <dt>Registered receiver origin</dt><dd>{reviewed.receiverOrigin}</dd>
      <dt>Tenant scope</dt><dd>{payload.tenant||'None'}</dd>
      <dt>Decision verification minimum</dt>
      <dd>{payload.decision_verification_minimum}</dd>
      <dt>Callback headers</dt>
      <dd>{reviewed.headerCount} configured header{reviewed.headerCount===1?'':'s'}</dd>
      <dt>Signing</dt>
      <dd>{reviewed.hmacConfigured?'HMAC signature configured':'No HMAC signature'}</dd>
    </dl>
    {payload.decision_verification_minimum!=='EMAIL_PIN_PLUS_MFA'
      && <p>PIN or OTP from the same mailbox is not independent MFA.
        Use fresh independently authenticated Grant TOTP where policy requires it.</p>}
    <p>Secret header values, HMAC material and URL query strings are
      intentionally hidden from this review. Installation destination
      allowlisting and the server's acceptance rules remain authoritative.</p>
    {!valid && <p role="alert">Connection fields changed. Review the latest
      configuration before creating.</p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy}
        onClick={onCancel}>Back to edit</Button>
      <Button disabled={busy||!valid}
        onClick={onConfirm}>Confirm create connection</Button>
    </div>
  </Alert>;
}
