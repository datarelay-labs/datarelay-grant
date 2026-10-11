import { describe, expect, it } from 'vitest';
import { createRequestCreationAttemptGuard } from '../../src/request_creation_attempt';

describe('New request one-confirm-per-attempt guard', () => {
  it('claims synchronously before policy GET so rapid Confirm cannot double-create', () => {
    const guard = createRequestCreationAttemptGuard();
    expect(guard.claim()).toBe(true);
    expect(guard.claim()).toBe(false);
    expect(guard.blocked()).toBe(true);
  });

  it('releases after a stale policy/predecessor read without any POST', () => {
    const guard = createRequestCreationAttemptGuard();
    guard.claim();
    expect(guard.failed()).toBe(true);
    expect(guard.blocked()).toBe(false);
    expect(guard.claim()).toBe(true);
  });

  it('marks POST before calling the server, then never reclaims an ambiguous write', () => {
    const guard = createRequestCreationAttemptGuard();
    guard.claim();
    expect(guard.markPostStarted()).toBe(true);
    expect(guard.failed()).toBe(false);
    expect(guard.claim()).toBe(false);
    expect(guard.failed()).toBe(false);
  });

  it('keeps a successfully sent request latched through navigation', () => {
    const guard = createRequestCreationAttemptGuard();
    guard.claim();
    guard.markPostStarted();
    expect(guard.blocked()).toBe(true);
    expect(guard.claim()).toBe(false);
  });

  it('never treats markPostStarted without an explicit claim as an allowed write', () => {
    const guard = createRequestCreationAttemptGuard();
    expect(guard.markPostStarted()).toBe(false);
    expect(guard.blocked()).toBe(false);
  });

  it('has no POST or external execution side effects by itself', () => {
    const guard = createRequestCreationAttemptGuard();
    expect(guard.blocked()).toBe(false);
    expect(guard.claim()).toBe(true);
    expect(guard.blocked()).toBe(true);
  });
});
