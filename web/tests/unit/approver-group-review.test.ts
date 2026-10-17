import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  prepareApproverGroupReview, isCurrentApproverGroupReview,
  ApproverGroupSaveConfirmation, createApproverGroupSaveGuard,
  submitReviewedApproverGroupSave, verifyApproverGroupSaveReceipt,
  moveApproverGroupMember,
} from '../../src/approver_group_review';
import type { ApproverGroup } from '../../src/types';

const saved: ApproverGroup = {
  id: 'oncall-group', name: 'On-call approvers', enabled: true,
  updated_at: 1781132213.443, member_ids: ['alice', 'bob', 'chris'],
};
const accounts = [
  { id: 'alice', displayName: 'Alice' },
  { id: 'bob', displayName: 'Bob' },
  { id: 'chris', displayName: 'Chris' },
  { id: 'dana', displayName: 'Dana' },
];

function html(group: ApproverGroup | null, name: string, members: string[]) {
  const review = prepareApproverGroupReview(group, name, members);
  return renderToStaticMarkup(createElement(ApproverGroupSaveConfirmation, {
    reviewed: review, valid: true, busy: false, accounts,
    onCancel: () => undefined, onConfirm: () => undefined,
  }));
}

describe('Grant P0 task-first approver group membership review, saved version & order', () => {
  it('snapshots name, exact saved revision, added/removed members and sequential order before POST', () => {
    const reviewed = prepareApproverGroupReview(saved, 'Production on-call',
      ['chris', 'dana', 'alice']);
    expect(reviewed.groupId).toBe('oncall-group');
    expect(reviewed.expectedUpdatedAt).toBe(saved.updated_at);
    expect(reviewed.added).toEqual(['dana']);
    expect(reviewed.removed).toEqual(['bob']);
    expect(reviewed.orderChanged).toBe(true);
    expect(reviewed.memberIds).toEqual(['chris', 'dana', 'alice']);
    expect(saved.member_ids).toEqual(['alice', 'bob', 'chris']);
  });

  it('renders one final Confirm showing who is added, removed and exact resulting order', () => {
    const output = html(saved, 'Production on-call', ['chris', 'dana', 'alice']);
    for (const word of ['Confirm approver group changes', 'Production on-call',
      'On-call approvers', 'Alice', 'Bob', 'Chris', 'Dana',
      'Members added', 'Members removed', 'Approval member order',
      'Sequential approval policies', 'Confirm save group']) {
      expect(output).toContain(word);
    }
    expect(output.indexOf('1. Chris')).toBeLessThan(output.indexOf('2. Dana'));
    expect(output.indexOf('2. Dana')).toBeLessThan(output.indexOf('3. Alice'));
    expect(output).not.toContain('Execute</button>');
  });

  it('makes a new group review explicit and does not invent an old revision', () => {
    const intent = prepareApproverGroupReview(null, 'New group', ['alice']);
    expect(intent.groupId).toBeNull();
    expect(intent.expectedUpdatedAt).toBeNull();
    expect(intent.added).toEqual(['alice']);
    expect(intent.removed).toEqual([]);
    expect(html(null, 'New group', ['alice'])).toContain('Confirm create group');
  });

  it('invalidates a frozen Confirm after name, any member, ordering or baseline revision drifts', () => {
    const intent = prepareApproverGroupReview(saved, 'On-call approvers', ['alice', 'bob', 'chris']);
    expect(isCurrentApproverGroupReview(intent, saved, 'On-call approvers',
      ['alice', 'bob', 'chris'])).toBe(true);
    expect(isCurrentApproverGroupReview(intent, saved, 'Other', ['alice', 'bob', 'chris'])).toBe(false);
    expect(isCurrentApproverGroupReview(intent, saved, 'On-call approvers',
      ['bob', 'alice', 'chris'])).toBe(false);
    expect(isCurrentApproverGroupReview(intent, saved, 'On-call approvers',
      ['alice', 'chris'])).toBe(false);
    expect(isCurrentApproverGroupReview(intent, { ...saved, updated_at: saved.updated_at + 1 },
      'On-call approvers', ['alice', 'bob', 'chris'])).toBe(false);
  });

  it('does not allow empty, duplicate or oversized membership or invalid names into final review', () => {
    for (const members of [[], ['alice','alice'], Array(51).fill('id')]) {
      expect(() => prepareApproverGroupReview(saved, 'Valid', members))
        .toThrow('APPROVER_GROUP_REVIEW_INVALID');
    }
    for (const name of ['', '  ', 'x'.repeat(101)]) {
      expect(() => prepareApproverGroupReview(saved, name, ['alice']))
        .toThrow('APPROVER_GROUP_REVIEW_INVALID');
    }
  });

  it('moves an exact member earlier/later without silently changing anyone else', () => {
    const before = ['alice', 'bob', 'chris'];
    expect(moveApproverGroupMember(before, 'chris', -1)).toEqual(['alice','chris','bob']);
    expect(moveApproverGroupMember(before, 'alice', 1)).toEqual(['bob','alice','chris']);
    expect(moveApproverGroupMember(before, 'alice', -1)).toEqual(before);
    expect(moveApproverGroupMember(before, 'unknown', 1)).toEqual(before);
    expect(before).toEqual(['alice','bob','chris']);
  });

  it('rejects a current server group changed by a different admin before POST', async () => {
    const gate = createApproverGroupSaveGuard();
    const reviewed = prepareApproverGroupReview(saved, 'Renamed', ['alice','bob']);
    let writes = 0;
    await expect(submitReviewedApproverGroupSave(reviewed, gate,
      async () => [{ ...saved, member_ids: ['alice', 'chris', 'bob'] }],
      async () => { writes++; return saved; },
    )).rejects.toThrow('APPROVER_GROUP_CHANGED_REVIEW_REQUIRED');
    expect(writes).toBe(0);
    expect(gate.blocked()).toBe(false);
  });

  it('performs a role-scoped GET then exactly one versioned POST on explicit final Confirm', async () => {
    const gate = createApproverGroupSaveGuard();
    const reviewed = prepareApproverGroupReview(saved, 'Renamed', ['bob','alice']);
    const calls: string[] = [];
    const result = await submitReviewedApproverGroupSave(reviewed, gate,
      async () => { calls.push('GET saved'); return [saved]; },
      async (intent) => {
        calls.push('PUT versioned');
        expect(intent.expectedUpdatedAt).toBe(saved.updated_at);
        expect(intent.memberIds).toEqual(['bob','alice']);
        return { ...saved, updated_at: saved.updated_at + 1,
          name: 'Renamed', member_ids: ['bob','alice'] };
      },
    );
    expect(calls).toEqual(['GET saved', 'PUT versioned']);
    expect(verifyApproverGroupSaveReceipt(reviewed, result!)).toBe(result);
    expect(gate.blocked()).toBe(true);
  });

  it('starts only one write on rapid double-confirm with the same stale React render', async () => {
    const gate = createApproverGroupSaveGuard();
    const reviewed = prepareApproverGroupReview(null, 'New group', ['alice']);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let count = 0;
    const sender = async () => submitReviewedApproverGroupSave(reviewed, gate,
      async () => [], async () => { count++; await pending; return saved; });
    const first = sender();
    const second = sender();
    expect(count).toBe(1);
    release();
    expect(await first).toBe(saved);
    expect(await second).toBeNull();
  });

  it('retains uncertain group POST, suppressing all duplicates until an explicit successful refresh', async () => {
    const gate = createApproverGroupSaveGuard();
    const review = prepareApproverGroupReview(null, 'New group', ['alice']);
    let writes = 0;
    await expect(submitReviewedApproverGroupSave(review, gate,
      async () => [], async () => { writes++; throw new Error('OUTCOME_UNKNOWN'); },
    )).rejects.toThrow('OUTCOME_UNKNOWN');
    expect(writes).toBe(1);
    expect(gate.blocked()).toBe(true);
    expect(await submitReviewedApproverGroupSave(review, gate,
      async () => [], async () => { writes++; return saved; },
    )).toBeNull();
    expect(writes).toBe(1);
    expect(gate.readSucceeded()).toBe(true);
    expect(gate.blocked()).toBe(false);
  });

  it('does not unlock an in-flight write from another asynchronous read', () => {
    const gate = createApproverGroupSaveGuard();
    expect(gate.claim()).toBe(true);
    gate.markPostStarted();
    expect(gate.readSucceeded()).toBe(false);
    gate.settled();
    expect(gate.blocked()).toBe(true);
  });

  it('fails closed on a mismatched or older server receipt without silently granting authority', () => {
    const reviewed = prepareApproverGroupReview(saved, 'Renamed', ['bob','alice']);
    for (const row of [
      { ...saved, updated_at: saved.updated_at + 1, name: 'Wrong', member_ids: ['bob','alice'] },
      { ...saved, updated_at: saved.updated_at + 1, name: 'Renamed', member_ids: ['alice','bob'] },
      { ...saved, name: 'Renamed', member_ids: ['bob','alice'] },
    ]) expect(() => verifyApproverGroupSaveReceipt(reviewed, row))
      .toThrow('APPROVER_GROUP_SAVE_RECEIPT_MISMATCH');
  });

  it('escapes untrusted group/account names in human confirmation', () => {
    const output = renderToStaticMarkup(createElement(ApproverGroupSaveConfirmation, {
      reviewed: prepareApproverGroupReview(null, '<script>alert(1)</script>', ['alice']),
      valid: true, busy: false,
      accounts: [{ id: 'alice', displayName: '<img src=x onerror=alert(2)>' }],
      onCancel: () => undefined, onConfirm: () => undefined,
    }));
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain('&lt;img');
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<img src=x');
  });
});
