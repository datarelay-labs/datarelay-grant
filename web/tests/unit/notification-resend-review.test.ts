import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createNotificationResendReview, canConfirmNotificationResend,
  NotificationResendConfirmation, submitReviewedNotificationResend,
} from '../../src/notification_resend_review';
import type { NotificationDelivery } from '../../src/types';

function delivery(overrides: Partial<NotificationDelivery> = {}): NotificationDelivery {
  return {
    id: 'email-delivery-one', request_id: 'request-one', event_type: 'requested',
    state: 'FAILED', attempts: 2, last_error: 'SMTP temporary failure',
    created_at: 100, available_at: 105, delivered_at: null,
    transport_accepted: false, receipt_confirmed: false,
    ...overrides,
  };
}
function markup(source: NotificationDelivery | null = delivery(), intent = createNotificationResendReview(delivery())): string {
  return renderToStaticMarkup(createElement(NotificationResendConfirmation, {
    source, intent, busy: false, onCancel: () => undefined,
    onConfirm: () => undefined,
  }));
}

describe('Grant delivery-health failed notification resend requires human confirmation', () => {
  it('snapshots the exact failed email delivery and recorded transport evidence', () => {
    const item = delivery();
    expect(createNotificationResendReview(item)).toEqual({
      deliveryId: item.id, requestId: item.request_id,
      eventType: 'requested', state: 'FAILED', attempts: 2,
      lastError: 'SMTP temporary failure', createdAt: 100,
      availableAt: 105, deliveredAt: null,
      transportAccepted: false, receiptConfirmed: false,
    });
    expect(canConfirmNotificationResend(createNotificationResendReview(item), item)).toBe(true);
  });

  it('never offers resend confirmation for sent/pending/delivered/other events', () => {
    for (const state of ['PENDING', 'DELIVERED', 'SENDING', 'SUPERSEDED']) {
      expect(() => createNotificationResendReview(delivery({ state }))).toThrow('DELIVERY_NOT_FAILED');
    }
    expect(canConfirmNotificationResend(null, delivery())).toBe(false);
    expect(canConfirmNotificationResend(createNotificationResendReview(delivery()), null)).toBe(false);
  });

  it('invalidates when selected row changes identity, state, attempt, error or receipt', () => {
    const frozen = createNotificationResendReview(delivery());
    const mutations: Partial<NotificationDelivery>[] = [
      { id: 'other' }, { request_id: 'other-request' }, { event_type: 'reminder' },
      { state: 'DELIVERED' }, { attempts: 3 }, { last_error: 'New error' },
      { created_at: 101 }, { available_at: 200 },
      { transport_accepted: true }, { receipt_confirmed: true },
    ];
    for (const mutation of mutations) {
      expect(canConfirmNotificationResend(frozen, delivery(mutation))).toBe(false);
    }
    expect(markup(delivery({ state: 'DELIVERED' }), frozen)).toContain('disabled=""');
    expect(markup(delivery({ state: 'DELIVERED' }), frozen)).toContain('changed since review');
  });

  it('shows the exact request/event/failure without implying mailbox receipt or execution', () => {
    const html = markup();
    for (const word of [
      'Confirm notification resend', 'request-one', 'requested', 'FAILED',
      '2', 'SMTP temporary failure', 'Confirm schedule resend', 'Cancel',
      'notification only', 'does not approve', 'does not execute',
      'not proof of mailbox receipt',
    ]) expect(html).toContain(word);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain('Execute</button>');
  });

  it('issues exactly one resend POST on valid reviewed evidence, never on changed state', async () => {
    const frozen = createNotificationResendReview(delivery());
    const calls: string[] = [];
    const recorded = { scheduled: true };
    const result = await submitReviewedNotificationResend(frozen, delivery(),
      async (id) => { calls.push(id); return recorded; });
    expect(calls).toEqual(['email-delivery-one']);
    expect(result).toBe(recorded);
    await expect(submitReviewedNotificationResend(
      frozen, delivery({ state: 'PENDING' }),
      async (id) => { calls.push(id); return recorded; },
    )).rejects.toThrow('DELIVERY_CHANGED_REVIEW_REQUIRED');
    expect(calls).toEqual(['email-delivery-one']);
  });

  it('never retries a failed or ambiguous resend POST', async () => {
    let count = 0;
    await expect(submitReviewedNotificationResend(
      createNotificationResendReview(delivery()), delivery(),
      async () => { count++; throw new Error('POST_RESULT_UNKNOWN'); },
    )).rejects.toThrow('POST_RESULT_UNKNOWN');
    expect(count).toBe(1);
  });

  it('escapes untrusted event/error/identifiers and is no-op without staged review', () => {
    const unsafe = delivery({
      request_id: '<img src=x onerror=alert(1)>',
      last_error: '<script>alert(2)</script>',
    });
    const html = markup(unsafe, createNotificationResendReview(unsafe));
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(markup(delivery(), null)).toBe('');
  });
});
