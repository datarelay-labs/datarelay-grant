import { Alert, Button } from '@datarelay-labs/foundation';
import type { Delivery, RequestRow } from './types';

export type RequestDeliveryResendIntent = {
  requestId: string;
  requestRevision: number;
  actionHash: string;
  actionKind: string;
  actionTarget: string;
  deliveryId: string;
  deliveryKind: string;
  deliveryState: string;
  deliveryRevision: number;
  attempts: number;
  lastError: string | null;
};

/** The server ultimately validates the admin and permitted notification
 * retry, and this UI never equates transport with approval or execution.
 */
export function createRequestDeliveryResendReview(
  row: RequestRow, item: Delivery,
): RequestDeliveryResendIntent {
  if (!['FAILED', 'PENDING'].includes(item.state)
      || !row.deliveries?.some((delivery) => delivery.id === item.id)) {
    throw new Error('DELIVERY_NOT_ELIGIBLE_FOR_RESEND');
  }
  return {
    requestId: row.id, requestRevision: row.revision,
    actionHash: row.action_hash,
    actionKind: row.action.kind, actionTarget: row.action.target,
    deliveryId: item.id, deliveryKind: item.kind,
    deliveryState: item.state, deliveryRevision: item.revision,
    attempts: item.attempts, lastError: item.last_error,
  };
}

export function canConfirmRequestDeliveryResend(
  reviewed: RequestDeliveryResendIntent | null,
  row: RequestRow | null | undefined, isAdmin: boolean,
): boolean {
  if (!reviewed || !row || !isAdmin) return false;
  const item = row.deliveries?.find((delivery) => delivery.id === reviewed.deliveryId);
  if (!item) return false;
  try {
    return JSON.stringify(createRequestDeliveryResendReview(row, item))
      === JSON.stringify(reviewed);
  } catch {
    return false;
  }
}

/** One role-scoped GET and, if still eligible, one existing notification
 * resend POST. A failed GET or ambiguous POST never produces a retry.
 */
export async function submitReviewedRequestDeliveryResend<T>(
  reviewed: RequestDeliveryResendIntent | null,
  isAdmin: boolean,
  freshRead: (requestId: string) => Promise<RequestRow>,
  postOnce: (deliveryId: string) => Promise<T>,
): Promise<T> {
  if (!reviewed || !isAdmin) throw new Error('DELIVERY_CHANGED_REVIEW_REQUIRED');
  const latest = await freshRead(reviewed.requestId);
  if (!canConfirmRequestDeliveryResend(reviewed, latest, isAdmin)) {
    throw new Error('DELIVERY_CHANGED_REVIEW_REQUIRED');
  }
  return await postOnce(reviewed.deliveryId);
}

export function RequestDeliveryResendConfirmation({
  row, isAdmin, intent, busy, onCancel, onConfirm,
}: {
  row: RequestRow | null | undefined;
  isAdmin: boolean;
  intent: RequestDeliveryResendIntent | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!intent) return null;
  const valid = canConfirmRequestDeliveryResend(intent, row, isAdmin);
  return (
    <Alert tone="warning" title="Confirm notification resend">
      <p>Review the selected stored delivery before any email or webhook transport is retried.</p>
      <dl className="grant-facts">
        <dt>Request</dt><dd>{intent.requestId}</dd>
        <dt>Operation</dt><dd>{intent.actionKind}</dd>
        <dt>Target</dt><dd>{intent.actionTarget}</dd>
        <dt>Delivery ID</dt><dd>{intent.deliveryId}</dd>
        <dt>Notification kind</dt><dd>{intent.deliveryKind}</dd>
        <dt>Delivery state</dt><dd>{intent.deliveryState}</dd>
        <dt>Attempts</dt><dd>{intent.attempts}</dd>
        <dt>Last error</dt><dd>{intent.lastError ?? 'Not reported'}</dd>
      </dl>
      <p>This repeats a notification only: it does not approve the request,
        does not execute a protected action, and transport acceptance is
        not proof of mailbox receipt or business execution.</p>
      {!valid && <p role="alert">Delivery changed since review or is no longer visible.
        Cancel and refresh the request before taking action.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || !valid} onClick={onConfirm}>Confirm resend</Button>
      </div>
    </Alert>
  );
}
