import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminWorkflowSetup, projectAdminSetupFacts } from '../../src/admin_workflow_setup';

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
      'A saved draft is not published',
      'Create a Draft policy',
      'Test and activate',
      'Create the first request',
      'Checking saved setup',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="/system?view=accounts"');
    expect(html).toContain('href="/profiles"');
    expect(html).toContain('Open New request');
    expect(html).not.toContain('Preview requester flow');
    expect(html).not.toContain('0 registered records');
    expect(html).not.toContain('0 active policies');
    expect(html).not.toContain('Execute now');
  });
  it('projects current saved readiness without claiming destination verification or publication from drafts', () => {
    const facts=projectAdminSetupFacts({
      accounts:[{status:'enabled'},{status:'disabled'},{status:'enabled'}],
      groups:[{enabled:true},{enabled:false}],
      integrations:[{id:'registered-1'}],
      templates:[
        {enabled:true,published_revision:2},
        {enabled:true,published_revision:null},
        {enabled:false,published_revision:1},
      ],
      policies:[
        {lifecycle:'ACTIVE',active_version:null},
        {lifecycle:'DRAFT',active_version:2},
        {lifecycle:'DRAFT',active_version:null},
      ],
    });
    expect(facts).toEqual({
      enabledAccounts:2,enabledApproverGroups:1,registeredConnections:1,
      savedTemplateSets:3,publishedTemplateSets:1,savedPolicies:3,activePolicies:2,
    });
  });
});
