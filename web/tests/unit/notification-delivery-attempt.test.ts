import { describe, expect, it } from 'vitest';
import { createDeliveryHealthGuard } from '../../src/notification_delivery_guard';

describe('B4 Delivery Health latest-only reads and reviewed resend one-shot', () => {
  it('invalidates an older result when the operator changes filters', () => {
    const guard = createDeliveryHealthGuard();
    const before = guard.beginRead();
    guard.invalidateRead();
    expect(guard.readCurrent(before)).toBe(false);
    expect(guard.readCurrent(guard.beginRead())).toBe(true);
  });

  it('an older page cannot overwrite a newer page', () => {
    const guard = createDeliveryHealthGuard();
    const first = guard.beginRead();
    const second = guard.beginRead();
    expect(guard.readCurrent(first)).toBe(false);
    expect(guard.readCurrent(second)).toBe(true);
  });

  it('a synchronous resend claim blocks duplicate Confirm before React rerenders', async () => {
    const guard = createDeliveryHealthGuard();
    const calls: string[] = [];
    let resolve!: () => void;
    const pending = new Promise<void>((done) => { resolve = done; });
    async function confirm() {
      if (!guard.claimResend('email-one')) return false;
      calls.push('POST');
      try { await pending; return true; }
      finally { guard.settledResend(); }
    }
    const first = confirm();
    const second = confirm();
    expect(calls).toEqual(['POST']);
    resolve();
    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(guard.blocked('email-one')).toBe(true);
  });

  it('an ambiguous POST remains latched even after its promise rejects', () => {
    const guard = createDeliveryHealthGuard();
    expect(guard.claimResend('email-one')).toBe(true);
    guard.settledResend();
    expect(guard.claimResend('email-one')).toBe(false);
    expect(guard.blocked('email-one')).toBe(true);
  });

  it('a racing unrelated Refresh cannot unlock an in-flight email send', () => {
    const guard = createDeliveryHealthGuard();
    const oldPage = guard.beginRead();
    expect(guard.claimResend('email-one')).toBe(true);
    expect(guard.readCurrent(oldPage)).toBe(false);
    expect(guard.readSucceeded()).toBe(false);
    expect(guard.blocked('email-one')).toBe(true);
  });

  it('only a successful explicit request list Refresh permits review of that delivery again', () => {
    const guard = createDeliveryHealthGuard();
    guard.claimResend('email-one');
    guard.settledResend();
    expect(guard.blocked('email-one')).toBe(true);
    expect(guard.readSucceeded()).toBe(true);
    expect(guard.blocked('email-one')).toBe(false);
    expect(guard.claimResend('email-one')).toBe(true);
  });

  it('separate failed emails stay independently reviewable after one settles', () => {
    const guard = createDeliveryHealthGuard();
    guard.claimResend('email-one');
    guard.settledResend();
    expect(guard.claimResend('email-two')).toBe(true);
    expect(guard.blocked('email-one')).toBe(true);
    expect(guard.blocked('email-two')).toBe(true);
  });

  it('does not start a resend for an absent ID, nor does construction send HTTP', () => {
    const guard = createDeliveryHealthGuard();
    expect(guard.claimResend('')).toBe(false);
    expect(guard.blocked('email-one')).toBe(false);
    expect(guard.readSucceeded()).toBe(true);
  });
});
