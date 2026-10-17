import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApproverGroupDirectory, filterApproverGroups } from '../../src/approvers';
import type { ApproverGroup } from '../../src/types';

const groups: ApproverGroup[] = [
  { id: 'enabled-a', name: 'Emergency reviewers', enabled: true, member_ids: ['a'], updated_at: 100 },
  { id: 'disabled-b', name: 'Retired reviewers', enabled: false, member_ids: ['b'], updated_at: 110 },
  { id: 'missing-c', name: 'Production reviewers', enabled: true, member_ids: ['missing'], updated_at: 120 },
  { id: 'duplicates-d', name: 'Review team duplicates', enabled: true, member_ids: ['a','a'], updated_at: 130 },
];
const accounts = [
  { id: 'a', status: 'enabled', displayName: 'Alice' },
  { id: 'b', status: 'disabled', displayName: 'Bob' },
];
const ids = (view: 'all'|'enabled'|'disabled'|'attention'|'unverified', term = '', inventory: typeof accounts|null = accounts) =>
  filterApproverGroups(groups, term, view, inventory).map(row => row.id);
const noop = () => undefined;
function markup(view: 'all'|'enabled'|'disabled'|'attention'|'unverified', inventory: typeof accounts|null = accounts, loaded = true) {
  return renderToStaticMarkup(createElement(ApproverGroupDirectory, {
    groups, accounts: inventory, loaded, search: '', busy: false,
    view, onViewChange: noop, onSearchChange: noop, onOpen: noop, onCreate: noop,
  }));
}

describe('P0-2F Keycloak-inspired saved-group status and member-truth facets', () => {
  it('filters enabled/disabled by saved group status, never by membership count', () => {
    expect(ids('enabled')).toEqual(['enabled-a', 'missing-c', 'duplicates-d']);
    expect(ids('disabled')).toEqual(['disabled-b']);
    expect(ids('all')).toEqual(['enabled-a', 'missing-c', 'disabled-b', 'duplicates-d']);
  });
  it('groups only known member issues under attention, with no fabricated live approval eligibility', () => {
    expect(ids('attention')).toEqual(['missing-c', 'duplicates-d']);
    expect(ids('attention', 'PROD')).toEqual(['missing-c']);
    expect(ids('attention', 'emergency')).toEqual([]);
  });
  it('when account evidence is missing, never treats an enabled group as verified', () => {
    expect(ids('unverified', '', null)).toEqual(['enabled-a', 'missing-c']);
    expect(ids('attention', '', null)).toEqual(['duplicates-d']);
    expect(ids('unverified', '', accounts)).toEqual([]);
    expect(ids('disabled', '', null)).toEqual(['disabled-b']);
  });
  it('combines exact source-backed facet with the existing case-insensitive name query', () => {
    expect(ids('enabled', '  review  ')).toEqual(['enabled-a', 'missing-c', 'duplicates-d']);
    expect(ids('disabled', 'review')).toEqual(['disabled-b']);
    expect(ids('all', 'unknown')).toEqual([]);
    expect(groups.map(row => row.id)).toEqual(['enabled-a','disabled-b','missing-c','duplicates-d']);
  });
  it('renders labeled, native keyboard-operable facet and filtered count on mounted directory', () => {
    const html = markup('attention');
    expect(html).toContain('Filter saved groups');
    expect(html).toContain('Member account review required');
    expect(html).toContain('Account status unverified');
    expect(html).toContain('2 of 4 groups');
    expect(html).toContain('Production reviewers');
    expect(html).toContain('Review team duplicates');
    expect(html).not.toContain('Emergency reviewers</td>');
    expect(html).not.toContain('Retired reviewers</td>');
    expect(html).not.toContain('Approve</button>');
    expect(html).not.toContain('Execute</button>');
  });
  it('does not invent an empty list or verified status before the current role-scoped GET', () => {
    const html=markup('attention',null,false);
    expect(html).toContain('Loading current saved approver groups');
    expect(html).not.toContain('No groups match your search');
    expect(html).not.toContain('0 of 4 groups');
    expect(html).not.toContain('currently enabled accounts');
  });
  it('selecting unavailable coverage never hides all saved groups or creates extra authority', () => {
    const html=markup('unverified',null);
    expect(html).toContain('2 of 4 groups');
    expect(html).toContain('Account status not checked');
    expect(html).not.toContain('Review team duplicates</td>');
    expect(html).not.toContain('Save group</button>');
  });
});
