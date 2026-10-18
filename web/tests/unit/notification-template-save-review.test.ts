import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {NotificationEvent,NotificationTemplateSet} from '../../src/types';
import type {TemplateDraft} from '../../src/notification_preview';
import {createEmailDesign} from '../../src/email_design';
import {emailPalettes} from '../../src/email_palette';
import {
  prepareTemplateSaveReview,isCurrentTemplateSaveReview,
  NotificationTemplateSaveConfirmation,createTemplateSaveGuard,
  submitReviewedTemplateSave,verifyTemplateSaveReceipt,
} from '../../src/notification_template_save_review';

const events:NotificationEvent[]=[
  'requested','reminder','approved','denied','expired','cancelled',
  'execution_succeeded','execution_failed','execution_unknown',
];
const templates=Object.fromEntries(events.map(event=>[event,{
  subject:'Grant '+event+' {{request_title}}',
  body:'Request: {{request_url}}\nState: '+event,
}])) as NotificationTemplateSet['templates'];
const saved:NotificationTemplateSet={
  id:'set-A',name:'Finance approval',enabled:true,
  templates,created_at:12345,updated_at:12346,
};
const draft:TemplateDraft={
  name:'Finance approval improved',enabled:true,
  templates:{...templates,requested:{...templates.requested,
    subject:'New approval {{request_title}}',body:'Review: {{request_url}}'}},
};
const review=()=>prepareTemplateSaveReview('update',saved,draft);
const receipt:NotificationTemplateSet={
  ...saved,...draft,updated_at:12347,
};
function pause<T>(){let resolve!:(v:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done});
 return {promise,resolve};}
