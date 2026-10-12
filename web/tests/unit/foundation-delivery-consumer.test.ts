import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GrantNotificationDeliveryReadout } from '../../src/operations';

const snapshot = [
  { reference: 'grant.smtp', revision: 'snapshot.v1', kind: 'smtp', enabled: false,
    queue: { queued: 1, retryPending: 2, deadLetter: 3 }, lastOutcome: 'dead_letter' },
  { reference: 'grant.webhook.0123456789abcdef', revision: 'snapshot.v1', kind: 'webhook', enabled: true,
    queue: { queued: 4, retryPending: 0, deadLetter: 1 }, lastOutcome: 'accepted' },
] as const;

describe('Grant RC41 Foundation notification adoption', () => {
  it('shows only recorded product queue states with real SMTP/webhook split', () => {
    const html = renderToStaticMarkup(createElement(GrantNotificationDeliveryReadout, { destinations: snapshot }));
    expect(html).toContain('Notification delivery');
    expect(html).toContain('SMTP');
    expect(html).toContain('Webhook');
    expect(html).toContain('dead letter');
    expect(html).toContain('Product snapshot only');
    expect(html).not.toContain('Send test');
    expect(html).not.toContain('business effect verified');
  });
  it('keeps unavailable transport snapshots distinct from a fabricated empty-success state', () => {
    const html = renderToStaticMarkup(createElement(GrantNotificationDeliveryReadout, { destinations: null }));
    expect(html).toContain('Delivery readiness unavailable');
    expect(html).not.toContain('No notification destinations');
    expect(html).not.toContain('Send test');
  });
});
