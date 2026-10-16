/** Grant-specific, opt-in shared Foundation RC50 presentation capabilities.
 *
 * They use already authorized product-provided routes/tasks/rows only.
 * This never grants backend privileges or makes new Control/Stellar effects.
 */
export const grantRc50NavigationDiscovery = {
  quickNavigation: true,
  breadcrumbs: true,
} as const;

export const grantRc50AdministrationDiscovery = {
  searchable: true,
  // The ProductShell exclusively owns the global Ctrl/Cmd+K shortcut.
  keyboardSearchShortcut: false,
} as const;

export const grantRc50AccountDiscovery = {
  filterLoadedAccountFacets: true,
  sortLoadedAccounts: true,
  resetLoadedAccountFilters: true,
} as const;

export const grantRc50SessionDiscovery = {
  filterLoadedSessions: true,
  filterLoadedSessionStates: true,
} as const;
