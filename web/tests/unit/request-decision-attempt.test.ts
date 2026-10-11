import { describe, expect, it } from 'vitest';
import { createDecisionAttemptGuard } from '../../src/request_decision_attempt';

describe('RequestDetail decision and cancellation one-shot claim', () => {
  it('allows exactly one immediate confirm even before React rerenders', () => {
    const guard = createDecisionAttemptGuard();
    expect(guard.claim()).toBe(true);
    expect(guard.claim()).toBe(false);
    expect(guard.blocked()).toBe(true);
  });

  it('holds the latch after a committed POST with unavailable readback', () => {
    const guard = createDecisionAttemptGuard();
    expect(guard.claim()).toBe(true);
    guard.complete(false);
    expect(guard.claim()).toBe(false);
    expect(guard.blocked()).toBe(true);
  });

  it('releases the latch after POST and a qualified authoritative fresh read', () => {
    const guard = createDecisionAttemptGuard();
    expect(guard.claim()).toBe(true);
    guard.complete(true);
    expect(guard.blocked()).toBe(false);
    expect(guard.claim()).toBe(true);
  });

  it('does not clear an in-flight POST when a refresh races the write', () => {
    const guard = createDecisionAttemptGuard();
    guard.claim();
    expect(guard.readSucceeded()).toBe(false);
    expect(guard.claim()).toBe(false);
    guard.complete(false);
    expect(guard.blocked()).toBe(true);
  });

  it('makes an ambiguous failed POST non-repeatable until explicit fresh read', () => {
    const guard = createDecisionAttemptGuard();
    guard.claim();
    guard.complete(false);
    expect(guard.claim()).toBe(false);
    expect(guard.readSucceeded()).toBe(true);
    expect(guard.blocked()).toBe(false);
    expect(guard.claim()).toBe(true);
  });

  it('does not arm or send anything merely by creating the guard', () => {
    const guard = createDecisionAttemptGuard();
    expect(guard.blocked()).toBe(false);
    expect(guard.readSucceeded()).toBe(true);
    expect(guard.blocked()).toBe(false);
  });
});
