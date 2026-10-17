import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminWorkflowSetup } from '../../src/admin_workflow_setup';

describe('First-time administrator workflow sequence', () => {
  it('requires publishing custom email before testing an approval policy', () => {
    const html = renderToStaticMarkup(createElement(AdminWorkflowSetup, { navigate: vi.fn() }));
    for (const text of [
      'Configure once, reuse on every request',
      'Create approver accounts',
      'Create approver groups',
      'Register integrations',
      'Create notification templates',
      'Review &amp; publish',
      'Confirm publication',
      'Saved drafts alone cannot pass policy testing',
      'Create approval policies',
      'Test and activate',
      'Create the first request',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="/system?view=accounts"');
    expect(html).not.toContain('Execute now');
  });
});
