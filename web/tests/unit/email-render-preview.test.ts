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

import {inertEmailDocument,simulatedEmailDocument} from '../../src/notification_preview';
it('rejects active or externally loaded elements before creating any preview iframe',()=>{
 const rejected=inertEmailDocument('<html><head></head><body><img src="https://example.invalid/asset"><script>window.bad=1</script></body></html>');
 expect(rejected).not.toContain('<img');expect(rejected).not.toContain('<script');
 expect(rejected).toContain('Active content is not permitted');
 const safe=inertEmailDocument('<html><head></head><body>&lt;img&gt; is escaped example wording.</body></html>');
 expect(safe).toContain('&lt;img&gt;');
});


it('images-off preview removes image elements before the inert resource gate',()=>{
 const value=simulatedEmailDocument('<html><head></head><body><img src="https://example.invalid/logo.png" alt="Logo"><p>Fallback brand</p></body></html>','images_off');
 expect(value).not.toContain('<img');expect(value).not.toContain('https://example.invalid/logo.png');expect(value).toContain('[Image hidden]');expect(value).toContain('Fallback brand');
});
