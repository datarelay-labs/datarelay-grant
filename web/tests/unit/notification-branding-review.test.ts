import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {NotificationBranding} from '../../src/types';
import {
  prepareBrandingReview,isCurrentBrandingReview,
  BrandingChangeConfirmation,createBrandingSaveGuard,
  submitReviewedBrandingSave,verifyBrandingReceipt,
} from '../../src/notification_branding_review';

const source:NotificationBranding={
  brand_name:'Grant original',sender_display_name:'Grant security',
  logo_asset:'/assets/datarelay-grant-icon.svg',
};
const newDraft={brand_name:'Grant approved',sender_display_name:'Security Operations'};
const result={...source,...newDraft};
const review=()=>prepareBrandingReview(source,newDraft);
describe('P0 task-first exact notification sender identity review',()=>{
  it('freezes original/current displayed sender and immutable logo before mutation',()=>{
    const v=review();
    expect(v.saved).toEqual(source);
    expect(v.changed).toEqual(newDraft);
    expect(v.savedFingerprint).toContain(source.logo_asset);
    expect(JSON.stringify(v)).not.toContain('api_token');
  });
  it('rejects no-op, multiline header values, invalid lengths or missing server branding',()=>{
    expect(()=>prepareBrandingReview(source,{...source})).toThrow('BRANDING_REVIEW_INVALID');
    for(const unsafe of [
      {...newDraft,brand_name:''},
      {...newDraft,brand_name:'  '},
      {...newDraft,sender_display_name:'A\nB'},
      {...newDraft,brand_name:'A\rB'},
      {...newDraft,brand_name:'A'.repeat(101)},
    ]){
      expect(()=>prepareBrandingReview(source,unsafe)).toThrow('BRANDING_REVIEW_INVALID');
    }
    expect(()=>prepareBrandingReview({...source,logo_asset:''},newDraft))
      .toThrow('BRANDING_REVIEW_INVALID');
  });
  it('explicitly shows read-only before and after plus a separate final Confirm',()=>{
    const html=renderToStaticMarkup(createElement(BrandingChangeConfirmation,{
      reviewed:review(),valid:true,busy:false,onBack:()=>{},onConfirm:()=>{},
    }));
    for(const part of [
      'Review notification branding',
      'Grant original','Grant security',
      'Grant approved','Security Operations',
      'Confirm branding change','existing request snapshots',
    ])expect(html).toContain(part);
    expect(html).not.toContain('Send email</button>');
    expect(html).not.toContain('Execute</button>');
  });
  it('invalidates a reviewed edit on any saved branding, logo or draft drift',()=>{
    const intended=review();
    expect(isCurrentBrandingReview(intended,source,newDraft)).toBe(true);
    expect(isCurrentBrandingReview(intended,{...source,brand_name:'Other'},newDraft)).toBe(false);
    expect(isCurrentBrandingReview(intended,{...source,logo_asset:'/different.svg'},newDraft)).toBe(false);
    expect(isCurrentBrandingReview(intended,source,{...newDraft,sender_display_name:'New sender'})).toBe(false);
  });
  it('fresh role-scoped backend GET checks before one exact admin PUT',async()=>{
    const gate=createBrandingSaveGuard(),events:string[]=[];
    const ack=await submitReviewedBrandingSave(review(),gate,
      async()=>{events.push('GET');return source;},
      async(body)=>{events.push('PUT');expect(body).toEqual(newDraft);return result;},
      ()=>true);
    expect(ack).toEqual(result);
    expect(events).toEqual(['GET','PUT']);
    expect(gate.blocked()).toBe(true);
  });
  it('blocks changed saved branding before any PUT, retaining ability to review anew',async()=>{
    const gate=createBrandingSaveGuard();let put=0;
    await expect(submitReviewedBrandingSave(review(),gate,
      async()=>({...source,sender_display_name:'Other'}),
      async()=>{put++;return result;},()=>true))
      .rejects.toThrow('BRANDING_CURRENT_CHANGED');
    expect(put).toBe(0);
    expect(gate.blocked()).toBe(false);
  });
  it('claims synchronously so duplicate same-render Confirm cannot send two PUTs',async()=>{
    const gate=createBrandingSaveGuard();let release!:()=>void;
    const pending=new Promise<void>(resolve=>{release=resolve});
    let put=0;
    const send=()=>submitReviewedBrandingSave(review(),gate,
      async()=>source,async()=>{put++;await pending;return result},()=>true);
    const first=send(),second=send();
    await Promise.resolve();
    expect(put).toBe(1);
    release();
    expect(await first).toEqual(result);
    expect(await second).toBeNull();
  });
  it('does not claim a wrong receipt, changed logo or partial save successful',()=>{
    expect(verifyBrandingReceipt(review(),result)).toEqual(result);
    for(const wrong of [
      {...result,brand_name:'Other'},
      {...result,sender_display_name:'Other'},
      {...result,logo_asset:'/changed.svg'},
    ])expect(()=>verifyBrandingReceipt(review(),wrong))
      .toThrow('BRANDING_RECEIPT_MISMATCH');
  });
  it('locks possible committed PUT even on timeout until explicit saved branding refresh',async()=>{
    const gate=createBrandingSaveGuard();
    await expect(submitReviewedBrandingSave(review(),gate,
      async()=>source,async()=>{throw Error('PUT_TIMEOUT')},()=>true))
      .rejects.toThrow('PUT_TIMEOUT');
    expect(gate.blocked()).toBe(true);
    expect(gate.readSucceeded()).toBe(true);
    expect(gate.blocked()).toBe(false);
  });
  it('pre-write GET errors, stale view selection or changes do not issue PUT',async()=>{
    const gate=createBrandingSaveGuard();let puts=0;
    await expect(submitReviewedBrandingSave(review(),gate,
      async()=>{throw Error('READ_FAIL')},async()=>{puts++;return result},()=>true))
      .rejects.toThrow('READ_FAIL');
    expect(gate.blocked()).toBe(false);
    await expect(submitReviewedBrandingSave(review(),gate,
      async()=>source,async()=>{puts++;return result},()=>false))
      .rejects.toThrow('BRANDING_CURRENT_CHANGED');
    expect(puts).toBe(0);
  });
});
