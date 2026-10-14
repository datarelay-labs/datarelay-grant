import { Alert, Button } from '@datarelay-labs/foundation';
import { templateDraftSignature } from './notification_preview';
import type { NotificationEvent, NotificationTemplateSet } from './types';

export type NotificationTestSendSample = {
  request_title: string;
  request_url: string;
  external_id: string;
  action_kind: string;
  target: string;
  reason: string;
  deadline: string;
  decision_state: string;
  execution_state: string;
};

export type NotificationTestSendPreview = {
  template_set_id: string;
  event: NotificationEvent;
  rendered: {
    subject: string;
    body: string;
    html?: string;
    text?: string;
    sender_display_name: string;
    brand_name: string;
  };
  transport_accepted: boolean;
  receipt_confirmed: boolean;
  execution_allowed: boolean;
};

export type NotificationTestSendReview = {
  templateSetId: string;
  templateSignature: string;
  event: NotificationEvent;
  sample: NotificationTestSendSample;
  /** Sample editing inputs, excluding the generated deadline frozen in sample. */
  inputSignature: string;
  preview: NotificationTestSendPreview;
};

/** Test mail is a real SMTP effect to the signed-in administrator.
 * Preview is a non-sending server operation; it never authorizes delivery.
 * The server still verifies administrator RBAC, recipient, saved template
 * and its current transport constraints before any actual test email.
 */
export function createNotificationTestSendReview(
  saved: NotificationTemplateSet,
  event: NotificationEvent,
  sample: NotificationTestSendSample,
  inputSignature: string,
  preview: NotificationTestSendPreview,
): NotificationTestSendReview {
  if (!saved.id || !inputSignature
      || preview.template_set_id !== saved.id || preview.event !== event
      || preview.transport_accepted !== false
      || preview.receipt_confirmed !== false
      || preview.execution_allowed !== false
      || !preview.rendered
      || typeof preview.rendered.subject !== 'string'
      || typeof preview.rendered.body !== 'string') {
    throw new Error('TEST_SEND_PREVIEW_MISMATCH');
  }
  return {
    templateSetId: saved.id,
    templateSignature: templateDraftSignature(saved),
    event,
    sample: { ...sample },
    inputSignature,
    preview: {
      ...preview, rendered: { ...preview.rendered },
    },
  };
}

export function isCurrentNotificationTestSendReview(
  reviewed: NotificationTestSendReview | null,
  saved: NotificationTemplateSet | null,
  event: NotificationEvent,
  inputSignature: string,
  unsaved: boolean,
): boolean {
  return Boolean(reviewed && saved && !unsaved
    && reviewed.templateSetId === saved.id
    && reviewed.templateSignature === templateDraftSignature(saved)
    && reviewed.event === event
    && reviewed.inputSignature === inputSignature);
}

/** React busy is asynchronous. A test-send POST must claim before awaiting
 * the role-scoped saved-template GET. A failure provably before POST may be
 * reviewed again; an attempted SMTP write stays latched until explicit read.
 */
export function createNotificationTestSendAttemptGuard() {
  let inFlight = false;
  let postStarted = false;
  let attempted = false;
  return {
    claim(): boolean {
      if (inFlight || attempted) return false;
      inFlight = true;
      postStarted = false;
      attempted = true;
      return true;
    },
    markPostStarted(): void {
      if (!inFlight) throw new Error('TEST_SEND_CLAIM_REQUIRED');
      postStarted = true;
    },
    settled(): void {
      inFlight = false;
      if (!postStarted) attempted = false;
    },
    readSucceeded(): boolean {
      if (inFlight) return false;
      attempted = false;
      postStarted = false;
      return true;
    },
    blocked(): boolean {
      return attempted || inFlight;
    },
  };
}

/** One exact saved-template read before at most one real SMTP POST.
 * The caller must have displayed and validated the reviewed preview.
 * A known pre-POST freshness failure releases the claim; after a possible
 * POST the guard remains latched even if the HTTP result is ambiguous.
 */
export async function submitReviewedNotificationTestSend<T>(
  reviewed: NotificationTestSendReview,
  guard: ReturnType<typeof createNotificationTestSendAttemptGuard>,
  readSaved: () => Promise<NotificationTemplateSet[]>,
  postOnce: (intent: NotificationTestSendReview) => Promise<T>,
): Promise<T | null> {
  if (!guard.claim()) return null;
  try {
    const latest = await readSaved();
    const current = latest.find((row) => row.id === reviewed.templateSetId);
    if (!current || templateDraftSignature(current) !== reviewed.templateSignature) {
      throw new Error('TEST_SEND_SAVED_TEMPLATE_CHANGED');
    }
    guard.markPostStarted();
    return await postOnce(reviewed);
  } finally {
    guard.settled();
  }
}

export function NotificationTestSendConfirmation({
  reviewed, valid, busy, onCancel, onConfirm,
}: {
  reviewed: NotificationTestSendReview | null;
  valid: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!reviewed) return null;
  const { preview, sample } = reviewed;
  return (
    <Alert tone="warning" title="Confirm test email to my account">
      <p>One real SMTP test email goes only to the signed-in administrator's
        own registered email address. This does not approve or execute any
        protected action. Transport acceptance is not mailbox receipt.</p>
      <dl className="grant-facts">
        <dt>Saved template set</dt><dd>{reviewed.templateSetId}</dd>
        <dt>Event</dt><dd>{reviewed.event}</dd>
        <dt>Sender</dt><dd>{preview.rendered.sender_display_name}</dd>
        <dt>Sample request</dt><dd>{sample.request_title}</dd>
        <dt>Sample target</dt><dd>{sample.target}</dd>
        <dt>Subject</dt><dd>{preview.rendered.subject}</dd>
      </dl>
      <p><strong>Full rendered message preview</strong></p>
      <pre className="grant-mono">{preview.rendered.body}</pre>
      {!valid && <p role="alert">Sample, event, template or saved revision
        changed. Review the test email again before any send.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || !valid} onClick={onConfirm}>Confirm send test email</Button>
      </div>
    </Alert>
  );
}
