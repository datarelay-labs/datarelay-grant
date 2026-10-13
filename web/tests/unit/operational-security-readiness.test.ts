import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  OperationalSecurityReadinessReadout, validOperationalSecurityReadiness,
  type OperationalSecurityReadiness,
} from '../../src/operational_security_readiness';

const source: OperationalSecurityReadiness = {
  schema_version: 1, scope: 'stored_grant_facts_only', allows_execution: false,
  audit_forwarding: { state: 'disabled' },
  backup_recovery: {
    registered_evidence: 'unavailable', restore_drill: 'not_verified',
    recovery_paused: false, restore_authorized: false,
  },
  retention: { policy: 'not_configured', approval_record_deletion_enabled: false },
  secret_lifecycle: {
    rotation_policy: 'not_configured',active_integration_tokens: 3,
    revoked_integration_tokens: 2, material_exposed: false,
    rotation_authorized: false,
  },
  management_ingress: {
    web_allowlist: 'not_configured', host_ssh_enforcement: 'not_verified',
    access_rule_change_authorized: false,
  },
};

describe('Grant read-only M5 Foundation operational evidence', () => {
  it('only shows current product facts, never real recovery, audit or key authority', () => {
    const html = renderToStaticMarkup(createElement(OperationalSecurityReadinessReadout,{
      status: source,
    }));
    expect(html).toContain('Grant operating safeguards');
    expect(html).toContain('3 enabled');
    expect(html).toContain('2 revoked');
    expect(html).toContain('Product security policies not installed');
    expect(html).toContain('Forwarding: disabled');
    expect(html).toContain('No backup evidence');
    expect(html).toContain('No secret lifecycle summaries');
    expect(html).not.toContain('Confirm restore');
    expect(html).not.toContain('Test audit forwarding');
    expect(html).not.toContain('Rotate now');
  });
  it('rejects missing or manipulated product projections instead of defaulting to healthy', () => {
    for(const status of [
      null,
      { ...source, allows_execution: true },
      { ...source, secret_lifecycle: { ...source.secret_lifecycle, active_integration_tokens: -1 } },
      { ...source, backup_recovery: { ...source.backup_recovery, restore_authorized: true } },
      { ...source, management_ingress: { ...source.management_ingress,
        host_ssh_enforcement: 'verified' } },
    ]) {
      expect(validOperationalSecurityReadiness(status)).toBe(false);
      const html=renderToStaticMarkup(createElement(OperationalSecurityReadinessReadout,{
        status:status as OperationalSecurityReadiness | null,
      }));
      expect(html).toContain('Security readiness unavailable');
      expect(html).not.toContain('Forwarding: configured');
    }
  });
  it('renders a missing recovery marker as unavailable, never unpaused success', () => {
    const html=renderToStaticMarkup(createElement(OperationalSecurityReadinessReadout,{
      status:{...source, backup_recovery:{...source.backup_recovery,recovery_paused:null}},
    }));
    expect(html).toContain('Unavailable');
    expect(html).not.toContain('Recovered successfully');
  });
});
