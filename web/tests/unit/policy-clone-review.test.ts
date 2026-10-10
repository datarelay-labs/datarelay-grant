import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createPolicyCloneReview, canConfirmPolicyClone, PolicyCloneConfirmation,
  submitReviewedPolicyClone,
} from '../../src/policy_clone_review';
import type { Profile } from '../../src/types';

function policy(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'source-policy', version_id: 'source-policy-v4',
    version: 4, name: 'Sensitive onboarding',
    lifecycle: 'ACTIVE', active_version: 3, active_version_id: 'source-v3',
    integration_id: 'integration-control', approver_id: 'reviewer-a',
    approval_mode: 'SINGLE', approver_group_id: null, approvals_required: null,
    action_kind: 'employee.onboard', email_template_id: 'template-a',
    tenant_selector: 'controlled-tenant', environment: 'production',
    severity: '', risk_level: '', deadline_seconds: 3600,
    reminder_seconds: 600, max_reminders: 3, grant_seconds: 900,
    verification_mode: 'EMAIL_PIN_PLUS_OTP', denial_reason_required: true,
    enabled: true, updated_at: 300,
    ...overrides,
  };
}
function render(source: Profile | null = policy()): string {
  const intent = createPolicyCloneReview(policy());
  return renderToStaticMarkup(createElement(PolicyCloneConfirmation, {
    intent, source, busy: false,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }));
}

describe('Policy clone task-first confirm Draft only without immediate mutation', () => {
  it('snapshots the reviewed policy version, source and security context', () => {
    const source = policy();
    const intent = createPolicyCloneReview(source);
    expect(intent).toEqual({
      policyId: source.id, versionId: source.version_id, version: 4,
      name: source.name, lifecycle: 'ACTIVE',
      activeVersion: 3, activeVersionId: 'source-v3',
      actionKind: source.action_kind, integrationId: source.integration_id,
      approverId: source.approver_id, approvalMode: source.approval_mode,
      approverGroupId: null, approvalsRequired: null,
      emailTemplateId: 'template-a',
      tenantSelector: 'controlled-tenant', environment: 'production',
      severity: '', riskLevel: '',
      verificationMode: 'EMAIL_PIN_PLUS_OTP',
      denialReasonRequired: true, updatedAt: 300,
    });
    expect(canConfirmPolicyClone(intent, source)).toBe(true);
  });

  it('cannot confirm stale source after edit, active-lineage or security change', () => {
    const intent = createPolicyCloneReview(policy());
    for (const changed of [
      { id: 'other-policy' }, { version_id: 'source-policy-v5' },
      { version: 5 }, { name: 'Updated source' },
      { lifecycle: 'TESTING' as const }, { active_version: 4 },
      { active_version_id: 'new-active-v4' },
      { action_kind: 'other.action' },
      { integration_id: 'other-integration' },
      { approver_id: 'other-approver' }, { approval_mode: 'ALL' },
      { approver_group_id: 'group-id' }, { approvals_required: 3 },
      { email_template_id: 'other-template' },
      { verification_mode: 'EMAIL_PIN_PLUS_MFA' as const },
      { denial_reason_required: false },
      { tenant_selector: 'other-tenant' }, { updated_at: 301 },
    ] satisfies Partial<Profile>[]) {
      expect(canConfirmPolicyClone(intent, policy(changed))).toBe(false);
    }
    expect(canConfirmPolicyClone(intent, null)).toBe(false);
    expect(canConfirmPolicyClone(null, policy())).toBe(false);
  });

  it('shows source, version, action, verification and clearly Draft-only result', () => {
    const html = render();
    for (const word of [
      'Confirm policy clone', 'Sensitive onboarding', 'v4', 'ACTIVE',
      'Active version', 'v3', 'employee.onboard', 'integration-control',
      'EMAIL PIN PLUS OTP', 'Denial reason', 'Required', 'New Draft only',
      'not activated', 'Confirm clone draft', 'Cancel',
    ]) expect(html).toContain(word);
    expect(html.indexOf('Confirm policy clone')).toBeLessThan(html.indexOf('Confirm clone draft'));
    expect(html).not.toContain('Activate policy</button>');
    expect(html).not.toContain('Execute</button>');
  });

  it('does not allow stale or unavailable source to POST and shows explicit warning', () => {
    const stale = render(policy({ version: 5 }));
    expect(stale).toContain('changed since review');
    expect(stale).toContain('disabled=""');
    expect(stale).toContain('Confirm clone draft');
    expect(render(null)).toContain('changed since review');
  });

  it('performs one read-only recheck then one clone POST with exact reviewed ID', async () => {
    const intent = createPolicyCloneReview(policy());
    const calls: string[] = [];
    const result = policy({ id: 'new-draft', version: 1, version_id: 'new-draft-v1', lifecycle: 'DRAFT', enabled: false });
    const created = await submitReviewedPolicyClone(intent,
      async () => { calls.push('GET'); return policy(); },
      async (id) => { calls.push('POST ' + id); return result; },
    );
    expect(calls).toEqual(['GET', 'POST source-policy']);
    expect(created).toBe(result);
    expect(created.lifecycle).toBe('DRAFT');
  });

  it('fails closed after a conflicting fresh GET and sends no POST', async () => {
    let posts = 0;
    const intent = createPolicyCloneReview(policy());
    await expect(submitReviewedPolicyClone(intent,
      async () => policy({ verification_mode: 'EMAIL_PIN_PLUS_MFA' }),
      async () => { posts++; return policy(); },
    )).rejects.toThrow('POLICY_CHANGED_REVIEW_REQUIRED');
    expect(posts).toBe(0);
  });

  it('does not retry an ambiguous clone failure, and failed GET has no POST', async () => {
    const intent = createPolicyCloneReview(policy());
    let postCount = 0;
    await expect(submitReviewedPolicyClone(intent,
      async () => policy(),
      async () => { postCount++; throw new Error('CLONE_POST_UNKNOWN'); },
    )).rejects.toThrow('CLONE_POST_UNKNOWN');
    expect(postCount).toBe(1);
    await expect(submitReviewedPolicyClone(intent,
      async () => { throw new Error('GET_UNAVAILABLE'); },
      async () => { postCount++; return policy(); },
    )).rejects.toThrow('GET_UNAVAILABLE');
    expect(postCount).toBe(1);
  });

  it('escapes untrusted policy name and action, with no clone-triggered UI on render', () => {
    const bad = policy({
      name: '<img src=x onerror=alert(1)>',
      action_kind: '<script>alert(2)</script>',
    });
    const intent = createPolicyCloneReview(bad);
    const html = renderToStaticMarkup(createElement(PolicyCloneConfirmation, {
      source: bad, intent, busy: false,
      onCancel: () => undefined, onConfirm: () => undefined,
    }));
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('execution performed');
  });
});
