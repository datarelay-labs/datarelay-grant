import { describe, expect, it } from 'vitest';
import { createCollaborationSubmissionGuard } from '../../src/request_collaboration_one_shot';

describe('B1 reviewed request message must POST at most once per human confirmation', () => {
  it('rejects a second same-render confirmation while the first POST is pending', async () => {
    const guard = createCollaborationSubmissionGuard();
    const calls: string[] = [];
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const postOnce = async () => { calls.push('POST'); return await pending; };
    const recorded: string[] = [];
    const first = guard.submitOnce(postOnce, (row) => recorded.push(row));
    const second = guard.submitOnce(postOnce, (row) => recorded.push(row));
    expect(guard.blocked()).toBe(true);
    expect(calls).toEqual(['POST']);
    release('projected-request-row');
    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(recorded).toEqual(['projected-request-row']);
    expect(guard.blocked()).toBe(false);
  });

  it('releases the claim only when a successful server POST projection was recorded', async () => {
    const guard = createCollaborationSubmissionGuard();
    let records = 0;
    expect(await guard.submitOnce(async () => 'server-row', () => { records++; })).toBe(true);
    expect(records).toBe(1);
    expect(await guard.submitOnce(async () => 'next-row', () => { records++; })).toBe(true);
    expect(records).toBe(2);
  });

  it('does not automatically resubmit an ambiguous POST error', async () => {
    const guard = createCollaborationSubmissionGuard();
    let posts = 0;
    await expect(guard.submitOnce(async () => {
      posts++;
      throw new Error('POST_RESULT_UNKNOWN');
    }, () => undefined)).rejects.toThrow('POST_RESULT_UNKNOWN');
    expect(await guard.submitOnce(async () => { posts++; return 'repeated'; }, () => undefined)).toBe(false);
    expect(posts).toBe(1);
    expect(guard.blocked()).toBe(true);
  });

  it('requires explicit successful readback before reopening after an ambiguous write', async () => {
    const guard = createCollaborationSubmissionGuard();
    await expect(guard.submitOnce(async () => { throw new Error('lost reply'); }, () => undefined)).rejects.toThrow();
    expect(guard.blocked()).toBe(true);
    expect(guard.readSucceeded()).toBe(true);
    expect(guard.blocked()).toBe(false);
    expect(await guard.submitOnce(async () => 'fresh-write', () => undefined)).toBe(true);
  });

  it('a competing refresh cannot unlock a still in-flight POST', async () => {
    const guard = createCollaborationSubmissionGuard();
    let rejectPost!: (error: Error) => void;
    const pending = new Promise<string>((_, reject) => { rejectPost = reject; });
    const post = guard.submitOnce(() => pending, () => undefined);
    expect(guard.readSucceeded()).toBe(false);
    expect(guard.blocked()).toBe(true);
    rejectPost(new Error('write uncertain'));
    await expect(post).rejects.toThrow('write uncertain');
    expect(guard.blocked()).toBe(true);
  });

  it('treats a rejected or invalid server projection as an unresolved write', async () => {
    const guard = createCollaborationSubmissionGuard();
    await expect(guard.submitOnce(async () => 'unexpected-row', () => {
      throw new Error('POST_PROJECTION_MISMATCH');
    })).rejects.toThrow('POST_PROJECTION_MISMATCH');
    expect(guard.blocked()).toBe(true);
  });
});
