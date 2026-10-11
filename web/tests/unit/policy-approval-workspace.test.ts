import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PolicyApprovalSummary, policyApprovalRuleSummary } from '../../src/policy_approval_summary';
import { filterPolicyList, Profiles } from '../../src/policies';
import type { ApproverGroup, Profile } from '../../src/types';

const policy: Profile = {
  id: 'policy-production', version_id: 'v3', version: 3,
  name: 'Production change approvals', integration_id: 'control',
  approver_id: 'reviewer-one', approval_mode: 'N_OF_M',
  approver_group_id: 'group-ops', approvals_required: 2,
  action_kind: 'service.deploy', email_template_id: null,
  deadline_seconds: 3600, reminder_seconds: 600, max_reminders: 2,
  grant_seconds: 900, tenant_selector: '', environment: 'production',
  severity: '', risk_level: '', lifecycle: 'ACTIVE', enabled: true,
};
const group: ApproverGroup = {
  id: 'group-ops', name: 'Operations on call', enabled: true,
  member_ids: ['reviewer-one', 'reviewer-two', 'reviewer-three'],
  updated_at: 1769000000,
};
const names = [{ id: 'reviewer-one', displayName: 'Alex Reviewer' }];
const groups = [group];
function html(row: Profile, availableGroups: ApproverGroup[] = groups) {
  return renderToStaticMarkup(createElement(PolicyApprovalSummary, {
    policy: row, groups: availableGroups, approvers: names,
  }));
}

describe('P0 accepted Jira/StrongDM policy list group and approval-rule truth', () => {
  it('shows actual source group name, quorum and group size, not only the misleading first approver', () => {
    const text = html(policy);
    expect(text).toContain('Operations on call');
    expect(text).toContain('N_OF_M');
    expect(text).toContain('2 of 3 required');
    expect(text).not.toContain('Alex Reviewer');
    expect(text).not.toContain('1 approver');
  });

  it('differentiates any-one, all and sequential group policy requirements', () => {
    expect(html({ ...policy, approval_mode: 'ANY_ONE' })).toContain('Any one of 3');
    expect(html({ ...policy, approval_mode: 'ALL' })).toContain('All 3');
    expect(html({ ...policy, approval_mode: 'SEQUENTIAL' })).toContain('3 in group order');
  });

  it('renders the actual single approver without fabricating group membership', () => {
    const text = html({
      ...policy, approval_mode: 'SINGLE',
      approver_group_id: null, approvals_required: null,
    });
    expect(text).toContain('Single approver');
    expect(text).toContain('Alex Reviewer');
    expect(text).not.toContain('Operations on call');
  });

  it('labels unknown or disabled group as unavailable instead of claiming approvals are eligible', () => {
    expect(html(policy, [])).toContain('Group unavailable');
    expect(html(policy, [{ ...group, enabled: false }])).toContain('Group unavailable');
    expect(html(policy, [])).not.toContain('2 of 3 required');
  });

  it('does not invent quorum if an incomplete group policy omits it', () => {
    const value = policyApprovalRuleSummary({
      ...policy, approvals_required: null,
    }, groups, names);
    expect(value).toContain('Quorum unavailable');
    expect(value).not.toContain('2 of 3 required');
  });

  it('does not silently validate impossible quorum larger than available group', () => {
    const value = policyApprovalRuleSummary({
      ...policy, approvals_required: 4,
    }, groups, names);
    expect(value).toContain('Quorum unavailable');
    expect(value).not.toContain('4 of 3 required');
  });

  it('filters by visible approval group name without changing the API role scope or order', () => {
    const rows = [
      { ...policy, id: 'one' },
      { ...policy, id: 'single', approval_mode: 'SINGLE',
        approver_group_id: null, name: 'Other policy' },
    ];
    const filter = { search: '  OPERATIONS ON CALL  ', lifecycle: 'ALL' as const };
    const matches = filterPolicyList(rows, [{id:'control', name:'Control'}], names,
      filter, groups);
    expect(matches.map((p) => p.id)).toEqual(['one']);
    expect(rows.map((p) => p.id)).toEqual(['one','single']);
  });

  it('does not invent quorum seats from repeated or empty member identities',()=>{
    for(const member_ids of [
      ['reviewer-one','reviewer-one','reviewer-two'],
      ['reviewer-one','','reviewer-three'],
      ['reviewer-one','reviewer-two',' '],
    ]){
      const rendered=html(policy,[{...group,member_ids}]);
      expect(rendered).toContain('Group membership unavailable');
      expect(rendered).not.toContain('2 of 3 required');
    }
  });

  it('rejects ambiguous duplicated group identities in the displayed rule',()=>{
    const rendered=html(policy,[group,{...group,name:'Different group with same ID'}]);
    expect(rendered).toContain('Group unavailable');
    expect(rendered).not.toContain('Operations on call');
  });

  it('escapes untrusted group display name and preserves one read-only policy-row summary', () => {
    const escaped = html(policy, [{ ...group, name: '<img src=x onerror=alert(1)>' }]);
    expect(escaped).toContain('&lt;img');
    expect(escaped).not.toContain('<img src=x');
    expect(escaped).not.toContain('Approve</button>');
    expect(escaped).not.toContain('Execute</button>');
  });

  it('makes approval rule explicit on the real mounted policy list, not a generic approver column', () => {
    const output = renderToStaticMarkup(createElement(Profiles));
    expect(output).toContain('Approval rule');
    expect(output).toContain('Search policies');
    expect(output).toContain('approver group');
    expect(output).not.toContain('Auto approve');
  });
});
