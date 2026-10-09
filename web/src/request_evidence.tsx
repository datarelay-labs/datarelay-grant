import { Button, Card } from '@datarelay-labs/foundation';
import { State, when } from './common';
import type { RequestRow } from './types';

/** Technical transport/audit evidence follows the primary business decision.
 * Resending remains product-owned and is only surfaced to current administrators.
 */
export function RequestEvidence({
  row, isAdmin, busy, onResend,
}: {
  row: RequestRow;
  isAdmin: boolean;
  busy: boolean;
  onResend: (deliveryId: string) => void;
}) {
  return (
    <>
      <Card title="Delivery history" description="Transport acceptance does not prove external execution. Resend repeats only the notification.">
        <details>
          <summary>Delivery attempts · {row.deliveries?.length ?? 0}</summary>
          {row.deliveries?.map((delivery) => (
            <div className="grant-delivery" key={delivery.id}>
              <div>
                <strong>{delivery.kind}</strong> · <State value={delivery.state} />
                <small>{delivery.attempts} attempts {delivery.last_error ? '· ' + delivery.last_error : ''}</small>
              </div>
              {isAdmin && ['FAILED', 'PENDING'].includes(delivery.state) && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onResend(delivery.id)}
                >
                  Resend {delivery.kind}
                </Button>
              )}
            </div>
          ))}
        </details>
      </Card>
      <Card title="Request timeline" description="An auditable record of request decisions and delivery/interaction events.">
        <details>
          <summary>Recorded events · {row.timeline?.length ?? 0}</summary>
          {row.timeline?.map((event) => (
            <div className="grant-timeline" key={event.id}>
              <strong>{event.action}</strong>
              <small>{when(event.at)} · {event.actor}</small>
              <details>
                <summary>Event evidence</summary>
                <pre>{JSON.stringify(event.detail, null, 2)}</pre>
              </details>
            </div>
          ))}
        </details>
      </Card>
    </>
  );
}
