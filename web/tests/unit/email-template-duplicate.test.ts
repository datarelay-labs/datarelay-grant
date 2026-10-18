import {it,expect} from 'vitest';
import {createEmailDesign} from '../../src/email_design';
import {duplicateEmailTemplateDraft} from '../../src/email_template_inventory';
import type {NotificationTemplateSet} from '../../src/types';
const source:NotificationTemplateSet={id:'source',name:'Source approval',enabled:true,created_at:1,updated_at:2,draft_revision:2,published_revision:1,
 templates:{requested:{subject:'Source subject',body:'Source wording'}} as NotificationTemplateSet['templates'],design:createEmailDesign()};
it('copies wording and appearance into an independent unpublished draft without identity or policy bindings',()=>{
 const draft=duplicateEmailTemplateDraft(source,['Source approval (copy)']);
 expect(draft.name).toBe('Source approval (copy 2)');expect(draft.templates).toEqual(source.templates);expect(draft.design).toEqual(source.design);
 expect(draft).not.toHaveProperty('id');expect(draft).not.toHaveProperty('published_revision');expect(draft).not.toHaveProperty('active_policy_count');
 draft.templates.requested.body='Changed copy';draft.design!.styles.font_size=20;
 expect(source.templates.requested.body).toBe('Source wording');expect(source.design!.styles.font_size).toBe(16);
});
it('bounds duplicate names and keeps legacy wording in the unchanged v1 renderer as an unpublished design draft',()=>{
 const draft=duplicateEmailTemplateDraft({...source,name:'N'.repeat(100),design:null},[]);
 expect(draft.name.length).toBeLessThanOrEqual(100);expect(draft.design).toMatchObject({shared_layout_revision:1,rich_text:false,paragraph_alignment:'left'});
 expect(draft.templates).toEqual(source.templates);expect(draft.enabled).toBe(true);
});
