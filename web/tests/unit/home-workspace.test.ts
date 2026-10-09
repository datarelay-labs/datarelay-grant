import { describe, expect, it } from 'vitest';
import { projectHomeWorkspace, requesterProgress } from '../../src/home_pages';
import type { RequestRow } from '../../src/types';

function sample(
  id: string,
  changes: Partial<RequestRow> = {},
): RequestRow {
  return {
    id, external_id: 'EX-' + id, integration_id: 'integration',
    profile_id: 'profile', requester_id: 'requester',
    approver_id: 'approver', viewer_assigned: false, viewer_can_decide: false,
    title: 'Request ' + id, reason: 'Demo', action: {
      kind: 'service.access', target: 'test-service', parameters: {},
    },
    action_hash: 'immutable-hash', source: {}, state: 'AWAITING',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 1, created_at: 100,
    deadline: 10_000, grant_until: null, predecessor_id: null,
    execution_id: null, execution_state: 'NOT_STARTED',
    execution_result: null, delivery_state: 'QUEUED',
    ...changes,
  };
}

describe('Grant Home task-first projection', () => {
  it('prioritizes actionable assigned decisions by earliest deadline, not latest creation', () => {
    const rows = [
      sample('late', { viewer_assigned: true, viewer_can_decide: true, deadline: 850, created_at: 999 }),
      sample('early', { viewer_assigned: true, viewer_can_decide: true, deadline: 620, created_at: 100 }),
      sample('held', { viewer_assigned: true, viewer_can_decide: true, state: 'HELD', deadline: 720 }),
    ];
    expect(projectHomeWorkspace(rows, 'another', false, 500).decisions.map((r) => r.id))
      .toEqual(['early', 'held', 'late']);
  });

  it('never treats assigned-but-unavailable, expired or information-blocked requests as actionable', () => {
    const rows = [
      sample('assigned', { viewer_assigned: true }),
      sample('unassigned-can-decide', { viewer_can_decide: true }),
      sample('expired', { viewer_assigned: true, viewer_can_decide: true, deadline: 400 }),
      sample('info', { viewer_assigned: true, viewer_can_decide: true, collaboration_state: 'INFO_REQUESTED' }),
      sample('completed', { viewer_assigned: true, viewer_can_decide: true, state: 'APPROVED' }),
    ];
    const snapshot = projectHomeWorkspace(rows, 'stranger', false, 500);
    expect(snapshot.decisions).toEqual([]);
    expect(snapshot.overdue).toEqual([]);
  });

  it('keeps overdue/expired separate from decisions and preserves existing approval queue semantics', () => {
    const rows = [
      sample('overdue', { viewer_assigned: true, overdue: true, deadline: 500 }),
      sample('expired', { viewer_assigned: true, state: 'EXPIRED', deadline: 200 }),
      sample('unassigned-expired', { overdue: true, state: 'EXPIRED' }),
    ];
    const snapshot = projectHomeWorkspace(rows, 'unrelated', false, 900);
    expect(snapshot.decisions).toEqual([]);
    expect(snapshot.overdue.map((r) => r.id)).toEqual(['expired', 'overdue']);
  });

  it('shows only the actual requester their own progress and responses', () => {
    const rows = [
      sample('other', { requester_id: 'other', created_at: 999, collaboration_state: 'INFO_REQUESTED' }),
      sample('mine', { requester_id: 'mine', created_at: 800 }),
      sample('my-response', { requester_id: 'mine', created_at: 810, deadline: 700, collaboration_state: 'INFO_REQUESTED' }),
      sample('my-revision', { requester_id: 'mine', created_at: 820, deadline: 800, collaboration_state: 'CHANGES_REQUESTED' }),
    ];
    const snapshot = projectHomeWorkspace(rows, 'mine', false, 500);
    expect(snapshot.submitted.map((r) => r.id))
      .toEqual(['my-revision', 'my-response', 'mine']);
    expect(snapshot.needsResponse.map((r) => r.id))
      .toEqual(['my-response', 'my-revision']);
    expect(snapshot.recent.map((r) => r.id)).not.toContain('other');
  });

  it('never promotes an unrelated request into member-only operational summaries', () => {
    const rows = [
      sample('failed', { requester_id: 'other', delivery_state: 'FAILED', execution_state: 'FAILED' }),
      sample('approved-unused', { requester_id: 'mine', state: 'APPROVED', execution_state: 'NOT_STARTED' }),
    ];
    const member = projectHomeWorkspace(rows, 'mine', false, 500);
    expect(member.deliveryFailures).toEqual([]);
    expect(member.executionExceptions).toEqual([]);
    const admin = projectHomeWorkspace(rows, 'admin', true, 500);
    expect(admin.deliveryFailures.map((r) => r.id)).toEqual(['failed']);
    expect(admin.executionExceptions.map((r) => r.id))
      .toEqual(['failed', 'approved-unused']);
  });

  it('keeps same-day or tie-sorted decisions deterministic', () => {
    const rows = [
      sample('b', { viewer_assigned: true, viewer_can_decide: true, deadline: 1500, created_at: 250 }),
      sample('a', { viewer_assigned: true, viewer_can_decide: true, deadline: 1500, created_at: 250 }),
    ];
    expect(projectHomeWorkspace(rows, 'any', false, 300).decisions.map((r) => r.id))
      .toEqual(['a', 'b']);
  });

  it('does not suggest answering expired information requests or terminal closed cases', () => {
    const rows = [
      sample('info-expired', { requester_id: 'mine', collaboration_state: 'INFO_REQUESTED', state: 'EXPIRED' }),
      sample('change-expired', { requester_id: 'mine', collaboration_state: 'CHANGES_REQUESTED', state: 'EXPIRED' }),
      sample('info-approved', { requester_id: 'mine', collaboration_state: 'INFO_REQUESTED', state: 'APPROVED' }),
    ];
    const current = projectHomeWorkspace(rows, 'mine', false, 500);
    expect(current.needsResponse.map((item) => item.id)).toEqual(['change-expired']);
    expect(requesterProgress(rows[0]!)).toBe('Expired');
    expect(requesterProgress(rows[1]!)).toBe('Changes requested · submit a revised request');
    expect(requesterProgress(rows[2]!)).toBe('Approved · awaiting execution');
  });

  it('reports approved decisions separately from actual execution', () => {
    expect(requesterProgress(sample('a', { state: 'APPROVED' })))
      .toBe('Approved · awaiting execution');
    expect(requesterProgress(sample('b', { state: 'APPROVED', execution_state: 'FAILED' })))
      .toBe('Approved · execution failed');
    expect(requesterProgress(sample('c', { state: 'APPROVED', execution_state: 'UNKNOWN' })))
      .toBe('Approved · execution status unknown');
    expect(requesterProgress(sample('d', { state: 'APPROVED', execution_state: 'SUCCEEDED' })))
      .toBe('Approved · execution completed');
  });

  it('prioritizes requester collaboration state over stale decision state', () => {
    expect(requesterProgress(sample('a', { state: 'HELD', collaboration_state: 'INFO_REQUESTED' })))
      .toBe('Information requested');
    expect(requesterProgress(sample('b', { state: 'AWAITING', collaboration_state: 'CHANGES_REQUESTED' })))
      .toBe('Changes requested');
  });
});
