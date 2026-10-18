import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createRequestDeliveryResendReview, canConfirmRequestDeliveryResend,
  submitReviewedRequestDeliveryResend, RequestDeliveryResendConfirmation,
} from '../../src/request_delivery_resend_review';
import type { RequestRow, Delivery } from '../../src/types';

function delivery(changes: Partial<Delivery> = {}): Delivery {
  return {
    id: 'failed-email', kind: 'email', state: 'FAILED', attempts: 2,
    last_error: 'SMTP unavailable', revision: 4, ...changes,
  };
}
function request(changes: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'DEMO', integration_id: 'test', profile_id: 'profile',
    requester_id: 'requester', approver_id: 'reviewer',
    title: 'Restart isolated unit', reason: 'Planned change',
    action: { kind: 'service.restart', target: 'test-service', parameters: {} },
    action_hash: 'fingerprint', source: {}, state: 'HELD',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 4, created_at: 100, deadline: 3000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'FAILED', deliveries: [delivery()],
    ...changes,
  };
}
function html(
  row: RequestRow | null = request(), isAdmin = true,
  intent = createRequestDeliveryResendReview(request(), delivery()),
): string {
  return renderToStaticMarkup(createElement(RequestDeliveryResendConfirmation, {
    row, isAdmin, intent, busy: false,
    onCancel: () => undefined, onConfirm: () => undefined,
  }));
}

describe('B1 RequestDetail admin delivery resend must be explicitly reviewed', () => {
  it('snapshots exact request/action and delivery, not guessed transmission outcome', () => {
    const row = request();
    const intent = createRequestDeliveryResendReview(row, delivery());
    expect(intent).toEqual({
      requestId: row.id, requestRevision: 4,
      actionHash: 'fingerprint', actionKind: 'service.restart',
      actionTarget: 'test-service', deliveryId: 'failed-email',
      deliveryKind: 'email', deliveryState: 'FAILED',
      deliveryRevision: 4, attempts: 2, lastError: 'SMTP unavailable',
    });
    expect(canConfirmRequestDeliveryResend(intent, row, true)).toBe(true);
  });

  it('preserves existing FAILED and PENDING eligibility but refuses delivered', () => {
    const row = request({ deliveries: [delivery({ state: 'PENDING', kind: 'webhook' })] });
    const pending = createRequestDeliveryResendReview(row, row.deliveries![0]);
    expect(canConfirmRequestDeliveryResend(pending, row, true)).toBe(true);
    expect(pending.deliveryKind).toBe('webhook');
    expect(() => createRequestDeliveryResendReview(
      request(), delivery({ state: 'DELIVERED' }),
    )).toThrow('DELIVERY_NOT_ELIGIBLE_FOR_RESEND');
  });

  it('rejects any changed source, delivery attempt, status, action or viewer role', () => {
    const original = request();
    const frozen = createRequestDeliveryResendReview(original, delivery());
    const cases: RequestRow[] = [
      request({ id: 'other-request' }),
      request({ revision: 5 }),
      request({ action_hash: 'other-hash' }),
      request({ action: { ...original.action, kind: 'service.stop' } }),
      request({ action: { ...original.action, target: 'other-target' } }),
      request({ deliveries: [] }),
      request({ deliveries: [delivery({ state: 'DELIVERED' })] }),
      request({ deliveries: [delivery({ attempts: 3 })] }),
      request({ deliveries: [delivery({ revision: 5 })] }),
      request({ deliveries: [delivery({ last_error: 'another error' })] }),
    ];
    for (const altered of cases) {
      expect(canConfirmRequestDeliveryResend(frozen, altered, true)).toBe(false);
    }
    expect(canConfirmRequestDeliveryResend(frozen, original, false)).toBe(false);
    expect(canConfirmRequestDeliveryResend(frozen, null, true)).toBe(false);
    expect(html(original, false)).toContain('disabled=""');
    expect(html(request({ revision: 5 }))).toContain('changed since review');
  });

  it('shows exact target, kind, attempts and a transport-only warning', () => {
    const output = html();
    for (const label of [
      'Confirm notification resend', 'service.restart', 'test-service',
      'failed-email', 'email', 'FAILED', '2', 'SMTP unavailable',
      'Confirm resend', 'Cancel', 'does not approve', 'does not execute',
      'not proof of mailbox receipt',
    ]) expect(output).toContain(label);
    expect(output).not.toContain('<form');
    expect(output).not.toContain('type="submit"');
  });

  it('calls GET exactly once then one existing POST only for an unchanged admin item', async () => {
    const row = request();
    const intent = createRequestDeliveryResendReview(row, row.deliveries![0]);
    const calls: string[] = [];
    const posted = { scheduled: true };
    const result = await submitReviewedRequestDeliveryResend(
      intent, true,
      async (id) => { calls.push('GET ' + id); return request(); },
      async (id) => { calls.push('POST ' + id); return posted; },
    );
    expect(calls).toEqual(['GET ' + row.id, 'POST failed-email']);
    expect(result).toBe(posted);
  });

  it('never posts on stale GET, absent delivery, missing permission or failed GET', async () => {
    const intent = createRequestDeliveryResendReview(request(), delivery());
    const calls: string[] = [];
    const post = async (id: string) => { calls.push('POST ' + id); return {}; };
    await expect(submitReviewedRequestDeliveryResend(
      intent, true,
      async () => request({ deliveries: [delivery({ state: 'DELIVERED' })] }),
      post,
    )).rejects.toThrow('DELIVERY_CHANGED_REVIEW_REQUIRED');
    await expect(submitReviewedRequestDeliveryResend(
      intent, false, async () => { calls.push('GET'); return request(); }, post,
    )).rejects.toThrow('DELIVERY_CHANGED_REVIEW_REQUIRED');
    await expect(submitReviewedRequestDeliveryResend(
      intent, true, async () => { throw new Error('GET_UNAVAILABLE'); }, post,
    )).rejects.toThrow('GET_UNAVAILABLE');
    expect(calls).toEqual([]);
  });

  it('never retries an ambiguous resend POST or claims execution', async () => {
    const intent = createRequestDeliveryResendReview(request(), delivery());
    let attempts = 0;
    await expect(submitReviewedRequestDeliveryResend(
      intent, true, async () => request(),
      async () => { attempts++; throw new Error('POST_RESULT_UNKNOWN'); },
    )).rejects.toThrow('POST_RESULT_UNKNOWN');
    expect(attempts).toBe(1);
    expect(html()).not.toContain('Execution succeeded');
  });

  it('escapes untrusted source and error in confirmation', () => {
    const bad = request({
      action: { kind: '<script>alert(1)</script>', target: '<img src=x onerror=alert(1)>', parameters: {} },
      deliveries: [delivery({ last_error: '<svg onload=alert(1)>' })],
    });
    const intent = createRequestDeliveryResendReview(bad, bad.deliveries![0]);
    const output = html(bad, true, intent);
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain('&lt;img');
    expect(output).toContain('&lt;svg');
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<img src=x');
    expect(output).not.toContain('<svg onload');
  });
});
