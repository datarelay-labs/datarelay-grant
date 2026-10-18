import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  IntegrationConnectionDirectory, IntegrationTestConfirmation,
  listIntegrationConnections, createIntegrationTestReview,
  isCurrentIntegrationTestReview, createIntegrationTestGuard,
  submitReviewedIntegrationTest, verifyIntegrationTestReceipt,
} from '../../src/integration_connection_review';
import { Integrations } from '../../src/integrations';
import type { Integration } from '../../src/types';

const integration:Integration={
  id:'install-reg-a',name:'Production Control',kind:'datarelay',
  enabled:true,callback_origin:'https://control.example.invalid',
  tenant:'tenant-prod',
  decision_verification_minimum:'EMAIL_PIN_PLUS_MFA',
};
const stellar:Integration={
  ...integration,id:'install-reg-b',name:'Stellar receiver',
  kind:'stellar',callback_origin:'https://stellar.example.invalid',
  tenant:'customer-soc',enabled:false,
};
const show=(rows:Integration[]= [stellar,integration],search='')=>
  renderToStaticMarkup(createElement(IntegrationConnectionDirectory,{
    rows,search,busy:false,onSearchChange:()=>undefined,
    onReviewTest:()=>undefined,onOpenCreation:()=>undefined,
  }));

describe('P0 Integrations competitor-inspired connection task directory',()=>{
  it('shows each saved connection, status, assurance and safe destination origin before action',()=>{
    const html=show();
    for(const value of ['Registered connections','Production Control','Stellar receiver',
      'DataRelay','Stellar Cyber','Enabled','Disabled','Decision verification minimum',
      'EMAIL_PIN_PLUS_MFA','control.example.invalid','Review connection test']){
      expect(html).toContain(value);
    }
    expect(html).not.toContain('<button>Test connection</button>');
    expect(html).not.toContain('Create scoped integration credential');
  });
  it('searches role-scoped integration names, kind and tenant without mutating GET data',()=>{
    const entries=[stellar,integration];
    expect(listIntegrationConnections(entries,'  CONTROL  ').map(row=>row.id))
      .toEqual(['install-reg-a']);
    expect(listIntegrationConnections(entries,'customer-soc').map(row=>row.id))
      .toEqual(['install-reg-b']);
    expect(listIntegrationConnections(entries,'stellar').map(row=>row.id))
      .toEqual(['install-reg-b']);
    expect(entries.map(row=>row.id)).toEqual(['install-reg-b','install-reg-a']);
  });
  it('exposes no test action on disabled integrations and a clear empty state',()=>{
    const html=show([stellar]);
    expect(html).toContain('Disabled');
    expect(html).not.toContain('Review connection test');
    expect(show([])).toContain('No registered connections');
    expect(show([integration],'not-found')).toContain('No connections match');
  });
  it('treats untrusted names as escaped, not markup or a callback endpoint',()=>{
    const html=show([{...integration,name:'<script>alert(1)</script>'}]);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Execute</button>');
  });
  it('uses a list-first default actual mounted view with creation and credential tools behind explicit tasks',()=>{
    const html=renderToStaticMarkup(createElement(Integrations));
    expect(html).toContain('Registered connections');
    expect(html).toContain('Add connection');
    expect(html).toContain('Credential tools');
    expect(html).not.toContain('Registered callback URL');
    expect(html).not.toContain('Create scoped token');
    expect(html).not.toContain('Callback headers');
  });
});

