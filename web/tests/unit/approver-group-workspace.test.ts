import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Approvers, ApproverGroupDirectory, filterApproverGroups, approverGroupReconciliationCopy } from '../../src/approvers';
import type { ApproverGroup } from '../../src/types';

const onCall = () => undefined;
const groups: ApproverGroup[] = [
  { id: 'group-a', name: 'Production Reviewers',
    member_ids: ['one', 'two'], enabled: true, updated_at: 1_781_132_213 },
  { id: 'group-b', name: 'Incident Responders',
    member_ids: ['three'], enabled: false, updated_at: 1_781_132_200 },
];

function directory(items = groups, search = '') {
  return renderToStaticMarkup(createElement(ApproverGroupDirectory, {
    groups: items, search, busy: false,
    onSearchChange: onCall, onOpen: onCall, onCreate: onCall,
  }));
}

describe('P0 competitor-derived approver group list-to-detail administration', () => {
  it('distinguishes a verified saved group from an uncertain in-flight POST', () => {
    const confirmed = approverGroupReconciliationCopy(true, false);
    expect(confirmed.title).toContain('confirmed');
    expect(confirmed.message).toContain('server confirmed');
    expect(confirmed.message).toContain('Refresh saved groups');
    expect(confirmed.message).not.toContain('may already have succeeded');
    expect(confirmed.message).not.toContain('was submitted');
    const uncertain = approverGroupReconciliationCopy(false, true);
    expect(uncertain.title).toContain('Reconcile');
    expect(uncertain.message).toContain('may already have succeeded');
    const submitted = approverGroupReconciliationCopy(false, false);
    expect(submitted.message).toContain('was submitted');
    expect(submitted.message).not.toContain('server confirmed');
  });

  it('does not present an unrelated new-group editor on the default group list', () => {
    const html = renderToStaticMarkup(createElement(Approvers));
    expect(html).toContain('Approver groups');
    expect(html).toContain('Search approver groups');
    expect(html).toContain('Create approver group');
    expect(html).not.toContain('Group name</label>');
    expect(html).not.toContain('<legend>Members</legend>');
  });

  it('lists current group name, membership count, enablement and update time before editing', () => {
    const html = directory();
    expect(html).toContain('Production Reviewers');
    expect(html).toContain('Incident Responders');
    expect(html).toContain('2 members');
    expect(html).toContain('1 member');
    expect(html).toContain('Enabled');
    expect(html).toContain('Disabled');
    expect(html).toContain('Updated');
    expect(html).toContain('Review group');
    expect(html).not.toContain('>group-a</td>');
  });

  it('filters groups by name and ignores case without mutating source rows', () => {
    const ids = filterApproverGroups(groups, '  PROD  ').map((row) => row.id);
    expect(ids).toEqual(['group-a']);
    expect(groups.map((row) => row.id)).toEqual(['group-a', 'group-b']);
  });

  it('sorts visible groups by name for fast keyboard/visual scanning', () => {
    expect(filterApproverGroups(groups, '').map((row) => row.id))
      .toEqual(['group-b', 'group-a']);
  });

  it('has a clear empty state and does not fabricate unsupported group behavior', () => {
    const html = directory([], '');
    expect(html).toContain('No approver groups');
    expect(html).not.toContain('Auto approve');
    expect(html).not.toContain('Provision access');
    const notFound = directory(groups, 'not-a-group');
    expect(notFound).toContain('No groups match');
  });

  it('renders untrusted group names safely, without exposed save/execute actions in the directory', () => {
    const html = directory([{
      ...groups[0]!, name: '<script>alert(1)</script>',
    }]);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Save group</button>');
    expect(html).not.toContain('Execute</button>');
  });
});
