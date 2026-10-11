import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  prepareIntegrationCreationReview, isCurrentIntegrationCreationReview,
  IntegrationCreationConfirmation, createIntegrationCreationGuard,
  submitReviewedIntegrationCreation, verifyIntegrationCreationReceipt,
  type IntegrationRegistrationDraft,
} from '../../src/integration_creation_review';
import type { Integration } from '../../src/types';

const draft: IntegrationRegistrationDraft = {
  name: 'Main production callback',
  kind: 'datarelay',
  tenant: '',
  callbackUrl: 'https://callbacks.example.invalid/receive?private=must-not-render',
  headers: '{"Authorization":"Bearer SECRET-DO-NOT-DISPLAY"}',
  hmacSecret: 'SAMPLE-HMAC-DO-NOT-DISPLAY',
  decisionMinimum: 'EMAIL_PIN_PLUS_MFA',
};
const markup=(x=draft)=>renderToStaticMarkup(createElement(
  IntegrationCreationConfirmation,{
    reviewed:prepareIntegrationCreationReview(x), valid:true,busy:false,
    onCancel:()=>undefined,onConfirm:()=>undefined,
  }));

describe('P0 review-first integration registration, security floor and secret-free display',()=>{
  it('requires explicit verified choice instead of silently accepting weak EMAIL_PIN default',()=>{
    for(const x of ['', 'INHERIT', 'FAKE_MFA', 'EMAIL_PIN_PLUS_UNKNOWN']){
      expect(()=>prepareIntegrationCreationReview({...draft,decisionMinimum:x}))
        .toThrow('INTEGRATION_CREATION_REVIEW_INVALID');
    }
    expect(markup()).toContain('EMAIL_PIN_PLUS_MFA');
  });
  it('snapshots exact callback destination, header map and HMAC without rendering secrets',()=>{
    const review=prepareIntegrationCreationReview(draft);
    expect(review.payload.callback_url).toBe(draft.callbackUrl);
    expect(review.payload.callback_headers.Authorization)
      .toBe('Bearer SECRET-DO-NOT-DISPLAY');
    expect(review.payload.hmac_secret).toBe(draft.hmacSecret);
    const html=markup();
    expect(html).toContain('Main production callback');
    expect(html).toContain('callbacks.example.invalid');
    expect(html).toContain('Registered receiver origin');
    expect(html).toContain('1 configured header');
    expect(html).toContain('HMAC signature configured');
    expect(html).toContain('Confirm create connection');
    for(const secret of ['private=must-not-render','SECRET-DO-NOT-DISPLAY',
      'SAMPLE-HMAC-DO-NOT-DISPLAY']) expect(html).not.toContain(secret);
  });
  it('rejects non-objects/nonstring values/invalid URLs and missing tenant for Stellar',()=>{
    for(const headers of ['[]','null','not-json','{"key":10}','{"bad":false}']){
      expect(()=>prepareIntegrationCreationReview({...draft,headers}))
        .toThrow('INTEGRATION_CREATION_REVIEW_INVALID');
    }
    for(const callbackUrl of ['', 'javascript:alert(1)','not-an-url']){
      expect(()=>prepareIntegrationCreationReview({...draft,callbackUrl}))
        .toThrow('INTEGRATION_CREATION_REVIEW_INVALID');
    }
    expect(()=>prepareIntegrationCreationReview({...draft,kind:'stellar',tenant:''}))
      .toThrow('INTEGRATION_CREATION_REVIEW_INVALID');
  });
  it('invalidates frozen confirmation if callback, header, secret, mode, tenant or name changes',()=>{
    const review=prepareIntegrationCreationReview(draft);
    expect(isCurrentIntegrationCreationReview(review,draft)).toBe(true);
    const fields:{[k:string]: string}={
      name:'Other',callbackUrl:'https://different.example.invalid/receive',
      headers:'{}',hmacSecret:'new-secret',decisionMinimum:'EMAIL_PIN',tenant:'tenant-a',
    };
    for(const [key,value] of Object.entries(fields)){
      expect(isCurrentIntegrationCreationReview(review,
        {...draft,[key]:value})).toBe(false);
    }
  });
  it('does not invent independent MFA for PIN or same-mailbox OTP',()=>{
    for(const mode of ['EMAIL_PIN','EMAIL_PIN_PLUS_OTP']){
      const html=markup({...draft,decisionMinimum:mode});
      expect(html).toContain('same mailbox is not independent MFA');
    }
  });
  it('requires one final Confirm before a create POST, with synchronous duplicate claim',async()=>{
    const guard=createIntegrationCreationGuard();
    const intent=prepareIntegrationCreationReview(draft);
    let resolve!:()=>void, writes=0;
    const pending=new Promise<void>(done=>{resolve=done;});
    const send=()=>submitReviewedIntegrationCreation(intent,guard,
      async(payload)=>{
        writes++;expect(payload.decision_verification_minimum)
          .toBe('EMAIL_PIN_PLUS_MFA');
        await pending;
        return {id:'registered-id',name:draft.name,kind:draft.kind,
          decision_verification_minimum:'EMAIL_PIN_PLUS_MFA'};
      });
    const first=send(),second=send();
    expect(writes).toBe(1);
    resolve();
    expect((await first)?.id).toBe('registered-id');
    expect(await second).toBeNull();
    expect(guard.blocked()).toBe(true);
  });
  it('requires explicit successful GET before another potentially committed registration',async()=>{
    const guard=createIntegrationCreationGuard(),intent=prepareIntegrationCreationReview(draft);
    let writes=0;
    await expect(submitReviewedIntegrationCreation(intent,guard,
      async()=>{writes++;throw Error('TIMEOUT_AFTER_POST');}))
      .rejects.toThrow('TIMEOUT_AFTER_POST');
    expect(guard.blocked()).toBe(true);
    expect(await submitReviewedIntegrationCreation(intent,guard,
      async()=>{writes++;return {id:'bad',name:draft.name,kind:draft.kind,
        decision_verification_minimum:'EMAIL_PIN_PLUS_MFA'};})).toBeNull();
    expect(writes).toBe(1);
    expect(guard.readSucceeded()).toBe(true);
  });
  it('verifies exact returned name/kind/floor, but never invents callback acceptance',()=>{
    const intent=prepareIntegrationCreationReview(draft);
    const receipt:Pick<Integration,'id'|'name'|'kind'|'decision_verification_minimum'>={
      id:'registered-id',name:draft.name,kind:draft.kind,
      decision_verification_minimum:'EMAIL_PIN_PLUS_MFA',
    };
    expect(verifyIntegrationCreationReceipt(intent,receipt)).toBe(receipt);
    for(const invalid of [{...receipt,kind:'stellar' as const},
      {...receipt,name:'Other'}, {...receipt,id:''},
      {...receipt,decision_verification_minimum:'EMAIL_PIN' as const}]){
      expect(()=>verifyIntegrationCreationReceipt(intent,invalid))
        .toThrow('INTEGRATION_CREATION_RECEIPT_MISMATCH');
    }
  });
  it('safely escapes untrusted connection name and never displays supplied headers',()=>{
    const output=markup({...draft,name:'<svg onload=alert(1)>'});
    expect(output).toContain('&lt;svg');
    expect(output).not.toContain('<svg onload');
    expect(output).not.toContain('Bearer SECRET-DO-NOT-DISPLAY');
    expect(output).not.toContain('Execute</button>');
  });
});
