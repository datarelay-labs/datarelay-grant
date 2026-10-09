import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ConfigurationImportReadiness,
  type DryRunPreview,
} from '../../src/integration_diagnostics';

const preview: DryRunPreview = {
  schema_version: 1,
  preview_only: true,
  can_apply: false,
  summary: { integrations: 1, policies: 1, templates: 1 },
  conflicts: [{ kind: 'policy', name: 'External approval', reason: 'existing_identity_or_name' }],
  readiness: {
    automatic_apply_available: false,
    manual_review_only: true,
    required_actions: 3,
  },
  requirements: [
    {
      kind: 'integration',
      name: 'Source integration',
      reason: 'connection_and_credential_setup_required',
      operator_action: 'Review approved destination and scoped credentials independently.',
    },
    {
      kind: 'policy',
      name: 'External approval',
      reason: 'approver_mapping_required',
      operator_action: 'Map recipients and validate the approval plan before activation.',
    },
    {
      kind: 'template',
      name: 'Requested notification',
      reason: 'notification_content_required',
      operator_action: 'Review complete event message bodies and safe variables.',
    },
  ],
  warnings: ['No configuration changes made.'],
};

describe('Grant G9 migration readiness is a strictly non-applying plan', () => {
  it('renders per-category administrator prerequisites and honest summary', () => {
    const html = renderToStaticMarkup(
      createElement(ConfigurationImportReadiness, { preview }),
    );
    expect(html).toContain('data-testid="grant-configuration-readiness"');
    expect(html).toContain('Manual preparation required');
    expect(html).toContain('3 administrator preparation tasks');
    for (const value of [
      'Source integration',
      'External approval',
      'Requested notification',
      'Review approved destination and scoped credentials independently.',
      'Map recipients and validate the approval plan before activation.',
      'Review complete event message bodies and safe variables.',
    ]) {
      expect(html).toContain(value);
    }
    expect(html).toContain('Automatic import and activation are unavailable.');
    expect(html).not.toContain('>Apply configuration<');
    expect(html).not.toContain('>Activate imported policy<');
  });

  it('renders all untrusted metadata as escaped text and never as markup', () => {
    const html = renderToStaticMarkup(createElement(ConfigurationImportReadiness, {
      preview: {
        ...preview,
        requirements: [
          {
            kind: 'template', name: '<script>alert("invalid")</script>',
            reason: 'notification_content_required',
            operator_action: '<img src=x onerror=alert(1)>',
          },
        ],
        readiness: { ...preview.readiness, required_actions: 1 },
      },
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    // The event-handler-like text is escaped inside the displayed paragraph,
    // not emitted as an HTML attribute or an executable image element.
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('never promotes an empty metadata preview into an executable import', () => {
    const html = renderToStaticMarkup(createElement(ConfigurationImportReadiness, {
      preview: {
        ...preview,
        summary: { integrations: 0, policies: 0, templates: 0 },
        conflicts: [],
        requirements: [],
        readiness: { ...preview.readiness, required_actions: 0 },
      },
    }));
    expect(html).toContain('Nothing can be applied from this preview.');
    expect(html).toContain('not a restorable configuration');
    expect(html).not.toContain('>Import now<');
  });
});
