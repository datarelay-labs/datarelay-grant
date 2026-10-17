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
import {sanitizeEmbeddedLogos} from '../../src/email_logo_safety';
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


it('permits only bounded normalized PNG data images and keeps external images inert',()=>{
 const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAKCAYAAACuaZ5oAAAAHUlEQVR42mPkkjP6z0BDwMRAYzBqwagFoxYwMAAAQFsBbQukwzoAAAAASUVORK5CYII=';
 const allowed=inertEmailDocument('<html><head></head><body><img alt="DataRelay Grant" src="'+data+'" style="display:block" width="160" height="auto"><p>DataRelay Grant</p></body></html>');
 expect(allowed).toContain('<img');expect(allowed).toContain("img-src data:");expect(allowed).toContain('DataRelay Grant');
 const rejected=inertEmailDocument('<html><head></head><body><img src="https://example.invalid/logo.png" alt="Brand"></body></html>');
 expect(rejected).not.toContain('https://example.invalid/logo.png');expect(rejected).toContain('Active content is not permitted');
});


it('allows only one bounded normalized data PNG logo in the inert iframe',()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8s7WQAAAABJRU5ErkJggg==';
 const tag='<img alt="Grant" src="data:image/png;base64,'+png+'" style="anything" width="160" height="auto">';
 const safe=sanitizeEmbeddedLogos('<p>DataRelay Grant</p>'+tag);expect(safe).toContain('data:image/png;base64,');expect(safe).not.toContain('anything');
 expect(inertEmailDocument('<html><head></head><body>'+tag+'</body></html>')).toContain("img-src data:");
 for(const bad of ['<img src="https://example.invalid/a.png" width="160" height="auto">',tag+tag,tag.replace('width="160"','width="999"'),tag.replace('>',' onerror="x">')])expect(sanitizeEmbeddedLogos(bad)).toBeNull();
});
