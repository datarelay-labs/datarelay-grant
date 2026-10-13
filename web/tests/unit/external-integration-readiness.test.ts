import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExternalIntegrationReadiness, type ExternalReadiness } from '../../src/external_integration_readiness';

const ready: ExternalReadiness = {
  schema_version: 1, scope: 'pre_live_configuration_only',
  active_policy:true, separate_producer:true, separate_executor:true,
  mixed_credentials:0, tenant_bound:null,
  native_execution_guard:'not_verified', receiver_readback:'not_applicable',
  independent_effect_readback:'not_verified', live_effect_authorized:false,
};

describe('Read-only external integration readiness', () => {
  it('distinguishes Grant credentials from actual execution evidence', () => {
    const html = renderToStaticMarkup(createElement(ExternalIntegrationReadiness,{status:ready,kind:'datarelay'}));
    expect(html).toContain('External integration readiness');
    expect(html).toContain('Configured separately');
    expect(html).toContain('Not verified');
    expect(html).toContain('No external execution is authorized by this view');
    expect(html).not.toContain('<button');
  });
  it('does not claim readiness when no backend projection is available', () => {
    const html = renderToStaticMarkup(createElement(ExternalIntegrationReadiness,{kind:'stellar'}));
    expect(html).toContain('Readiness unavailable');
    expect(html).not.toContain('Configured separately');
  });
  it('treats saved Stellar tenant as different from actual receiver readback', () => {
    const html = renderToStaticMarkup(createElement(ExternalIntegrationReadiness,{
      kind:'stellar', status:{...ready,tenant_bound:true,separate_executor:null,
        native_execution_guard:'not_applicable',receiver_readback:'not_verified'},
    }));
    expect(html).toContain('Tenant constraint present');
    expect(html).toContain('Receiver readback');
    expect(html).toContain('Not verified');
  });
});
