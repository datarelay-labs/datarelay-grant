import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  prepareRequestCreationReview,
  isCurrentRequestCreationReview,
  submitReviewedRequestCreation,
  submitReviewedRequestCreationWithFreshRead,
  RequestCreationConfirmation,
  type NewRequestDraft,
} from '../../src/request_creation_review';
import { NewRequest } from '../../src/requests';
import type { Profile, RequestRow } from '../../src/types';

const active: Profile = {
  id: 'policy-one', version_id: 'policy-v7', version: 7,
  name: 'Service maintenance', integration_id: 'integration-one',
  approver_id: 'reviewer', approval_mode: 'SINGLE',
  approver_group_id: null, approvals_required: null,
  action_kind: 'service.deploy', email_template_id: null,
  deadline_seconds: 3600, reminder_seconds: 600,
  max_reminders: 2, grant_seconds: 1800,
  tenant_selector: 'tenant-a', environment: 'production',
  severity: '', risk_level: '', lifecycle: 'ACTIVE', enabled: true,
};
function draft(partial: Partial<NewRequestDraft> = {}): NewRequestDraft {
  return {
    profile: active, predecessor: null, predecessorId: undefined,
    title: 'Deploy service', target: 'isolated-test',
    external: 'WEB-123', parameters: '{"version":"1.0","restart":true}',
    reason: 'Scheduled maintenance',
    sourceTenant: 'tenant-a', environment: 'production',
    severity: '', riskLevel: '', ...partial,
  };
}
function previous(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'previous-request', external_id: 'old', integration_id: 'integration-one',
    profile_id: active.id, requester_id: 'requester', approver_id: 'reviewer',
    title: 'Old', reason: '', action: { kind: 'service.deploy', target: 'old-target', parameters: {} },
    action_hash: 'previous-hash', source: { case_id: 'CASE-X', tenant_id: 'tenant-a' },
    state: 'CANCELLED', collaboration_state: 'OPEN',
    decision: null, decision_actor: null, decision_at: null,
    revision: 2, created_at: 1, deadline: 900,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'PENDING', ...overrides,
  };
}
function previewMarkup(input = draft()): string {
  const review = prepareRequestCreationReview(input);
  return renderToStaticMarkup(createElement(RequestCreationConfirmation, {
    reviewed: review, draft: input, busy: false,
    onConfirm: () => undefined, onBack: () => undefined,
  }));
}

