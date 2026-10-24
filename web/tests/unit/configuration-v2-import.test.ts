import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ConfigurationPortabilityV2,
  ConfigurationV2Preview,
  ImportedDraftsNotice,
} from '../../src/configuration_portability_v2';

describe('Grant v2 configuration imports require deliberate user review', () => {
  it('shows source-sensitive warning and does not render an unchecked Apply button', () => {
    const html = renderToStaticMarkup(
      createElement(ConfigurationPortabilityV2, { integrations: [] }),
    );
    expect(html).toContain('Version-2 configuration portability');
    expect(html).toContain('Export complete v2 JSON');
    expect(html).toContain('Open a v2 JSON file');
    expect(html).toContain('Administrator review required');
    expect(html).toContain('disabled Drafts');
    expect(html).not.toContain('Create reviewed Drafts only');
    expect(html).not.toContain('Activate imported policy');
    expect(html).not.toContain('Apply configuration');
  });

  it('renders human-readable post-import receipt for one and multiple Draft records', () => {
    const receipt = (policies: number, templates: number) =>
      renderToStaticMarkup(createElement(ImportedDraftsNotice, {
        imported: {
          imported: { policies, templates },
          policy_ids: [], template_ids: [],
          all_policies_draft: true as const, activated: false as const,
        },
      }));
    const one = receipt(1, 1);
    expect(one).toContain('Created 1 Draft policy and 1 notification set.');
    expect(one).toContain('No policy was activated.');
    expect(one).not.toContain('1notification');
    const several = receipt(2, 3);
    expect(several).toContain('Created 2 Draft policies and 3 notification sets.');
    expect(several).not.toContain('Activate imported policy');
  });

  it('clearly distinguishes reviewable Drafts from blocked mappings', () => {
    const base = {
      schema_version: 2 as const,
      preview_only: true as const,
      can_import_drafts: true,
      will_activate: false as const,
      preview_digest: 'a'.repeat(64),
      summary: { integrations: 1, policies: 1, templates: 1 },
      conflicts: [],
      warnings: [],
    };
    const positive = renderToStaticMarkup(
      createElement(ConfigurationV2Preview, { preview: base }),
    );
    expect(positive).toContain('Ready for Draft-only import');
    expect(positive).toContain('stays DISABLED / DRAFT');
    expect(positive).not.toContain('Activate');
    const blocked = renderToStaticMarkup(
      createElement(ConfigurationV2Preview, {
        preview: {
          ...base, can_import_drafts: false,
          conflicts: [{ kind: 'policy', name: '<script>alert(1)</script>', reason: 'name_collision' }],
        },
      }),
    );
    expect(blocked).toContain('Fix mappings or collisions');
    expect(blocked).toContain('&lt;script&gt;');
    expect(blocked).not.toContain('<script>');
  });
});
