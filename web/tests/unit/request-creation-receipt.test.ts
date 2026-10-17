import { describe, expect, it } from 'vitest';
import { prepareRequestCreationReview, verifyCreatedRequestReceipt, type NewRequestDraft } from '../../src/request_creation_review';
import type { Profile, RequestRow } from '../../src/types';

const profile: Profile = {
  id: 'policy-a', version_id: 'policy-version-seven', version: 7,
  name: 'Protected change', integration_id: 'integration-a',
  approver_id: 'reviewer-a', approval_mode: 'SINGLE',
  approver_group_id: null, approvals_required: null,
  action_kind: 'service.deploy', email_template_id: null,
  deadline_seconds: 3600, reminder_seconds: 600, max_reminders: 2,
  grant_seconds: 900, tenant_selector: 'tenant-a',
  environment: 'production', severity: '', risk_level: '',
  lifecycle: 'ACTIVE', enabled: true,
};
function draft(): NewRequestDraft {
  return {
    profile, predecessor: null, title: 'Approved deployment',
    target: 'target-server', external: 'external-review-1',
    parameters: '{"outer":{"beta":2,"alpha":1},"services":["first","second"]}',
    reason: 'Routine change', sourceTenant: 'tenant-a',
    environment: 'production', severity: '', riskLevel: '',
  };
}
const reviewed = prepareRequestCreationReview(draft());
function serverRow(partial: Partial<RequestRow> = {}): RequestRow {
  const p = reviewed.payload;
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    external_id: p.external_id, integration_id: profile.integration_id,
    profile_id: p.profile_id,
    profile_version_id: profile.version_id, policy_version: profile.version,
    requester_id: 'requester-a', approver_id: 'reviewer-a',
    title: p.title, reason: p.reason, action: p.action,
    action_hash: 'server-computed-action-fingerprint',
    source: p.source, state: 'AWAITING', collaboration_state: 'OPEN',
    decision: null, decision_actor: null, decision_at: null,
    revision: 1, created_at: 1000, deadline: 4600,
    grant_until: null, predecessor_id: null,
    execution_id: null, execution_state: 'NOT_STARTED',
    execution_result: null, delivery_state: 'PENDING', ...partial,
  };
}

describe('B1 requester one-POST review and authoritative created-request receipt', () => {
  it('accepts only a server-projected request matching the reviewed immutable action', () => {
    const row = serverRow();
    expect(verifyCreatedRequestReceipt(reviewed, row)).toBe(row);
  });

  it('allows reordered JSON properties with identical parameter and source meaning', () => {
    const row = serverRow({
      action: { kind: 'service.deploy', target: 'target-server',
        parameters: { services: ['first', 'second'], outer: { alpha: 1, beta: 2 } } },
      source: { environment: 'production', tenant_id: 'tenant-a', channel: 'grant.web' },
    });
    expect(verifyCreatedRequestReceipt(reviewed, row)).toBe(row);
  });

  it('rejects an absent, malformed or unrelated server request identity before navigation', () => {
    for (const id of ['', 'other', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb1'.toUpperCase()]) {
      expect(() => verifyCreatedRequestReceipt(reviewed, serverRow({ id })))
        .toThrow('REQUEST_CREATE_RECEIPT_MISMATCH');
    }
  });

  it('rejects changed external ID, profile, integration, and snapshotted policy version', () => {
    for (const delta of [
      { external_id: 'another-intake' },
      { profile_id: 'another-policy' },
      { integration_id: 'another-integration' },
      { policy_version: 8 },
      { policy_version: null },
      { profile_version_id: 'another-version' },
    ]) {
      expect(() => verifyCreatedRequestReceipt(reviewed, serverRow(delta)))
        .toThrow('REQUEST_CREATE_RECEIPT_MISMATCH');
    }
  });

  it('rejects an action change or parameter reordering of array elements', () => {
    for (const action of [
      { ...reviewed.payload.action, kind: 'service.restart' },
      { ...reviewed.payload.action, target: 'other-server' },
      { ...reviewed.payload.action, parameters: { outer: { alpha: 1, beta: 2 },
        services: ['second', 'first'] } },
    ]) {
      expect(() => verifyCreatedRequestReceipt(reviewed, serverRow({ action })))
        .toThrow('REQUEST_CREATE_RECEIPT_MISMATCH');
    }
  });

  it('rejects different reason, source selector, title and linked predecessor', () => {
    for (const delta of [
      { title: 'Changed title' },
      { reason: 'Changed reason' },
      { source: { ...reviewed.payload.source, tenant_id: 'other-tenant' } },
      { predecessor_id: 'other-request' },
    ]) {
      expect(() => verifyCreatedRequestReceipt(reviewed, serverRow(delta)))
        .toThrow('REQUEST_CREATE_RECEIPT_MISMATCH');
    }
  });

  it('rejects invalid request revisions and does not claim execution', () => {
    for (const revision of [-1, 0, Number.NaN]) {
      expect(() => verifyCreatedRequestReceipt(reviewed, serverRow({ revision })))
        .toThrow('REQUEST_CREATE_RECEIPT_MISMATCH');
    }
    expect(verifyCreatedRequestReceipt(reviewed, serverRow()).execution_state).toBe('NOT_STARTED');
  });
});
