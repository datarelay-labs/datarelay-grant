import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  canConfirmPolicyTransition,
  PolicyLifecycleConfirmation,
  type PolicyTransitionIntent,
} from '../../src/policies';
import type { Profile } from '../../src/types';

const policy: Profile = {
  id: 'grant-policy-42',
  version_id: 'grant-policy-42-v2',
  version: 2,
  name: 'Privileged service restart',
  lifecycle: 'TESTING', enabled: false,
  active_version: null, active_version_id: null,
  integration_id: 'integration-1', approver_id: 'reviewer-1',
  approval_mode: 'SINGLE', approver_group_id: null, approvals_required: null,
  action_kind: 'service.restart', email_template_id: null,
  deadline_seconds: 86400, reminder_seconds: 3600, max_reminders: 3,
  grant_seconds: 900, tenant_selector: '', environment: '',
  severity: '', risk_level: '',
};
const intent: PolicyTransitionIntent = {
  policyId: policy.id,
  action: 'activate',
  versionId: policy.version_id,
  version: policy.version,
  activeVersion: null,
};

function html(pending: PolicyTransitionIntent | null, current: Profile | null) {
  return renderToStaticMarkup(createElement(PolicyLifecycleConfirmation, {
    intent: pending,
    policy: current,
    busy: false,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }));
}

describe('G1 explicit approval policy lifecycle confirmation', () => {
  it('cannot confirm when a policy identity, version or eligibility changed', () => {
    expect(canConfirmPolicyTransition(intent, policy)).toBe(true);
    expect(canConfirmPolicyTransition(intent, { ...policy, id: 'other-policy' })).toBe(false);
    expect(canConfirmPolicyTransition(intent, { ...policy, version_id: 'other-version' })).toBe(false);
    expect(canConfirmPolicyTransition(intent, { ...policy, version: 3 })).toBe(false);
    expect(canConfirmPolicyTransition(intent, { ...policy, lifecycle: 'DRAFT' })).toBe(false);
    expect(canConfirmPolicyTransition(intent, null)).toBe(false);
    expect(canConfirmPolicyTransition(null, policy)).toBe(false);
    const disable: PolicyTransitionIntent = {
      ...intent, action: 'disable', activeVersion: 1,
    };
    expect(canConfirmPolicyTransition(disable, { ...policy, active_version: 1 })).toBe(true);
    expect(canConfirmPolicyTransition(disable, { ...policy, active_version: 2 })).toBe(false);
    expect(canConfirmPolicyTransition(disable, policy)).toBe(false);
  });

  it('requires a separate explicit non-submitting confirmation for activation', () => {
    expect(html(null, policy)).toBe('');
    const text = html(intent, policy);
    expect(text).toContain('Confirm policy activation');
    expect(text).toContain('Privileged service restart');
    expect(text).toContain('Confirm activation');
    expect(text).toContain('Cancel');
    expect(text).toContain('existing requests');
    expect(text).not.toContain('<form');
    expect(text).not.toContain('type="submit"');
    expect(html({ ...intent, action: 'disable', activeVersion: 1 },
      { ...policy, active_version: 1 })).toContain('Confirm active policy disable');
  });

  it('disables confirmation on a stale version without leaking name as HTML', () => {
    const changed = { ...policy, name: '<script>alert(1)</script>', version_id: 'fresh' };
    const markup = html(intent, changed);
    expect(markup).toContain('Policy changed since review');
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('&lt;script&gt;');
    expect(markup).toContain('disabled');
  });
});
