import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Integration } from '../../src/types';
import {
  prepareIntegrationVerificationReview, isCurrentIntegrationVerificationReview,
  IntegrationVerificationConfirmation, createIntegrationVerificationGuard,
  submitReviewedIntegrationVerification, verifyIntegrationVerificationReceipt,
} from '../../src/integration_verification_review';

const source:Integration={
  id:'integration-A', name:'Control integration', kind:'datarelay',tenant:'finance',
  enabled:true,callback_origin:'https://control.example.invalid',
  decision_verification_minimum:'EMAIL_PIN_PLUS_MFA',
};
const payload={
  decision_verification_minimum:'EMAIL_PIN_PLUS_OTP' as const,
  reason:'Approved by authorized integration admin',
};
const accepted={
  integration_id:'integration-A',decision_verification_minimum:'EMAIL_PIN_PLUS_OTP' as const,
  existing_snapshots_unchanged:true,
};
const make=()=>prepareIntegrationVerificationReview(source,payload);
function pending<T>() {
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(ok=>{resolve=ok;});
  return {promise,resolve};
}
describe('P0 reviewed verification floor management',()=>{
  it('freezes current integration identity, previous/new floor and exact reason',()=>{
    const v=make();
    expect(v.integrationId).toBe(source.id);
    expect(v.integrationName).toBe(source.name);
    expect(v.previousMinimum).toBe('EMAIL_PIN_PLUS_MFA');
    expect(v.nextMinimum).toBe('EMAIL_PIN_PLUS_OTP');
    expect(v.reason).toBe(payload.reason);
    expect(v.reduction).toBe(true);
    expect(v.fingerprint).toContain(source.callback_origin);
  });
  it('offers an explicit separate final Confirm, including downgrade and no false MFA',()=>{
    const html=renderToStaticMarkup(createElement(IntegrationVerificationConfirmation,{
      reviewed:make(),valid:true,busy:false,onBack:()=>{},onConfirm:()=>{},
    }));
    expect(html).toContain('Confirm verification minimum change');
    expect(html).toContain('Control integration');
    expect(html).toContain('integration-A');
    expect(html).toContain('EMAIL_PIN_PLUS_MFA');
    expect(html).toContain('EMAIL_PIN_PLUS_OTP');
    expect(html).toContain(payload.reason);
    expect(html).toContain('same mailbox');
    expect(html).toContain('Confirm change');
    expect(html).not.toContain('Execute</button>');
  });
  it('invalidates review on another integration, rename, disable, new minimum, reason drift',()=>{
    const v=make();
    expect(isCurrentIntegrationVerificationReview(v,source,payload)).toBe(true);
    expect(isCurrentIntegrationVerificationReview(v,{...source,id:'B'},payload)).toBe(false);
    expect(isCurrentIntegrationVerificationReview(v,{...source,name:'Other'},payload)).toBe(false);
    expect(isCurrentIntegrationVerificationReview(v,{...source,enabled:false},payload)).toBe(false);
    expect(isCurrentIntegrationVerificationReview(v,{...source,decision_verification_minimum:'EMAIL_PIN'},payload)).toBe(false);
    expect(isCurrentIntegrationVerificationReview(v,source,{...payload,reason:'Changed reason'})).toBe(false);
  });
  it('fresh role-scoped integration GET must match before one exact policy PUT',async()=>{
    const gate=createIntegrationVerificationGuard(),events:string[]=[];
    const result=await submitReviewedIntegrationVerification(make(),gate,
      async()=>{events.push('GET');return [source];},
      async(id,body)=>{events.push('PUT');
        expect(id).toBe(source.id);expect(body).toEqual(payload);return accepted;},
      ()=>true);
    expect(events).toEqual(['GET','PUT']);
    expect(result).toEqual(accepted);
    expect(gate.blocked()).toBe(true);
  });
  it('rejects changed saved floor or selected context without writing any change',async()=>{
    for(const changed of [{...source,decision_verification_minimum:'EMAIL_PIN'},
      {...source,enabled:false},{...source,name:'Replaced receiver'}]){
      const gate=createIntegrationVerificationGuard();let writes=0;
      await expect(submitReviewedIntegrationVerification(make(),gate,
        async()=>[changed],async()=>{writes++;return accepted;},()=>true))
        .rejects.toThrow('VERIFICATION_REVIEW_CHANGED');
      expect(writes).toBe(0);
      expect(gate.blocked()).toBe(false);
    }
    const gate=createIntegrationVerificationGuard();let writes=0;
    await expect(submitReviewedIntegrationVerification(make(),gate,
      async()=>[source],async()=>{writes++;return accepted;},()=>false))
      .rejects.toThrow('VERIFICATION_REVIEW_CHANGED');
    expect(writes).toBe(0);
  });
  it('claims synchronously before awaiting GET so same-render double Confirm cannot double PUT',async()=>{
    const gate=createIntegrationVerificationGuard(),slow=pending<void>();
    let writes=0;
    const send=()=>submitReviewedIntegrationVerification(make(),gate,
      async()=>[source],async()=>{writes++;await slow.promise;return accepted;},()=>true);
    const first=send(),duplicate=send();
    await Promise.resolve();
    expect(writes).toBe(1);
    slow.resolve();
    expect(await first).toEqual(accepted);
    expect(await duplicate).toBeNull();
  });
  it('does not acknowledge malformed or wrong integration policy receipt',()=>{
    expect(verifyIntegrationVerificationReceipt(make(),accepted)).toEqual(accepted);
    for(const wrong of [
      {...accepted,integration_id:'other'},
      {...accepted,decision_verification_minimum:'EMAIL_PIN'},
      {...accepted,existing_snapshots_unchanged:false},
    ]){
      expect(()=>verifyIntegrationVerificationReceipt(make(),wrong))
        .toThrow('VERIFICATION_RECEIPT_MISMATCH');
    }
  });
  it('ambiguous PUT remains latched until a manual fresh read for exactly attempted ID',async()=>{
    const gate=createIntegrationVerificationGuard(),intent=make();
    await expect(submitReviewedIntegrationVerification(intent,gate,async()=>[source],
      async()=>{throw Error('PUT_TIMEOUT');},()=>true)).rejects.toThrow('PUT_TIMEOUT');
    expect(gate.blocked()).toBe(true);
    expect(gate.readSucceeded('other')).toBe(false);
    expect(gate.blocked()).toBe(true);
    expect(gate.readSucceeded('integration-A')).toBe(true);
    expect(gate.blocked()).toBe(false);
  });
  it('failed preflight GET never starts PUT and allows new explicit Review',async()=>{
    const gate=createIntegrationVerificationGuard(),intent=make();
    let writes=0;
    await expect(submitReviewedIntegrationVerification(intent,gate,
      async()=>{throw Error('READ_FAILED');},
      async()=>{writes++;return accepted;},()=>true)).rejects.toThrow('READ_FAILED');
    expect(writes).toBe(0);
    expect(gate.blocked()).toBe(false);
  });
  it('hides final confirmation when not reviewed',()=>{
    const html=renderToStaticMarkup(createElement(IntegrationVerificationConfirmation,{
      reviewed:null,valid:false,busy:false,onBack:()=>{},onConfirm:()=>{},
    }));
    expect(html).not.toContain('Confirm change');
  });
});
