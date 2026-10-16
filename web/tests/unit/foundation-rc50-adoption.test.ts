import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdministrationHub, ProductShell } from '@datarelay-labs/foundation';
import {
  grantRc50AccountDiscovery,
  grantRc50AdministrationDiscovery,
  grantRc50NavigationDiscovery,
  grantRc50SessionDiscovery,
} from '../../src/foundation_rc50';
import { productConfig } from '../../src/foundation.config';
import type { User } from '../../src/types';

const member: User = {
  id: 'member-rc50', username: 'reviewer', email: 'reviewer@example.invalid',
  role: 'member', mfa_enabled: false,
};

it('enables capability-filtered latest Foundation navigation without granting administrator routes', () => {
  const config = productConfig(member);
  const html = renderToStaticMarkup(createElement(ProductShell, {
    ...grantRc50NavigationDiscovery, product: config.product,
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

describe('opt-in Foundation RC50 product-owned loaded-list discovery', () => {
  it('uses hub search but keeps one global Ctrl/Cmd+K keyboard shortcut owner', () => {
    expect(grantRc50AdministrationDiscovery).toEqual({
      searchable: true, keyboardSearchShortcut: false,
    });
    const html = renderToStaticMarkup(createElement(AdministrationHub, {
      ...grantRc50AdministrationDiscovery, productId: 'grant', tasks: [],
    }));
    expect(html).toContain('Find administration tasks');
  });

  it('only opts in to locally loaded account and session read-only filters', () => {
    expect(grantRc50AccountDiscovery).toEqual({
      filterLoadedAccountFacets: true,
      sortLoadedAccounts: true,
      resetLoadedAccountFilters: true,
    });
    expect(grantRc50SessionDiscovery).toEqual({
      filterLoadedSessions: true, filterLoadedSessionStates: true,
    });
  });
});