describe('P0 connection test review is nonmutating and one-shot',()=>{
  it('shows exact reviewed install-registered ID/kind/origin and no protected execution',()=>{
    const reviewed=createIntegrationTestReview(integration);
    const html=renderToStaticMarkup(createElement(IntegrationTestConfirmation,{
      reviewed,busy:false,valid:true,onCancel:()=>undefined,onConfirm:()=>undefined,
    }));
    expect(reviewed.id).toBe(integration.id);
    expect(html).toContain('Production Control');
    expect(html).toContain('control.example.invalid');
    expect(html).toContain('Confirm connection test');
    expect(html).toContain('diagnostic webhook');
    expect(html).toContain('not an approval or execution');
    expect(html).not.toContain('Execute</button>');
  });
  it('rejects disabled integrations and invalidates selection when receiver metadata changes',()=>{
    expect(()=>createIntegrationTestReview(stellar)).toThrow('INTEGRATION_TEST_UNAVAILABLE');
    const snapshot=createIntegrationTestReview(integration);
    expect(isCurrentIntegrationTestReview(snapshot,integration)).toBe(true);
    expect(isCurrentIntegrationTestReview(snapshot,{...integration,enabled:false})).toBe(false);
    expect(isCurrentIntegrationTestReview(snapshot,{...integration,callback_origin:'https://new.example.invalid'})).toBe(false);
    expect(isCurrentIntegrationTestReview(snapshot,{...integration,decision_verification_minimum:'EMAIL_PIN'})).toBe(false);
  });
  it('does a role-scoped GET freshness check and only then one diagnostic POST',async()=>{
    const guard=createIntegrationTestGuard();
    const intent=createIntegrationTestReview(integration);
    const calls:string[]=[];
    const result=await submitReviewedIntegrationTest(intent,guard,
      async()=>{calls.push('GET integrations');return [integration];},
      async(id)=>{calls.push('POST '+id);return {
        transport_accepted:true,execution_allowed:false,event_id:'diagnostic-event-id',
      };});
    expect(calls).toEqual(['GET integrations','POST install-reg-a']);
    expect(verifyIntegrationTestReceipt(result!)).toBe(result);
    expect(guard.blocked()).toBe(true);
  });
  it('detects changed installation-registered destination before POST',async()=>{
    const guard=createIntegrationTestGuard();
    let count=0;
    await expect(submitReviewedIntegrationTest(createIntegrationTestReview(integration),guard,
      async()=>[{...integration,callback_origin:'https://replacement.example.invalid'}],
      async()=>{count++;return {
        transport_accepted:true,execution_allowed:false,event_id:'never',
      };})).rejects.toThrow('INTEGRATION_TEST_CHANGED_REVIEW_REQUIRED');
    expect(count).toBe(0);
    expect(guard.blocked()).toBe(false);
  });
  it('synchronously stops a second same-render Confirm and latches a possible remote write',async()=>{
    const guard=createIntegrationTestGuard();
    const reviewed=createIntegrationTestReview(integration);
    let finish!:()=>void;
    const pending=new Promise<void>(resolve=>{finish=resolve;});
    let count=0;
    const send=()=>submitReviewedIntegrationTest(reviewed,guard,async()=>[integration],
      async()=>{count++;await pending;return {
        transport_accepted:true,execution_allowed:false,event_id:'once',
      };});
    const first=send(),second=send();
    await Promise.resolve();
    expect(count).toBe(1);
    finish();
    expect((await first)?.event_id).toBe('once');
    expect(await second).toBeNull();
    expect(guard.blocked()).toBe(true);
    expect(guard.readSucceeded()).toBe(true);
    expect(guard.blocked()).toBe(false);
  });
  it('does not retry an ambiguous webhook POST before explicit successful list refresh',async()=>{
    const guard=createIntegrationTestGuard();
    let posts=0;
    const reviewed=createIntegrationTestReview(integration);
    await expect(submitReviewedIntegrationTest(reviewed,guard,async()=>[integration],
      async()=>{posts++;throw new Error('RECEIVER_TIMEOUT');}))
      .rejects.toThrow('RECEIVER_TIMEOUT');
    expect(await submitReviewedIntegrationTest(reviewed,guard,async()=>[integration],
      async()=>{posts++;return {transport_accepted:true,execution_allowed:false,event_id:'x'};}))
      .toBeNull();
    expect(posts).toBe(1);
    expect(guard.readSucceeded()).toBe(true);
  });
  it('never labels a malformed or execution-allowed reply a safe connection test',()=>{
    for(const invalid of [
      {transport_accepted:true,execution_allowed:true,event_id:'id'},
      {transport_accepted:false,execution_allowed:false,event_id:'id'},
      {transport_accepted:true,execution_allowed:false,event_id:''},
    ]){
      expect(()=>verifyIntegrationTestReceipt(invalid))
        .toThrow('INTEGRATION_TEST_RECEIPT_UNVERIFIED');
    }
  });
});
