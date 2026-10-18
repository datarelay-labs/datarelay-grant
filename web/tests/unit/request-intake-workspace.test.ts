import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NewRequest } from '../../src/requests';
import { prepareRequestCreationReview, type NewRequestDraft } from '../../src/request_creation_review';
import {
  eligibleIntakeProfiles,
  NewRequestPolicyContext,
  RequestPolicyAvailability,
  RequestCreationReconciliationNotice,
} from '../../src/request_intake_context';
import type { Profile } from '../../src/types';

const active: Profile = {
  id: 'policy-1', version_id: 'policy-version-7', version: 7,
  name: 'Production Deployment', integration_id: 'integration-main',
  approver_id: 'assigned-by-server', approval_mode: 'N_OF_M',
  approver_group_id: 'group-oncall', approvals_required: 2,
  action_kind: 'service.deploy', email_template_id: null,
  deadline_seconds: 3600, reminder_seconds: 600,
  max_reminders: 2, grant_seconds: 1800, tenant_selector: 'customer-tenant',
  environment: 'production', severity: '', risk_level: '',
  verification_mode: 'EMAIL_PIN_PLUS_MFA', lifecycle: 'ACTIVE', enabled: true,
};

function markup(profile: Profile | null): string {
  return renderToStaticMarkup(createElement(NewRequestPolicyContext, { profile }));
}
function newRequestDraft(profile: Profile | null): NewRequestDraft {
  return {
    profile, predecessor: null, title: 'Deploy customer service',
    target: 'customer-service', external: 'CASE-123',
    parameters: '{"dry_run":true}', reason: 'Maintenance',
    sourceTenant: 'customer-tenant', environment: 'production',
    severity: '', riskLevel: '',
  };
}

describe('P0 competitor-derived task-first New Request workspace', () => {
  it('offers only enabled ACTIVE request policies, not enabled drafts or disabled ones', () => {
    const rows = [
      { ...active, id: 'policy-draft', lifecycle: 'DRAFT' as const },
      { ...active, id: 'policy-testing', lifecycle: 'TESTING' as const },
      { ...active, id: 'policy-disabled', enabled: false },
      active,
    ];
    expect(eligibleIntakeProfiles(rows).map((row) => row.id))
      .toEqual(['policy-1']);
    expect(rows[0].id).toBe('policy-draft');
  });

  it('rejects a selected saved draft before showing a final creation Confirm', () => {
    expect(() => prepareRequestCreationReview(newRequestDraft({
      ...active, lifecycle: 'DRAFT',
    }))).toThrow('active');
    expect(() => prepareRequestCreationReview(newRequestDraft({
      ...active, lifecycle: 'DISABLED', enabled: true,
    }))).toThrow('active');
    expect(() => prepareRequestCreationReview(newRequestDraft(active))).not.toThrow();
  });

  it('provides a policy-choice empty state, without fabricating a default approver', () => {
    const html = markup(null);
    expect(html).toContain('Assigned approval plan');
    expect(html).toContain('Choose a request type');
    expect(html).not.toContain('one approver');
    expect(html).not.toContain('Policy is approved');
  });

  it('shows exact operation, quorum, deadline, verification and grant timing from the selected active policy', () => {
    const html = markup(active);
    for (const word of [
      'Production Deployment', 'service.deploy', 'N_OF_M', '2 required',
      '3600 seconds', '1800 seconds', 'EMAIL_PIN_PLUS_MFA',
      'Published request type', 'Policy version</dt><dd>7', 'Integration reference',
    ]) expect(html).toContain(word);
    expect(html).toContain('Administrator-assigned group');
    expect(html).toContain('System default notification');
    expect(html).toContain('<details');
    expect(html).not.toContain('Execute</button>');
    expect(html).not.toContain('Approve</button>');
  });

  it('does not invent an approver count or verification tier when the source policy omits them', () => {
    const html = markup({
      ...active, approval_mode: 'SINGLE', approvals_required: null,
      verification_mode: undefined,
    });
    expect(html).toContain('Assigned seats resolved by server');
    expect(html).toContain('Server applies policy and integration requirements');
    expect(html).not.toContain('1 required');
    expect(html).not.toContain('MFA required');
  });

  it('does not claim disabled policy is request-eligible', () => {
    const html = markup({ ...active, enabled: false });
    expect(html).toContain('Request type unavailable');
    expect(html).not.toContain('Published request type');
  });

  it('escapes untrusted policy names, references, and operation in the visible context', () => {
    const html = markup({
      ...active, name: '<img src=x onerror=alert(1)>',
      action_kind: '<script>alert(1)</script>',
    });
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
  });

  it('presents one human-review workflow in the actual mounted NewRequest component', () => {
    const html = renderToStaticMarkup(createElement(NewRequest, {
      navigate: () => undefined,
    }));
    expect(html).toContain('Step 1 · Choose a request type');
    expect(html).toContain('Step 2 · Tell the reviewer what you need');
    expect(html).toContain('Step 3 · Review, then confirm');
    expect(html).toContain('Request creation progress');
    expect(html).toContain('Advanced integration details');
    expect(html).toContain('Review request');
    expect(html).toContain('Action parameters (JSON object; no credentials)');
    expect(html).not.toContain('Confirm create request</button>');
    expect(html).not.toContain('Execute</button>');
  });

  it('offers a nonmutating way to inspect My requests after an uncertain create POST', () => {
    const html = renderToStaticMarkup(createElement(RequestCreationReconciliationNotice, {
      openMyRequests: () => undefined,
    }));
    expect(html).toContain('Request creation outcome needs reconciliation');
    expect(html).toContain('Open My requests');
    expect(html).toContain('will not retry');
    expect(html).not.toContain('Try create again');
  });
});

describe('First-time New Request availability guidance', () => {
  it('makes the read-only policy loading state explicit before GET completes', () => {
    const html = renderToStaticMarkup(createElement(RequestPolicyAvailability, {
      loaded: false, hasAvailablePolicies: false, isAdmin: false, onManagePolicies: () => undefined,
    }));
    expect(html).toContain('Loading request types');
    expect(html).not.toContain('No active approval policy');
  });

  it('directs only an administrator to the existing policy workspace when no policy is active', () => {
    const html = renderToStaticMarkup(createElement(RequestPolicyAvailability, {
      loaded: true, hasAvailablePolicies: false, isAdmin: true, onManagePolicies: () => undefined,
    }));
    expect(html).toContain('No active request type');
    expect(html).toContain('Open Approval Policies');
    expect(html).not.toContain('Automatically activate');
  });

  it('does not show an admin-only policy action for ordinary members or healthy policy lists', () => {
    const member = renderToStaticMarkup(createElement(RequestPolicyAvailability, {
      loaded: true, hasAvailablePolicies: false, isAdmin: false, onManagePolicies: () => undefined,
    }));
    const available = renderToStaticMarkup(createElement(RequestPolicyAvailability, {
      loaded: true, hasAvailablePolicies: true, isAdmin: true, onManagePolicies: () => undefined,
    }));
    expect(member).toContain('Ask an administrator');
    expect(member).not.toContain('Open Approval Policies');
    expect(available).toBe('');
  });

  it('mounts the availability state in the New Request page without auto-creating a policy', () => {
    const html = renderToStaticMarkup(createElement(NewRequest, {
      navigate: () => undefined, isAdmin: true,
    }));
    expect(html).toContain('Loading request types');
    expect(html).not.toContain('Open Approval Policies');
    expect(html).not.toContain('Activate policy');
  });
});
