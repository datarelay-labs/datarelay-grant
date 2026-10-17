import { describe, expect, it } from 'vitest';
import { createDeliveryResendAttemptGuard } from '../../src/request_delivery_resend_review';

describe('B1 RequestDetail notification resend one-shot claim', () => {
  it('claims synchronously before the role-scoped GET and blocks same-render double submit', async () => {
    const guard = createDeliveryResendAttemptGuard();
    const calls: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    async function confirm() {
      if (!guard.claim('delivery-1')) return false;
      try {
        calls.push('GET and POST');
        await pending;
        return true;
      } finally { guard.settled(); }
    }
    const first = confirm();
    const second = confirm();
    expect(calls).toEqual(['GET and POST']);
    expect(guard.blocked('delivery-1')).toBe(true);
    release();
    expect(await Promise.all([first, second])).toEqual([true, false]);
  });

  it('latches a delivery after a possibly committed POST, even if the response is lost', () => {
    const guard = createDeliveryResendAttemptGuard();
    expect(guard.claim('delivery-1')).toBe(true);
    guard.settled();
    expect(guard.claim('delivery-1')).toBe(false);
    expect(guard.blocked('delivery-1')).toBe(true);
  });

  it('a successful read cannot unlock any delivery while another POST is active', () => {
    const guard = createDeliveryResendAttemptGuard();
    expect(guard.claim('delivery-1')).toBe(true);
    expect(guard.readSucceeded()).toBe(false);
    expect(guard.claim('delivery-1')).toBe(false);
    expect(guard.claim('delivery-2')).toBe(false);
  });

  it('releases the attempted delivery only on successful explicit fresh request read', () => {
    const guard = createDeliveryResendAttemptGuard();
    guard.claim('delivery-1');
    guard.settled();
    expect(guard.readSucceeded()).toBe(true);
    expect(guard.blocked('delivery-1')).toBe(false);
    expect(guard.claim('delivery-1')).toBe(true);
  });

  it('does not allow an empty delivery id to claim an attempt', () => {
    const guard = createDeliveryResendAttemptGuard();
    expect(guard.claim('')).toBe(false);
    expect(guard.claim('delivery-1')).toBe(true);
  });

  it('keeps a different delivery separately reviewable after the first attempt has settled', () => {
    const guard = createDeliveryResendAttemptGuard();
    guard.claim('email-one');
    guard.settled();
    expect(guard.blocked('email-one')).toBe(true);
    expect(guard.claim('webhook-two')).toBe(true);
    expect(guard.blocked('email-one')).toBe(true);
  });

  it('does not authorize, send or retry any delivery merely by creating the gate', () => {
    const guard = createDeliveryResendAttemptGuard();
    expect(guard.blocked('delivery-1')).toBe(false);
    expect(guard.readSucceeded()).toBe(true);
    expect(guard.blocked('delivery-1')).toBe(false);
  });
});
