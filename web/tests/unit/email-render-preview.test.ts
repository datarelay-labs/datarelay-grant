import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NotificationRenderedPreview} from '../../src/notification_preview';

describe('ET-1 final structured HTML preview',()=>{
 it('embeds only isolated inert server output, not reconstructed text',()=>{
  const output=renderToStaticMarkup(createElement(NotificationRenderedPreview,{rendered:{
   subject:'Synthetic approval',body:'Plain text',html:'<!doctype html><html><head></head><body>View Details</body></html>',
  }}));
  expect(output).toContain('sandbox=""');expect(output).toContain('referrerPolicy="no-referrer"');
  expect(output).toContain('Content-Security-Policy');expect(output).toContain('default-src');
  expect(output).toContain('View Details');expect(output).not.toContain('allow-same-origin');
  expect(output).toContain('320px');expect(output).toContain('Plain text');
 });
});
