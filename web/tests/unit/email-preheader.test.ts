import {describe,it,expect} from 'vitest';
import {createEmailDesign,designSignature} from '../../src/email_design';
import {applyEmailPreset,resetEmailAppearance} from '../../src/email_canvas_model';

describe('U2.03 versioned event preheader draft stability',()=>{
 it('normalizes an absent optional map without reinterpreting old layout metadata',()=>{
  const old={...createEmailDesign(),shared_layout_revision:3 as const};expect(old.shared_layout_revision).toBe(3);
  expect(designSignature(old)).toBe(designSignature({...old,event_preheaders:{}}));
  expect(old).not.toHaveProperty('event_preheaders');
 });
 it('preserves every event summary during preset and scoped appearance changes',()=>{
  const value={...createEmailDesign(),shared_layout_revision:4 as const,event_preheaders:{requested:'Request summary',reminder:'알림 요약'}};
  for(const preset of ['standard','compact','high_visibility'] as const){
   const changed=applyEmailPreset(value,preset);expect(changed.event_preheaders).toEqual(value.event_preheaders);expect(changed.shared_layout_revision).toBe(4);
  }
  for(const block of ['actions','message','all'] as const)expect(resetEmailAppearance(value,block).event_preheaders).toEqual(value.event_preheaders);
 });
});
