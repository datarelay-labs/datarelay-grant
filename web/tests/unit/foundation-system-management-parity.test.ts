import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {GrantConfigurationPortabilityTask,readAdministrationInitialView} from '../../src/administration';
import {readIntegrationsInitialView} from '../../src/integrations';

describe('Foundation System Management existing Grant capability wiring',()=>{
  it('offers a real, administrator-scoped route to existing configuration export and Draft-only import',()=>{
    const html=renderToStaticMarkup(createElement(GrantConfigurationPortabilityTask));
    expect(html).toContain('href="/integrations?view=diagnostics"');
    expect(html).toContain('Open configuration portability');
    expect(html).toContain('Draft-only');
    expect(html).not.toContain('Restore database');
    expect(html).not.toContain('Confirm restore');
    expect(html).not.toContain('Execute now');
  });


  it('deep-links only the allowlisted User Management task from administrator setup',()=>{
    expect(readAdministrationInitialView('?view=accounts')).toBe('accounts');
    for(const input of ['', '?view=health', '?view=accounts%00', '?other=accounts',
      '?view=accounts&view=health', '?view=accounts&other=x']){
      expect(readAdministrationInitialView(input)).toBe(null);
    }
  });

  it('opens only the safe existing diagnostic tab from a canonical allowlisted query',()=>{
    expect(readIntegrationsInitialView('?view=diagnostics')).toBe('diagnostics');
    for(const input of ['','?view=connections','?view=create','?view=security',
      '?view=diagnostics%00','?other=diagnostics','?view=diagnostics&view=create']){
      expect(readIntegrationsInitialView(input)).toBe('connections');
    }
  });
});
