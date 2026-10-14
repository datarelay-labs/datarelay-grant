import {describe,it,expect} from 'vitest';
import {safeEmailCanvasStyle} from '../../src/email_canvas_projection';
import {emailPreviewProblems,syntheticEmailSample} from '../../src/email_preview_model';
import {createEmailDesign} from '../../src/email_design';
describe('inert canvas projection and actionable preview checks',()=>{
 it('preserves bounded presentation and drops network, hiding and positioning styles',()=>{
  expect(safeEmailCanvasStyle('background-color','#166534')).toBe('#166534');
  for(const [key,value] of [['background','url(https://example.invalid/x)'],['display','none'],['position','fixed'],['opacity','0'],['color','var(--secret)'],['font-family','expression(alert(1))']])expect(safeEmailCanvasStyle(key,value)).toBeNull();
 });
 it('points low-contrast color and empty heading failures to editable blocks',()=>{
  const design=createEmailDesign();design.styles.approve_color='#ffffff';design.event_headings={requested:''};
  const draft={name:'Sample',enabled:true,design,templates:{requested:{subject:'Hello',body:'Body'}}} as any;
  expect(emailPreviewProblems(draft,'requested')).toEqual(expect.arrayContaining([
   expect.objectContaining({block:'actions'}),expect.objectContaining({block:'heading'}),
  ]));
 });
 it('long and missing-optional scenarios remain bounded synthetic nonauthorizing inputs',()=>{
  for(const kind of ['normal','long_en','long_ko','missing_optional'] as const){
   const sample=syntheticEmailSample(kind,'approved');
   expect(sample.request_title.length).toBeLessThanOrEqual(250);
   expect(sample.external_id.length).toBeGreaterThan(0);
   expect(sample.request_url).toBe('https://example.invalid/requests/sample');
   expect(sample.decision_state).toBe('APPROVED');
  }
  expect(syntheticEmailSample('missing_optional','requested').reason).toBe('');
 });
});