describe('P0 notification template-set exact source Review→Confirm',()=>{
  it('freezes all nine event subjects/bodies, saved ID/version and changed field list',()=>{
    const intent=review();
    expect(intent.mode).toBe('update');
    expect(intent.savedId).toBe('set-A');
    expect(intent.savedUpdatedAt).toBe(12346);
    expect(Object.keys(intent.draft.templates)).toHaveLength(9);
    expect(intent.changedEvents).toEqual(['requested']);
    expect(intent.draft.templates.requested.body).toBe('Review: {{request_url}}');
    expect(intent.draft.name).toBe('Finance approval improved');
  });
  it('validates missing, unknown, empty and unsafe full event family before Review',()=>{
    for(const invalid of [
      {...draft,templates:{requested:templates.requested}},
      {...draft,templates:{...templates,unknown:templates.requested}},
      {...draft,name:'  '},
      {...draft,name:'X'.repeat(101)},
      {...draft,templates:{...templates,requested:{subject:'a\nInjected',body:'x'}}},
      {...draft,templates:{...templates,requested:{subject:'',body:'x'}}},
    ]){
      expect(()=>prepareTemplateSaveReview('update',saved,invalid as TemplateDraft))
        .toThrow('TEMPLATE_SAVE_REVIEW_INVALID');
    }
    expect(()=>prepareTemplateSaveReview('update',saved,saved))
      .toThrow('TEMPLATE_SAVE_REVIEW_INVALID');
    expect(()=>prepareTemplateSaveReview('create',null,{...draft,enabled:false}))
      .toThrow('TEMPLATE_SAVE_REVIEW_INVALID');
  });
  it('shows separate exact name/status/event review without sending an email',()=>{
    const html=renderToStaticMarkup(createElement(NotificationTemplateSaveConfirmation,{
      reviewed:review(),valid:true,busy:false,onBack:()=>{},onConfirm:()=>{},
    }));
    for(const span of [
      'Review notification template set','Finance approval improved',
      'set-A','New approval','Review:','requested',
      'Confirm template set update','Existing request snapshots',
    ])expect(html).toContain(span);
    expect(html).not.toContain('Send test email</button>');
    expect(html).not.toContain('Execute</button>');
  });
  it('invalidates an old reviewed intent for changed draft, source ID/status/version or template body',()=>{
    const intent=review();
    expect(isCurrentTemplateSaveReview(intent,saved,draft)).toBe(true);
    expect(isCurrentTemplateSaveReview(intent,{...saved,id:'other'},draft)).toBe(false);
    expect(isCurrentTemplateSaveReview(intent,{...saved,updated_at:456},draft)).toBe(false);
    expect(isCurrentTemplateSaveReview(intent,{...saved,enabled:false},draft)).toBe(false);
    expect(isCurrentTemplateSaveReview(intent,saved,{...draft,name:'changed'})).toBe(false);
    expect(isCurrentTemplateSaveReview(intent,saved,{...draft,templates:{
      ...draft.templates,approved:{...templates.approved,body:'Modified'},
    }})).toBe(false);
  });
  it('fresh current-role GET verifies exact saved template before one update PUT',async()=>{
    const gate=createTemplateSaveGuard(),events:string[]=[];
    const output=await submitReviewedTemplateSave(review(),gate,
      async()=>{events.push('GET');return [saved];},
      async(mode,id,payload)=>{events.push('PUT');
        expect(mode).toBe('update');expect(id).toBe('set-A');
        expect(payload).toEqual({...draft,expected_updated_at:12346});return receipt;
      },()=>true);
    expect(output).toEqual(receipt);
    expect(events).toEqual(['GET','PUT']);
    expect(gate.blocked()).toBe(true);
  });
  it('stale server version blocks PUT, without inventing backend atomic CAS',async()=>{
    const gate=createTemplateSaveGuard();let puts=0;
    await expect(submitReviewedTemplateSave(review(),gate,
      async()=>[{...saved,updated_at:12348}],
      async()=>{puts++;return receipt;},()=>true))
      .rejects.toThrow('TEMPLATE_SAVE_SOURCE_CHANGED');
    expect(puts).toBe(0);
    expect(gate.blocked()).toBe(false);
  });
  it('same-render double Confirm claims synchronously before GET/PUT',async()=>{
    const gate=createTemplateSaveGuard(),slow=pause<void>();
    let puts=0;
    const send=()=>submitReviewedTemplateSave(review(),gate,async()=>[saved],
      async()=>{puts++;await slow.promise;return receipt;},()=>true);
    const a=send(),b=send();await Promise.resolve();
    expect(puts).toBe(1);
    slow.resolve();
    expect(await a).toEqual(receipt);
    expect(await b).toBeNull();
  });
  it('receipt must prove exact ID, enabled state, name and full nine template bodies',()=>{
    expect(verifyTemplateSaveReceipt(review(),receipt)).toEqual(receipt);
    for(const bad of [
      {...receipt,id:'wrong'},
      {...receipt,name:'wrong'},
      {...receipt,enabled:false},
      {...receipt,templates:{...receipt.templates,denied:{subject:'wrong',body:'wrong'}}},
    ])expect(()=>verifyTemplateSaveReceipt(review(),bad))
      .toThrow('TEMPLATE_SAVE_RECEIPT_MISMATCH');
  });
  it('accepts exact server-normalized design defaults on a new saved template receipt',()=>{
    const draftWithDesign:TemplateDraft={
      ...draft,name:'Isolated E2E saved mail',design:createEmailDesign(),
    };
    const intent=prepareTemplateSaveReview('create',null,draftWithDesign);
    const normalized:NotificationTemplateSet={
      ...saved,...draftWithDesign,id:'new-isolated',enabled:true,
      design:{...draftWithDesign.design!,event_headings:{},event_preheaders:{},
        palette:{...emailPalettes.light}},
    };
    // Pydantic populates optional event headings and the default palette
    // even if the authoring UI omitted them. These do not alter the draft.
    expect(verifyTemplateSaveReceipt(intent,normalized)).toEqual(normalized);
    expect(()=>verifyTemplateSaveReceipt(intent,{
      ...normalized,design:{...normalized.design!,event_headings:{requested:'Changed heading'}},
    })).toThrow('TEMPLATE_SAVE_RECEIPT_MISMATCH');
  });
  it('ambiguous PUT stays blocked until successful explicit same-set history refresh',async()=>{
    const gate=createTemplateSaveGuard(),intent=review();
    await expect(submitReviewedTemplateSave(intent,gate,async()=>[saved],
      async()=>{throw Error('PUT_TIMEOUT')},()=>true)).rejects.toThrow('PUT_TIMEOUT');
    expect(gate.blocked()).toBe(true);
    expect(gate.readSucceeded('set-other')).toBe(false);
    expect(gate.blocked()).toBe(true);
    expect(gate.readSucceeded('set-A')).toBe(true);
    expect(gate.blocked()).toBe(false);
  });
  it('create flow rejects duplicate saved name and accepts precise new-ID receipt',async()=>{
    const newDraft={...draft,name:'Another complete set'};
    const intent=prepareTemplateSaveReview('create',null,newDraft);
    const gate=createTemplateSaveGuard();let posted=0;
    const fresh=await submitReviewedTemplateSave(intent,gate,
      async()=>[saved],async(mode,id,payload)=>{posted++;
        expect(mode).toBe('create');expect(id).toBe('');
        expect(payload).toEqual({name:newDraft.name,templates:newDraft.templates});
        return {...saved,...newDraft,id:'new-set',created_at:333,updated_at:333};
      },()=>true);
    expect(posted).toBe(1);
    expect(fresh?.id).toBe('new-set');
    const duplicate=prepareTemplateSaveReview('create',null,{...draft,name:'FINANCE APPROVAL'});
    let duplicates=0;
    await expect(submitReviewedTemplateSave(duplicate,createTemplateSaveGuard(),
      async()=>[saved],async()=>{duplicates++;return receipt;},()=>true))
      .rejects.toThrow('TEMPLATE_SAVE_NAME_EXISTS');
    expect(duplicates).toBe(0);
  });
  it('rejects changing editor context mid GET, with no mutation',async()=>{
    const gate=createTemplateSaveGuard();let puts=0;
    await expect(submitReviewedTemplateSave(review(),gate,async()=>[saved],
      async()=>{puts++;return receipt;},()=>false))
      .rejects.toThrow('TEMPLATE_SAVE_SOURCE_CHANGED');
    expect(puts).toBe(0);
  });
  it('escapes untrusted message text and never renders an executable HTML element',()=>{
    const changed={...draft,templates:{...draft.templates,
      requested:{subject:'<img src=x>',body:'<script>bad</script>'}}};
    const intent=prepareTemplateSaveReview('update',saved,changed);
    const html=renderToStaticMarkup(createElement(NotificationTemplateSaveConfirmation,{
      reviewed:intent,valid:true,busy:false,onBack:()=>{},onConfirm:()=>{},
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
  });
});
