import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  isPolicyEditorUnchanged,
  policyEditorPayload,
  PolicyUnsavedNotice,
  PolicyLifecycleConfirmation,
  type PolicyEditorDraft,
  type PolicyTransitionIntent,
} from '../../src/policies';
import { readDecisionSecurity } from '../../src/policy_decision_security';
import type { Profile } from '../../src/types';

const saved: Profile = {
  id: 'profile-a', version_id: 'profile-v2', version: 2,
  name: 'Review production changes', lifecycle: 'TESTING', enabled: false,
  active_version: null, active_version_id: null,
  integration_id: 'integration-a', approver_id: 'reviewer-a',
  approval_mode: 'N_OF_M', approver_group_id: 'group-a',
  approvals_required: 2, action_kind: 'change.apply',
  email_template_id: 'template-a', deadline_seconds: 86400,
  reminder_seconds: 3600, max_reminders: 3, grant_seconds: 900,
  tenant_selector: 'tenant-a', environment: 'prod', severity: 'high', risk_level: 'medium',
  denial_reason_required: true, verification_mode: 'EMAIL_PIN_PLUS_MFA',
  decision_link_ttl_seconds: 3600,
};
const draft: PolicyEditorDraft = {
  name: saved.name, integration: saved.integration_id, approver: saved.approver_id,
  approvalMode: saved.approval_mode, approverGroup: saved.approver_group_id!,
  approvalsRequired: String(saved.approvals_required), action: saved.action_kind,
  template: saved.email_template_id!, deadline: String(saved.deadline_seconds),
  reminder: String(saved.reminder_seconds), count: String(saved.max_reminders),
  validity: String(saved.grant_seconds), tenant: saved.tenant_selector,
  environment: saved.environment, severity: saved.severity, risk: saved.risk_level,
  decisionSecurity: readDecisionSecurity(saved),
};
const same = (next: PolicyEditorDraft, server: Profile | null = saved,
  baseline: Profile | null = saved) =>
  isPolicyEditorUnchanged(server, baseline, next);

describe('G1 saved policy vs in-memory draft lifecycle guard', () => {
  it('accepts the exact saved form and equivalent numeric/nullable representations', () => {
    expect(same(draft)).toBe(true);
    expect(same({ ...draft, reminder: '03600', count: '03', validity: ' 900 ' })).toBe(true);
    expect(policyEditorPayload(draft).verification_mode).toBe('EMAIL_PIN_PLUS_MFA');
    expect(policyEditorPayload(draft).approval_mode).toBe('N_OF_M');
    expect(draft.approvalsRequired).toBe('2'); // no mutation by comparison

    const single: Profile = {
      ...saved, approval_mode: 'SINGLE', approver_group_id: null,
      approvals_required: null, decision_link_ttl_seconds: null,
    };
    const onlyOne = {
      ...draft,
      approvalMode: 'SINGLE',
      approverGroup: '',
      approvalsRequired: '7', // hidden value is irrelevant when SINGLE
      decisionSecurity: readDecisionSecurity(single),
    };
    expect(same(onlyOne, single, single)).toBe(true);
  });

  it.each([
    ['name', { name: 'Changed' }],
    ['integration', { integration: 'integration-b' }],
    ['approver', { approver: 'reviewer-b' }],
    ['approval mode', { approvalMode: 'ALL' }],
    ['group', { approverGroup: 'group-b' }],
    ['quorum', { approvalsRequired: '1' }],
    ['action', { action: 'change.revert' }],
    ['template', { template: '' }],
    ['deadline', { deadline: '172800' }],
    ['reminder', { reminder: '1800' }],
    ['count', { count: '5' }],
    ['grant validity', { validity: '300' }],
    ['tenant', { tenant: 'tenant-b' }],
    ['environment', { environment: 'dev' }],
    ['severity', { severity: 'low' }],
    ['risk', { risk: '' }],
  ])('blocks pending lifecycle actions when %s is edited', (_name, changes) => {
    expect(same({ ...draft, ...changes })).toBe(false);
  });

  it('treats any unsaved denial reason, OTP/MFA or link TTL change as dirty', () => {
    expect(same({ ...draft, decisionSecurity: {
      ...draft.decisionSecurity, denialReasonRequired: false,
    } })).toBe(false);
    expect(same({ ...draft, decisionSecurity: {
      ...draft.decisionSecurity, verificationMode: 'EMAIL_PIN',
    } })).toBe(false);
    expect(same({ ...draft, decisionSecurity: {
      ...draft.decisionSecurity, linkTtlInput: '7200',
    } })).toBe(false);
  });

  it('fails closed for invalid numbers, missing versioned security and changed remote version', () => {
    expect(same({ ...draft, deadline: 'Infinity' })).toBe(false);
    expect(same({ ...draft, approvalsRequired: '2.5' })).toBe(false);
    expect(same({ ...draft, approvalsRequired: '51' })).toBe(false);
    expect(same({ ...draft, reminder: '0' })).toBe(false);
    expect(same({ ...draft, decisionSecurity: {
      ...draft.decisionSecurity, contractAvailable: false,
    } })).toBe(false);
    expect(same(draft, { ...saved, verification_mode: undefined })).toBe(false);
    expect(same(draft, { ...saved, version_id: 'profile-v3' })).toBe(false);
    expect(same(draft, { ...saved, active_version: 1 })).toBe(false);
    expect(same(draft, { ...saved, lifecycle: 'ACTIVE' })).toBe(false);
    expect(same(draft, null)).toBe(false);
    expect(same(draft, saved, null)).toBe(false);
  });

  it('blocks an already staged confirmation until the editor returns to saved state', () => {
    const intent: PolicyTransitionIntent = {
      policyId: saved.id, action: 'activate',
      versionId: saved.version_id, version: saved.version, activeVersion: null,
    };
    const html = renderToStaticMarkup(createElement(PolicyLifecycleConfirmation, {
      intent, policy: saved, busy: false, editorUnchanged: false,
      onCancel: () => undefined, onConfirm: () => undefined,
    }));
    expect(html).toContain('Policy editor has unsaved changes');
    expect(html).toContain('Confirm activation');
    expect(html).toContain('disabled');
    expect(html).not.toContain('<form');
    const warning = renderToStaticMarkup(createElement(PolicyUnsavedNotice, {
      onDiscard: () => undefined, busy: false,
    }));
    expect(warning).toContain('Unsaved policy changes');
    expect(warning).toContain('Discard edits');
    expect(warning).toContain('Save draft');
  });
});
