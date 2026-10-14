import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createEmailDesign,withButtonSize} from '../../src/email_design';
import {EmailTemplateDesignEditor} from '../../src/email_template_design_editor';
import {templateDraftSignature} from '../../src/notification_preview';
import {prepareTemplateSaveReview,submitReviewedTemplateSave,createTemplateSaveGuard} from '../../src/notification_template_save_review';
import type {NotificationTemplateSet} from '../../src/types';

const events=['requested','reminder','approved','denied','expired','cancelled','execution_succeeded','execution_failed','execution_unknown'];
function saved():NotificationTemplateSet {
 return {id:'test',name:'Synthetic design',enabled:true,created_at:1,updated_at:1,
   templates:Object.fromEntries(events.map(e=>[e,{subject:e,body:'Synthetic body'}])) as NotificationTemplateSet['templates'],
   design:createEmailDesign()};
}
describe('ET-3 approval-specific visual editor',()=>{
 it('offers three presets and bounded button dimensions without removing authority',()=>{
   const defaults=createEmailDesign();
   const large=withButtonSize(defaults,'L');
   expect(large.styles.button_font_size).toBe(20);
   expect(defaults.styles.button_font_size).toBe(16);
   const html=renderToStaticMarkup(createElement(EmailTemplateDesignEditor,{
     value:large,onChange:()=>{},onInsertVariable:()=>{},variables:['request_title'],disabled:false,
   }));
   for(const label of ['Standard','Compact','High visibility','Button size','Protected approval actions','Verification requirements','Undo design change']) expect(html).toContain(label);
   expect(html).toContain('disabled');expect(html).not.toContain('href="javascript:');
 });
 it('changes review signature when only style changes and binds exact saved payload',async()=>{
   const source=saved();
   const draft={...source,design:withButtonSize(source.design!,'L')};
   expect(templateDraftSignature(source)).not.toEqual(templateDraftSignature(draft));
   const review=prepareTemplateSaveReview('update',source,draft);
   draft.design!.styles.button_font_size=14;
   expect(review.draft.design!.styles.button_font_size).toBe(20);
   let payload:unknown;
   const result=await submitReviewedTemplateSave(review,createTemplateSaveGuard(),async()=>[source],
      async(_,id,body)=>{payload=body;return {...source,...body,id,updated_at:2};},()=>true);
   expect(result?.design?.styles.button_font_size).toBe(20);
   expect(payload).toMatchObject({expected_updated_at:1,design:{button_size:'L'}});
 });
 it('explicitly opts legacy templates into a visual draft instead of silent migration',()=>{
   const html=renderToStaticMarkup(createElement(EmailTemplateDesignEditor,{
     value:null,onChange:()=>{},onInsertVariable:()=>{},variables:[],disabled:false,
   }));
   expect(html).toContain('Enable visual draft');
   expect(html).toContain('published');
 });
});

import {readFileSync} from 'node:fs';
import {formatEmailText} from '../../src/email_design';
it('mounts the domain editor and cursor-aware formatting in the real Notifications workflow',()=>{
 const source=readFileSync(new URL('../../src/notifications.tsx',import.meta.url),'utf8');
 expect(source).toContain('<EmailBodyEditor ref={emailBodyRef}');
 expect(source).toContain('<EmailTemplateDesignEditor');
 expect(source).toContain('emailBodyRef.current?.insert');
 expect(source).toContain('grant-email-workbench');
 expect(source).toContain('design:draftDesign');
 expect(formatEmailText('Hello world',6,11,'bold').value).toBe('Hello **world**');
 expect(formatEmailText('가나다',1,2,'insert','{{target}}').value).toBe('가{{target}}다');
 expect(withButtonSize(createEmailDesign(),'L').styles.button_padding_y*2+24).toBe(56);
});
