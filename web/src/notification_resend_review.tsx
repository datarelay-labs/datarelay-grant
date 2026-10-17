import { Alert, Button } from '@datarelay-labs/foundation';
import type { NotificationDelivery } from './types';

/** A reviewed failed transport record, not evidence of mailbox receipt,
 * a human approval, or a grant to execute the underlying action.
 */
export type NotificationResendIntent = {
  deliveryId: string;
  requestId: string;
  eventType: string;
  state: string;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  availableAt: number;
  deliveredAt: number | null;
  transportAccepted: boolean;
  receiptConfirmed: boolean;
};

export function createNotificationResendReview(
  record: NotificationDelivery,
): NotificationResendIntent {
  if (record.state !== 'FAILED') throw new Error('DELIVERY_NOT_FAILED');
  return {
    deliveryId: record.id, requestId: record.request_id,
    eventType: record.event_type, state: record.state,
    attempts: record.attempts, lastError: record.last_error,
    createdAt: record.created_at, availableAt: record.available_at,
    deliveredAt: record.delivered_at,
    transportAccepted: record.transport_accepted,
    receiptConfirmed: record.receipt_confirmed,
  };
}

export function canConfirmNotificationResend(
  intent: NotificationResendIntent | null,
  record: NotificationDelivery | null | undefined,
): boolean {
  if (!intent || !record) return false;
  try {
    return JSON.stringify(createNotificationResendReview(record)) === JSON.stringify(intent);
  } catch {
    return false;
  }
}

/** One explicit mutation per human Confirm, with no automatic retry.
 * The server remains authoritative over actual resend eligibility.
 */
export async function submitReviewedNotificationResend<T>(
  intent: NotificationResendIntent | null,
  record: NotificationDelivery | null | undefined,
  postOnce: (deliveryId: string) => Promise<T>,
): Promise<T> {
  if (!intent || !canConfirmNotificationResend(intent, record)) {
    throw new Error('DELIVERY_CHANGED_REVIEW_REQUIRED');
  }
  return await postOnce(intent.deliveryId);
}

export function NotificationResendConfirmation({
  intent, source, busy, onCancel, onConfirm,
}: {
  intent: NotificationResendIntent | null;
  source: NotificationDelivery | null | undefined;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!intent) return null;
  const ready = canConfirmNotificationResend(intent, source);
  return (
    <Alert tone="warning" title="Confirm notification resend">
      <p>Review this specific failed email delivery before scheduling another attempt.</p>
      <dl className="grant-facts">
        <dt>Request</dt><dd>{intent.requestId}</dd>
        <dt>Notification event</dt><dd>{intent.eventType}</dd>
        <dt>Delivery state</dt><dd>{intent.state}</dd>
        <dt>Recorded attempts</dt><dd>{intent.attempts}</dd>
        <dt>Last recorded error</dt><dd>{intent.lastError ?? 'No error description'}</dd>
      </dl>
      <p>Resend repeats a notification only; it does not approve the request,
        does not execute the protected action, and transport acceptance is
        not proof of mailbox receipt.</p>
      {!ready && <p role="alert">Delivery changed since review or is not visible.
        Cancel and inspect the current delivery state before scheduling resend.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || !ready} onClick={onConfirm}>Confirm schedule resend</Button>
      </div>
    </Alert>
  );
}
