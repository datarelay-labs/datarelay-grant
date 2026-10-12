import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdministrationHub, ProductShell } from '@datarelay-labs/foundation';
import {
  grantRc41AccountDiscovery,
  grantRc41AdministrationDiscovery,
  grantRc41NavigationDiscovery,
  grantRc41SessionDiscovery,
} from '../../src/foundation_rc41';
import { productConfig } from '../../src/foundation.config';
import type { User } from '../../src/types';

const member: User = {
  id: 'member-rc41', username: 'reviewer', email: 'reviewer@example.invalid',
  role: 'member', mfa_enabled: false,
};

it('enables capability-filtered latest Foundation navigation without granting administrator routes', () => {
  const config = productConfig(member);
  const html = renderToStaticMarkup(createElement(ProductShell, {
    ...grantRc41NavigationDiscovery, product: config.product,
    navigation: config.navigation, capabilities: config.capabilities,
    currentPath: '/approvals', pageTitle: 'My approvals',
    onNavigate: () => undefined,
    children: createElement('span', null, 'User workspace'),
  }));
  expect(html).toContain('Search product navigation');
  expect(html).toContain('My approvals');
  expect(html).not.toContain('Audit explorer');
  expect(html).not.toContain('Approval policies');
});

describe('opt-in Foundation RC41 product-owned loaded-list discovery', () => {
  it('uses hub search but keeps one global Ctrl/Cmd+K keyboard shortcut owner', () => {
    expect(grantRc41AdministrationDiscovery).toEqual({
      searchable: true, keyboardSearchShortcut: false,
    });
    const html = renderToStaticMarkup(createElement(AdministrationHub, {
      ...grantRc41AdministrationDiscovery, productId: 'grant', tasks: [],
    }));
    expect(html).toContain('Find administration tasks');
  });

  it('only opts in to locally loaded account and session read-only filters', () => {
    expect(grantRc41AccountDiscovery).toEqual({
      filterLoadedAccountFacets: true,
      sortLoadedAccounts: true,
      resetLoadedAccountFilters: true,
    });
    expect(grantRc41SessionDiscovery).toEqual({
      filterLoadedSessions: true, filterLoadedSessionStates: true,
    });
  });
});
