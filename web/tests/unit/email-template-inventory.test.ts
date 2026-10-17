import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EmailTemplateTile} from '../../src/email_template_inventory';
it('separates published and draft versions and reports only server-provided policy usage',()=>{
 const html=renderToStaticMarkup(createElement(EmailTemplateTile,{template:{id:'sample',name:'Approval example',templates:{} as any,enabled:true,created_at:1,updated_at:2,draft_revision:3,published_revision:1,active_policy_count:2},disabled:false,onEdit:()=>{}}));
 for(const text of ['Published v1','Saved draft v3','Used by 2 active policies','Edit draft','synthetic request data'])expect(html).toContain(text);
 expect(html).not.toContain('onload=');
});
