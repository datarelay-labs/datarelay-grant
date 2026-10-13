import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {AdminFirstRunSetup} from '../../src/admin_first_run_setup';
import {Profiles} from '../../src/policies';

function render(props:Partial<Parameters<typeof AdminFirstRunSetup>[0]>={}) {
 return renderToStaticMarkup(createElement(AdminFirstRunSetup,{
   loaded:true, registeredConnections:0,enabledAccounts:0,savedPolicies:0,
   activePolicies:0,onCreatePolicy:vi.fn(),...props,
 }));
}

describe('First-run Grant administrator guided setup without new permission',()=>{
 it('shows the four nonexecuting prerequisite steps with actionable destinations',()=>{
  const html=render();
  for(const phrase of ['Set up your first approval workflow','Register a connection',
   'Choose approvers','Create a Draft policy','Test and activate',
   'Open integrations','Manage approvers','Create draft policy','View policy list',
   'No business action is executed']) expect(html).toContain(phrase);
  expect(html).toContain('href="/integrations"');
  expect(html).toContain('href="/approvers"');
  expect(html).toContain('href="#grant-policy-list"');
  expect(html).not.toContain('Automatically activate');
  expect(html).not.toContain('Execute now');
 });
 it('does not invent successful connection or approval readiness from record counts',()=>{
  const html=render({registeredConnections:2,enabledAccounts:3,savedPolicies:4,activePolicies:1});
  for(const phrase of ['2 registered records','3 enabled accounts',
   '4 saved policies','1 active policy','not a verified connection']) expect(html).toContain(phrase);
  expect(html).not.toContain('All integrations verified');
  expect(html).not.toContain('External action completed');
 });
 it('does not claim zero saved records while account and policy data are loading',()=>{
  const html=render({loaded:false});
  expect(html).toContain('Checking saved setup');
  expect(html).not.toContain('0 registered records');
  expect(html).not.toContain('0 active policies');
 });
 it('is mounted inside the actual Approval Policies list, preserving original save lifecycle',()=>{
  const html=renderToStaticMarkup(createElement(Profiles));
  expect(html).toContain('Set up your first approval workflow');
  expect(html).toContain('Create policy');
  expect(html).toContain('Policies');
  expect(html).not.toContain('Execute</button>');
 });
});

describe('Pre-E2E administrator first-read truth', () => {
  it('does not display a zero-policy conclusion before the administrator data loads', () => {
    const html=renderToStaticMarkup(createElement(Profiles));
    expect(html).toContain('Loading approval policies');
    expect(html).not.toContain('No approval policies configured.');
    expect(html).not.toContain('Showing 0 of 0 policies');
  });
  it('prevents opening a new policy editor before its saved prerequisites are loaded', () => {
    const html=renderToStaticMarkup(createElement(Profiles));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Create policy<\/button>/);
    const guide=render({loaded:false});
    expect(guide).toMatch(/<button[^>]*disabled[^>]*>Create draft policy/);
    expect(guide).not.toContain('All integrations verified');
  });
});
