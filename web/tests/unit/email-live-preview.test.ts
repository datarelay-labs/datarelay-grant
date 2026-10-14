import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createPreviewSequence} from '../../src/email_live_preview';

describe('ET-4 synthetic unsaved preview sequencing',()=>{
 it('drops delayed responses after newer edits or unmount',()=>{
  const gate=createPreviewSequence();const old=gate.next();const current=gate.next();
  expect(gate.current(old)).toBe(false);expect(gate.current(current)).toBe(true);
  gate.invalidate();expect(gate.current(current)).toBe(false);
 });
 it('uses only the readonly draft endpoint with fixed sample data and cleanup',()=>{
  const source=readFileSync(new URL('../../src/email_live_preview.tsx',import.meta.url),'utf8');
  expect(source).toContain('/notification-template-drafts/preview');
  expect(source).toContain('clearTimeout(timer)');expect(source).toContain('300');
  expect(source).not.toContain('/test-send');expect(source).not.toContain('/decision-intents/');
  expect(source).not.toContain('Date.now(');
 });
});
