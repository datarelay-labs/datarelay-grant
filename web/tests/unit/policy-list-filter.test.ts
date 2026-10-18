import { describe, expect, it } from 'vitest';
import { filterPolicyList } from '../../src/policies';
import type { Profile } from '../../src/types';

function row(id: string, name: string, lifecycle: Profile['lifecycle'],
  actionKind: string, integrationId: string, approverId: string): Profile {
  return {
    id, name, lifecycle, action_kind: actionKind,
    integration_id: integrationId, approver_id: approverId,
    version_id: id + '-v1', version: 1,
    approval_mode: 'SINGLE', approver_group_id: null, approvals_required: null,
    email_template_id: null, deadline_seconds: 86400, reminder_seconds: 3600,
    max_reminders: 3, grant_seconds: 900, tenant_selector: '',
    environment: '', severity: '', risk_level: '', enabled: lifecycle === 'ACTIVE',
  };
}
const rows = [
  row('a', 'Payroll Deploy', 'ACTIVE', 'deploy.execute', 'i1', 'u1'),
  row('b', 'Asset access', 'DRAFT', 'access.request', 'i2', 'u2'),
  row('c', 'Payroll Review', 'TESTING', 'payroll.review', 'i1', 'u2'),
  row('d', 'Old payroll', 'DISABLED', 'archive.retire', 'i2', 'u1'),
];
const integrations = [
  { id: 'i1', name: 'Control Product' },
  { id: 'i2', name: 'Stellar Security' },
];
const approvers = [
  { id: 'u1', displayName: 'Alex Approval' },
  { id: 'u2', displayName: 'Blair Reviewer' },
];

describe('G0 policy list discovery controls', () => {
  it('preserves backend order for all, casefolded names and action-kind searches', () => {
    expect(filterPolicyList(rows, integrations, approvers, { search: '', lifecycle: 'ALL' }))
      .toEqual(rows);
    expect(filterPolicyList(rows, integrations, approvers, { search: '  PAYroll  ', lifecycle: 'ALL' })
      .map((r) => r.id)).toEqual(['a', 'c', 'd']);
    expect(filterPolicyList(rows, integrations, approvers, { search: 'ACCESS.REQUEST', lifecycle: 'ALL' })
      .map((r) => r.id)).toEqual(['b']);
  });

  it('searches displayed integration/approver names then applies lifecycle', () => {
    expect(filterPolicyList(rows, integrations, approvers, { search: ' STELLAR ', lifecycle: 'ALL' })
      .map((r) => r.id)).toEqual(['b', 'd']);
    expect(filterPolicyList(rows, integrations, approvers, { search: 'blair', lifecycle: 'TESTING' })
      .map((r) => r.id)).toEqual(['c']);
    expect(filterPolicyList(rows, integrations, approvers, { search: '', lifecycle: 'DISABLED' })
      .map((r) => r.id)).toEqual(['d']);
    expect(filterPolicyList(rows, integrations, approvers, { search: 'nomatch', lifecycle: 'ALL' }))
      .toEqual([]);
  });

  it('fails closed on unknown lifecycle or overlong input, without mutating response rows', () => {
    const before = structuredClone(rows);
    expect(filterPolicyList(rows, integrations, approvers, { search: '', lifecycle: 'ANYTHING' as 'ALL' }))
      .toEqual([]);
    expect(filterPolicyList(rows, integrations, approvers, { search: 'a'.repeat(200), lifecycle: 'ALL' }))
      .toEqual([]);
    expect(rows).toEqual(before);
  });
});
