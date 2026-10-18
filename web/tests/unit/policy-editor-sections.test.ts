import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PolicyEditorJumpLinks, PolicyEditorSection } from '../../src/policies';

const sections = [
  ['policy-general', 'General'],
  ['policy-applies-to', 'Applies To'],
  ['policy-approval', 'Approval'],
  ['policy-email-decisions', 'Verification'],
  ['policy-timing', 'Timing'],
  ['policy-execution-grant', 'Execution Grant'],
  ['policy-notifications', 'Notifications'],
] as const;

describe('G0 task-first approval policy editor section navigation', () => {
  it('renders the canonical section order without adding form-submit buttons', () => {
    const html = renderToStaticMarkup(createElement(PolicyEditorJumpLinks));
    expect(html).toContain('aria-label="Policy editor sections"');
    expect((html.match(/type="button"/g) ?? []).length).toBe(sections.length);
    let previous = -1;
    for (const [id, title] of sections) {
      const label = 'data-jump-to="' + id + '"';
      const pos = html.indexOf(label);
      expect(pos).toBeGreaterThan(previous);
      expect(html).toContain(title);
      previous = pos;
    }
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain('Activate policy');
    expect(html).not.toContain('Disable active');
  });

  it('gives every field group an accessible heading and preserves form children', () => {
    for (const [id, title] of sections.filter(([id]) => id !== 'policy-email-decisions')) {
      const html = renderToStaticMarkup(createElement(
        PolicyEditorSection,
        { id, title, description: 'Section settings' },
        createElement('input', { name: 'source-field', required: true }),
      ));
      expect(html).toContain('aria-labelledby="' + id + '"');
      expect(html).toContain('id="' + id + '"');
      expect(html).toContain('>' + title + '</h3>');
      expect(html).toContain('name="source-field"');
      expect(html).toContain('required=""');
    }
  });

  it('fails closed for an unknown editor section identifier', () => {
    expect(() => renderToStaticMarkup(createElement(
      PolicyEditorSection,
      { id: 'unknown' as 'policy-general', title: 'Unknown', description: '' },
    ))).toThrow('POLICY_EDITOR_SECTION_UNRECOGNIZED');
  });
});
