import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  NativeIngressReadback, NativeLifecycleReadback,
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
  it('PF-04 lifecycle displays persisted recovery pause and absent backup proof without exposing mutation', () => {
    for (const [paused, expected] of [
      [true, 'Active'], [false, 'Not active'], [null, 'Unavailable'],
    ] as const) {
      const html=renderToStaticMarkup(createElement(NativeLifecycleReadback,{
        status:{ ...source, backup_recovery:{...source.backup_recovery,recovery_paused:paused} },
      }));
      expect(html).toContain('Persisted recovery and retention evidence');
      expect(html).toContain('Registered backup evidence');
      expect(html).toContain('Independently verified restore drill');
      expect(html).toContain('Not verified');
      expect(html).toContain('Record deletion by Grant');
      expect(html).toContain('Disabled');
      expect(html).toContain('Recovery pause');
      expect(html).toContain(expected);
      expect(html).not.toContain('<button');
      expect(html).not.toContain('Confirm restore');
      expect(html).not.toContain('Apply retention');
    }
  });

  it('PF-04 network does not mistake the service URL for proven host policy', () => {
    const html=renderToStaticMarkup(createElement(NativeIngressReadback,{status:source}));
    expect(html).toContain('Management ingress evidence');
    expect(html).toContain('Web management CIDR allowlist');
    expect(html).toContain('Not configured');
    expect(html).toContain('Host SSH enforcement');
    expect(html).toContain('Not verified');
    expect(html).toContain('Management access changes by Grant');
    expect(html).toContain('Not authorized');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Apply SSH');
    expect(html).not.toContain('Confirmed secure');
  });

  it('PF-04 missing or corrupt backend evidence fails closed on network and lifecycle', () => {
    for (const data of [
      null,
      {...source,allows_execution:true},
      {...source,backup_recovery:{...source.backup_recovery,restore_authorized:true}},
      {...source,management_ingress:{...source.management_ingress,host_ssh_enforcement:'verified'}},
    ]) {
      const status=data as OperationalSecurityReadiness | null;
      const lifecycle=renderToStaticMarkup(createElement(NativeLifecycleReadback,{status}));
      const network=renderToStaticMarkup(createElement(NativeIngressReadback,{status}));
      expect(lifecycle).toContain('Lifecycle evidence unavailable');
      expect(network).toContain('Management ingress evidence unavailable');
      expect(lifecycle).not.toContain('Persisted recovery and retention evidence');
      expect(network).not.toContain('Host SSH enforcement</dt>');
      expect(lifecycle+network).not.toContain('<button');
    }
  });

});