describe('Grant New Request explicit task-first review before creating an immutable approval', () => {
  it('requires a separate Review request before Confirm: no single-step POST CTA', () => {
    const form = renderToStaticMarkup(createElement(NewRequest, {
      navigate: () => undefined,
    }));
    expect(form).toContain('Review request');
    expect(form).not.toContain('Submit request</button>');
    expect(form).not.toContain('Confirm create request');
  });

  it('captures exactly the existing bounded POST payload and complete policy/source', () => {
    const review = prepareRequestCreationReview(draft());
    expect(review.payload).toEqual({
      external_id: 'WEB-123', profile_id: active.id,
      title: 'Deploy service',
      action: { kind: 'service.deploy', target: 'isolated-test',
        parameters: { version: '1.0', restart: true } },
      reason: 'Scheduled maintenance',
      source: {
        channel: 'grant.web', tenant_id: 'tenant-a', environment: 'production',
      },
    });
    expect(review.profileName).toBe('Service maintenance');
    expect(isCurrentRequestCreationReview(review, draft())).toBe(true);
    expect(previewMarkup()).toContain('Confirm create request');
  });

  it('requires fresh review after any input, selected profile, or policy revision changes', () => {
    const original = draft();
    const review = prepareRequestCreationReview(original);
    const variations: Partial<NewRequestDraft>[] = [
      { title: 'Changed' }, { target: 'different-target' },
      { parameters: '{"version":"1.0","restart":false}' },
      { parameters: '{ "version":"1.0", "restart":true }' },
      { external: 'WEB-456' }, { reason: 'Different reason' },
      { sourceTenant: 'different-tenant' }, { environment: 'staging' },
      { severity: 'high' }, { riskLevel: 'critical' },
      { profile: { ...active, version: 8 } },
      { profile: { ...active, action_kind: 'service.restart' } },
      { profile: null },
      { predecessorId: 'changed-replacement' },
    ];
    for (const mutation of variations) {
      expect(isCurrentRequestCreationReview(review, draft(mutation))).toBe(false);
    }
    expect(previewMarkup(draft({ title: '<b>Hello</b>' }))).toContain('Confirm create request');
  });

  it('validates server payload boundaries and scope before offering Confirm', () => {
    for (const altered of [
      { profile: null }, { title: '' }, { title: ' '.repeat(3) },
      { target: '' }, { external: '' }, { external: 'X'.repeat(201) },
      { title: 'X'.repeat(251) }, { target: 'X'.repeat(501) },
      { reason: 'Y'.repeat(4001) }, { parameters: '{invalid' },
      { parameters: '[]' }, { parameters: 'null' }, { parameters: '"literal"' },
      { profile: { ...active, tenant: 'tenant-a' }, sourceTenant: 'other' }, { environment: '' },
      { predecessorId: 'older' },
    ] satisfies Partial<NewRequestDraft>[]) {
      expect(() => prepareRequestCreationReview(draft(altered))).toThrow();
    }
    expect(prepareRequestCreationReview(draft({ reason: 'a'.repeat(4000) }))
      .payload.reason).toHaveLength(4000);
  });

  it('renders exact action and policy details, full parameters and no execution permission', () => {
    const html = previewMarkup();
    for (const field of [
      'Review approval request', 'Operation', 'service.deploy', 'Target',
      'isolated-test', 'Service maintenance', 'Policy version',
      '7', 'Source selectors', 'production', 'WEB-123',
      'Scheduled maintenance', 'restart', 'true', 'Confirm create request',
      'Create only an approval request', 'no external execution',
    ]) expect(html).toContain(field);
    expect(html.indexOf('Operation')).toBeLessThan(html.indexOf('Confirm create request'));
    expect(html).not.toContain('Approve</button>');
    expect(html).not.toContain('Execute</button>');
  });

  it('supports linked replacement without copying prior execution authorization', () => {
    const linked = draft({
      predecessor: previous(), predecessorId: 'previous-request',
      target: 'new-test-service',
    });
    const review = prepareRequestCreationReview(linked);
    expect(review.payload.predecessor_id).toBe('previous-request');
    expect(review.payload.action.target).toBe('new-test-service');
    expect(review.payload.source).toEqual({
      case_id: 'CASE-X', tenant_id: 'tenant-a',
      channel: 'grant.web', environment: 'production',
    });
    expect(previewMarkup(linked)).toContain('previous-request');
    expect(() => prepareRequestCreationReview({
      ...linked, predecessor: previous({ state: 'APPROVED' }),
    })).toThrow();
    expect(isCurrentRequestCreationReview(
      review, { ...linked, predecessor: previous({ revision: 3 }) },
    )).toBe(false);
  });

  it('submits exactly the reviewed payload once and uses the returned request', async () => {
    const input = draft();
    const reviewed = prepareRequestCreationReview(input);
    const calls: unknown[] = [];
    const created = { id: 'new-request-id' };
    const result = await submitReviewedRequestCreation(reviewed, input, async (payload) => {
      calls.push(payload);
      return created;
    });
    expect(calls).toEqual([reviewed.payload]);
    expect(result).toBe(created);
  });

  it('refuses to POST after any stale form update, even an equivalent JSON reformat', async () => {
    const input = draft();
    const reviewed = prepareRequestCreationReview(input);
    let writes = 0;
    await expect(submitReviewedRequestCreation(
      reviewed, draft({ parameters: '{ "version":"1.0", "restart":true }' }),
      async () => { writes++; return { id: 'must-not-create' }; },
    )).rejects.toThrow('REQUEST_REVIEW_CHANGED');
    expect(writes).toBe(0);
  });

  it('never retries an ambiguous create POST failure or claims a created request', async () => {
    let writes = 0;
    const input = draft();
    await expect(submitReviewedRequestCreation(
      prepareRequestCreationReview(input), input,
      async () => { writes++; throw new Error('POST_RESULT_UNKNOWN'); },
    )).rejects.toThrow('POST_RESULT_UNKNOWN');
    expect(writes).toBe(1);
  });

  it('checks current policy before ONE immutable create POST and uses the reviewed payload', async () => {
    const input = draft();
    const frozen = prepareRequestCreationReview(input);
    const calls: string[] = [];
    const result = { id: 'server-created' };
    const committed = await submitReviewedRequestCreationWithFreshRead(
      frozen, input,
      async () => {
        calls.push('GET current policy');
        // Property insertion order and unrelated metadata cannot change identity.
        return { policy: { ...active }, predecessor: null };
      },
      async (payload) => {
        calls.push('POST reviewed request');
        expect(payload).toEqual(frozen.payload);
        return result;
      },
    );
    expect(calls).toEqual(['GET current policy', 'POST reviewed request']);
    expect(committed).toBe(result);
  });

  it('blocks policy version, active lineage, kind, approver, verification and source drift', async () => {
    const input = draft();
    const frozen = prepareRequestCreationReview(input);
    let writes = 0;
    const changes: Partial<Profile>[] = [
      { version: 8 }, { version_id: 'policy-v8' },
      { enabled: false }, { lifecycle: 'DISABLED' },
      { integration_id: 'other-integration' }, { action_kind: 'service.restart' },
      { approver_id: 'new-reviewer' }, { approval_mode: 'ALL' },
      { approver_group_id: 'new-group' }, { approvals_required: 3 },
      { tenant: 'tenant-other' }, { tenant_selector: 'other-tenant' },
      { environment: 'staging' }, { severity: 'critical' },
      { risk_level: 'high' }, { denial_reason_required: true },
      { verification_mode: 'EMAIL_PIN_PLUS_MFA' },
      { active_version: 8 }, { active_version_id: 'active-v8' },
      { email_template_id: 'other-template' },
      { deadline_seconds: 7200 }, { grant_seconds: 2400 },
    ];
    for (const change of changes) {
      await expect(submitReviewedRequestCreationWithFreshRead(
        frozen, input,
        async () => ({ policy: { ...active, ...change }, predecessor: null }),
        async () => { writes++; return { id: 'never-created' }; },
      )).rejects.toThrow('PROFILE_CHANGED_REVIEW_REQUIRED');
    }
    expect(writes).toBe(0);
  });

  it('rejects deleted or unavailable policy and a failed role-visible profile GET', async () => {
    const input = draft();
    const frozen = prepareRequestCreationReview(input);
    let writes = 0;
    await expect(submitReviewedRequestCreationWithFreshRead(
      frozen, input, async () => ({ policy: null, predecessor: null }),
      async () => { writes++; return { id: 'unexpected' }; },
    )).rejects.toThrow('PROFILE_CHANGED_REVIEW_REQUIRED');
    await expect(submitReviewedRequestCreationWithFreshRead(
      frozen, input, async () => { throw new Error('GET_FAILED'); },
      async () => { writes++; return { id: 'unexpected' }; },
    )).rejects.toThrow('GET_FAILED');
    expect(writes).toBe(0);
  });

  it('rechecks linked predecessor before creating a fresh approval', async () => {
    const input = draft({ predecessorId: 'previous-request', predecessor: previous() });
    const frozen = prepareRequestCreationReview(input);
    const calls: string[] = [];
    const result = await submitReviewedRequestCreationWithFreshRead(
      frozen, input,
      async () => {
        calls.push('GET policy and prior request');
        return { policy: active, predecessor: previous() };
      },
      async (payload) => {
        calls.push('POST create');
        expect(payload.predecessor_id).toBe('previous-request');
        expect(payload.action.target).toBe('isolated-test');
        return { id: 'replacement-request' };
      },
    );
    expect(result.id).toBe('replacement-request');
    expect(calls).toEqual(['GET policy and prior request', 'POST create']);
  });

  it('refuses a stale, canceled-drifted, cross-source or wrong prior request with zero POSTs', async () => {
    const input = draft({ predecessorId: 'previous-request', predecessor: previous() });
    const reviewed = prepareRequestCreationReview(input);
    let writes = 0;
    const changes: Partial<RequestRow>[] = [
      { id: 'another' }, { revision: 3 }, { state: 'APPROVED' },
      { collaboration_state: 'CHANGES_REQUESTED' }, { requester_id: 'other' },
      { integration_id: 'other-integration' },
      { profile_id: 'other-profile' }, { action_hash: 'different-action' },
      { source: { tenant_id: 'other' } },
    ];
    for (const change of changes) {
      await expect(submitReviewedRequestCreationWithFreshRead(
        reviewed, input,
        async () => ({ policy: active, predecessor: previous(change) }),
        async () => { writes++; return { id: 'unexpected' }; },
      )).rejects.toThrow('PREDECESSOR_CHANGED_REVIEW_REQUIRED');
    }
    await expect(submitReviewedRequestCreationWithFreshRead(
      reviewed, input, async () => ({ policy: active, predecessor: null }),
      async () => { writes++; return { id: 'unexpected' }; },
    )).rejects.toThrow('PREDECESSOR_CHANGED_REVIEW_REQUIRED');
    expect(writes).toBe(0);
  });

  it('does no GET or POST when the reviewed local draft has changed already', async () => {
    const input = draft();
    const reviewed = prepareRequestCreationReview(input);
    const calls: string[] = [];
    await expect(submitReviewedRequestCreationWithFreshRead(
      reviewed, draft({ reason: 'another reason' }),
      async () => { calls.push('GET'); return { policy: active, predecessor: null }; },
      async () => { calls.push('POST'); return { id: 'should-not-exist' }; },
    )).rejects.toThrow('REQUEST_REVIEW_CHANGED');
    expect(calls).toEqual([]);
  });

  it('never retries POST if server creation outcome is ambiguous after fresh read', async () => {
    const input = draft();
    let reads = 0;
    let posts = 0;
    await expect(submitReviewedRequestCreationWithFreshRead(
      prepareRequestCreationReview(input), input,
      async () => { reads++; return { policy: active, predecessor: null }; },
      async () => { posts++; throw new Error('POST_RESULT_UNKNOWN'); },
    )).rejects.toThrow('POST_RESULT_UNKNOWN');
    expect(reads).toBe(1);
    expect(posts).toBe(1);
  });

  it('keeps untrusted request fields escaped and hides stale confirmation', () => {
    const malicious = draft({
      title: '<img src=x onerror=alert(1)>',
      target: '<script>alert(2)</script>',
      parameters: '{"notes":"<svg onload=alert(3)>"}',
    });
    const html = previewMarkup(malicious);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;svg');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<svg onload');
    const frozen = prepareRequestCreationReview(draft());
    const stale = renderToStaticMarkup(createElement(RequestCreationConfirmation, {
      reviewed: frozen, draft: draft({ title: 'Changed' }), busy: false,
      onConfirm: () => undefined, onBack: () => undefined,
    }));
    expect(stale).toBe('');
  });
});
