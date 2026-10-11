import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  prepareCredentialIssueReview, isCurrentCredentialIssueReview,
  CredentialIssueConfirmation, OneTimeCredentialSecret,
  createCredentialIssueGuard, submitReviewedCredentialIssue,
  verifyCredentialIssueReceipt,
} from '../../src/integration_credential_create_review';
import type { Integration } from '../../src/types';

const source: Integration = {
  id: 'integration-a', name: 'Production Control', kind: 'datarelay',
  tenant: 'tenant-1', enabled: true, callback_origin: 'https://control.example.invalid',
  decision_verification_minimum: 'EMAIL_PIN_PLUS_MFA',
};
const scopes = ['request:create','request:read'];
const payload = { id: 'token-42', token: 'secret-raw-should-only-show-once', scopes };

function review(row: Integration = source, selected = scopes, purpose = 'producer') {
  return prepareCredentialIssueReview(row,selected,purpose);
}
function confirmation(row: Integration = source, chosen = scopes, purpose = 'producer') {
  return renderToStaticMarkup(createElement(CredentialIssueConfirmation, {
    reviewed: review(row,chosen,purpose), valid:true, busy:false,
    onBack:()=>undefined,onConfirm:()=>undefined,
  }));
}

describe('P0 task-first reviewed scoped credential creation', () => {
  it('freezes exact enabled integration identity, readable name, all ordered scopes and purpose', () => {
    const intent=review();
    expect(intent.integrationId).toBe(source.id);
    expect(intent.integrationName).toBe(source.name);
    expect(intent.integrationFingerprint).toContain(source.callback_origin);
    expect(intent.scopes).toEqual(scopes);
    expect(intent.purpose).toBe('producer');
    expect(JSON.stringify(intent)).not.toContain('secret-raw');
  });
  it('refuses unavailable, disabled or empty integration and empty/duplicate/unrecognized scopes', () => {
    expect(()=>prepareCredentialIssueReview(null,scopes,'producer')).toThrow('CREDENTIAL_ISSUE_REVIEW_INVALID');
    expect(()=>review({...source,enabled:false})).toThrow('CREDENTIAL_ISSUE_REVIEW_INVALID');
    expect(()=>review({...source,id:''})).toThrow('CREDENTIAL_ISSUE_REVIEW_INVALID');
    for(const set of [[],['request:read','request:read'],['admin:all'],
      ['request:read','read:files']]) {
      expect(()=>review(source,set,'custom')).toThrow('CREDENTIAL_ISSUE_REVIEW_INVALID');
    }
  });
  it('requires a purpose preset to match exact reviewed scopes unless purpose is custom', () => {
    expect(()=>review(source,['grant:consume'],'producer')).toThrow('CREDENTIAL_ISSUE_REVIEW_INVALID');
    expect(review(source,['grant:consume'],'custom').scopes).toEqual(['grant:consume']);
    expect(review(source,['request:read'],'read_only').purpose).toBe('read_only');
  });
  it('shows one human Confirm with exact name/scopes and no raw token or hidden grant execution', () => {
    const html=confirmation();
    expect(html).toContain('Confirm scoped credential creation');
    expect(html).toContain('Production Control');
    expect(html).toContain('integration-a');
    expect(html).toContain('request:create');
    expect(html).toContain('request:read');
    expect(html).toContain('Confirm create credential');
    expect(html).toContain('does not make a human approval decision');
    expect(html).not.toContain('secret-raw');
    expect(html).not.toContain('Execute</button>');
  });
  it('warns prominently about mixed producer/executor privileges in the final Confirm', () => {
    const html=confirmation(source,['request:create','grant:consume','result:write'],'custom');
    expect(html).toContain('Mixed producer and executor');
    expect(html).toContain('least privilege');
    expect(html).toContain('request:create');
    expect(html).toContain('grant:consume');
  });
  it('invalidates final Confirm for integration rename/disable, selected purpose or scope drift', () => {
    const intended=review();
    expect(isCurrentCredentialIssueReview(intended,source,scopes,'producer')).toBe(true);
    expect(isCurrentCredentialIssueReview(intended,{...source,name:'Other'},scopes,'producer')).toBe(false);
    expect(isCurrentCredentialIssueReview(intended,{...source,enabled:false},scopes,'producer')).toBe(false);
    expect(isCurrentCredentialIssueReview(intended,source,['request:read'],'custom')).toBe(false);
    expect(isCurrentCredentialIssueReview(intended,source,scopes,'custom')).toBe(false);
  });
  it('re-fetches the current server integration before a single exact POST', async () => {
    const g=createCredentialIssueGuard(), calls:string[]=[];
    const result=await submitReviewedCredentialIssue(review(),g,
      async()=>{calls.push('GET');return [source];},
      async(id,scopes)=>{
        calls.push('POST');
        expect(id).toBe(source.id);
        expect(scopes).toEqual(['request:create','request:read']);
        return payload;
      },
      ()=>true);
    expect(calls).toEqual(['GET','POST']);
    expect(result).toEqual(payload);
    expect(g.blocked()).toBe(true);
  });
  it('refuses renamed or disabled integration in the server fresh read before POST', async () => {
    for(const different of [{...source,name:'Renamed'}, {...source,enabled:false}]) {
      let writes=0;
      const g=createCredentialIssueGuard();
      await expect(submitReviewedCredentialIssue(review(),g,
        async()=>[different],
        async()=>{writes++;return payload;},()=>true))
        .rejects.toThrow('CREDENTIAL_ISSUE_CHANGED_REVIEW_REQUIRED');
      expect(writes).toBe(0);
      expect(g.blocked()).toBe(false);
    }
  });
  it('refuses changed visible selection midflight before POST, with no write', async () => {
    let selected=true,writes=0;
    const g=createCredentialIssueGuard();
    await expect(submitReviewedCredentialIssue(review(),g,
      async()=>{selected=false;return [source];},
      async()=>{writes++;return payload;},()=>selected))
      .rejects.toThrow('CREDENTIAL_ISSUE_CHANGED_REVIEW_REQUIRED');
    expect(writes).toBe(0);
  });
  it('claims synchronously to prevent duplicate POST even when the same React render confirms twice', async () => {
    const g=createCredentialIssueGuard();
    let release!:()=>void;
    const pending=new Promise<void>(done=>{release=done;});
    let writes=0;
    const submit=()=>submitReviewedCredentialIssue(review(),g,
      async()=>[source],async()=>{writes++;await pending;return payload;},()=>true);
    const first=submit(),second=submit();
    await Promise.resolve();
    expect(writes).toBe(1);
    release();
    expect(await first).toEqual(payload);
    expect(await second).toBeNull();
  });
  it('locks an ambiguous POST until explicit successful refresh of the very same integration', async () => {
    const g=createCredentialIssueGuard();
    let writes=0;
    await expect(submitReviewedCredentialIssue(review(),g,
      async()=>[source],async()=>{writes++;throw Error('POST_TIMEOUT');},()=>true))
      .rejects.toThrow('POST_TIMEOUT');
    expect(g.blocked()).toBe(true);
    expect(await submitReviewedCredentialIssue(review(),g,
      async()=>[source],async()=>{writes++;return payload;},()=>true)).toBeNull();
    expect(writes).toBe(1);
    expect(g.readSucceeded('other-integration')).toBe(false);
    expect(g.blocked()).toBe(true);
    expect(g.readSucceeded(source.id)).toBe(true);
    expect(g.blocked()).toBe(false);
  });
  it('a refresh cannot unlock an in-flight issue and a failed pre-GET check can be re-reviewed', async () => {
    const g=createCredentialIssueGuard();
    expect(g.claim(source.id)).toBe(true);
    expect(g.readSucceeded(source.id)).toBe(false);
    g.settled();
    expect(g.blocked()).toBe(false);
    await expect(submitReviewedCredentialIssue(review(),g,
      async()=>{throw Error('READ_FAILED');},
      async()=>payload,()=>true)).rejects.toThrow('READ_FAILED');
    expect(g.blocked()).toBe(false);
  });
  it('rejects wrong id, scopes or raw secret receipt, not reporting unsupported success', () => {
    const valid=review();
    expect(verifyCredentialIssueReceipt(valid,payload)).toEqual(payload);
    for(const wrong of [
      {...payload,id:''}, {...payload,token:''},
      {...payload,scopes:['request:create']},
      {...payload,scopes:['request:create','request:read','result:write']},
      {...payload,scopes:['request:read','request:create']},
    ]) expect(()=>verifyCredentialIssueReceipt(valid,wrong))
      .toThrow('CREDENTIAL_ISSUE_RECEIPT_MISMATCH');
  });
  it('the raw secret is rendered only on an explicit ephemeral success surface with Hide', () => {
    const blank=renderToStaticMarkup(createElement(OneTimeCredentialSecret, {
      raw:'',tokenId:'',onHide:()=>undefined,
    }));
    expect(blank).not.toContain(payload.token);
    const html=renderToStaticMarkup(createElement(OneTimeCredentialSecret, {
      raw:payload.token,tokenId:payload.id,onHide:()=>undefined,
    }));
    expect(html).toContain(payload.token);
    expect(html).toContain('Shown once');
    expect(html).toContain('Hide credential');
    expect(html).not.toContain('localStorage');
  });
  it('escapes untrusted integration names/scopes in review rather than rendering markup', () => {
    const html=confirmation({...source,name:'<script>alert(1)</script>'});
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Confirm execute</button>');
  });
});
