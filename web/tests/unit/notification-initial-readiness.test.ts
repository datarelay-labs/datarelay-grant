import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {Notifications} from '../../src/notifications';

describe('Pre-E2E first-run notification inventory',()=>{
  it('does not claim no template sets until the scoped administrator GET completes',()=>{
    const html=renderToStaticMarkup(createElement(Notifications));
    expect(html).toContain('Loading notification template sets');
    expect(html).not.toContain('No custom template sets configured.');
  });
  it('does not open a default-based template editor before reading saved templates',()=>{
    const html=renderToStaticMarkup(createElement(Notifications));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Create template set<\/button>/);
    expect(html).not.toContain('Template saved.');
  });
});
