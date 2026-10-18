import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createCredentialReadGate, readScopedCredentials, currentCredentialProjection,
  CredentialWorklist, createCredentialRevokeReview, CredentialRevokeConfirmation,
  createCredentialRevokeGuard, submitReviewedCredentialRevocation,
  verifyCredentialRevokeReceipt,
  type CredentialMetadata,
} from '../../src/integration_credential_workspace';

const enabled:CredentialMetadata={
  id:'token-active-a',scopes:['request:create','request:read'],
  enabled:true,created_at:1000,
};
const other:CredentialMetadata={
  id:'token-active-b',scopes:['grant:consume','result:write'],
  enabled:true,created_at:2000,
};
const revoked:CredentialMetadata={
  ...enabled,id:'token-old',scopes:['request:read'],
  enabled:false,created_at:500,
};
const table=(rows:CredentialMetadata[],busy=false)=>
  renderToStaticMarkup(createElement(CredentialWorklist,{
    rows,busy,onReviewRevoke:()=>undefined,
  }));
function deferred<T>(){
  let resolve!:(value:T)=>void, reject!:(error:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});
  return {promise,resolve,reject};
}

describe('P0 task-first exact integration credential list read scope',()=>{
  it('ignores a late A credential list after the user selects integration B',async()=>{
    const gate=createCredentialReadGate();gate.select('integration-A');
    const slow=deferred<CredentialMetadata[]>(),shown:string[]=[];
    const old=readScopedCredentials(gate,'integration-A',()=>slow.promise,
      result=>shown.push(result[0]?.id??'empty'));
    gate.select('integration-B');
    expect(await readScopedCredentials(gate,'integration-B',async()=>[other],
      result=>shown.push(result[0]?.id??'empty'))).toBe(true);
    slow.resolve([enabled]);
    expect(await old).toBe(false);
    expect(shown).toEqual(['token-active-b']);
  });
  it('does not start stale or empty selection network reads',async()=>{
    const gate=createCredentialReadGate();
    gate.select('integration-B');
    let fetches=0;
    expect(await readScopedCredentials(gate,'integration-A',
      async()=>{fetches++;return [enabled];},()=>undefined)).toBe(false);
    expect(fetches).toBe(0);
    gate.select('');
    expect(await readScopedCredentials(gate,'',
      async()=>{fetches++;return [enabled];},()=>undefined)).toBe(false);
    expect(fetches).toBe(0);
  });
  it('rejects stale same-integration GET and ignores outdated errors',async()=>{
    const gate=createCredentialReadGate();gate.select('integration-A');
    const slow=deferred<CredentialMetadata[]>(),seen:string[]=[];
    const first=readScopedCredentials(gate,'integration-A',()=>slow.promise,
      rows=>seen.push(rows[0]?.id??'none'));
    const latest=readScopedCredentials(gate,'integration-A',async()=>[other],
      rows=>seen.push(rows[0]?.id??'none'));
    slow.reject(new Error('OLD_TOKEN_GET'));
    expect(await latest).toBe(true);
    expect(await first).toBe(false);
    expect(seen).toEqual(['token-active-b']);
  });
  it('hides A credentials on the first render of B before the effect reruns',()=>{
    const saved={key:'integration-A',rows:[enabled]};
    expect(currentCredentialProjection(saved,'integration-B')).toEqual([]);
    expect(currentCredentialProjection(saved,'integration-A')).toEqual([enabled]);
  });
  it('shows currently actionable credentials first, revoked history collapsed',()=>{
    const html=table([revoked,enabled,other]);
    expect(html).toContain('Active credentials');
    expect(html).toContain('Revoked credential history (1)');
    expect(html.indexOf('token-active-b')).toBeLessThan(html.indexOf('token-active-a'));
    expect(html).toContain('request:create');
    expect(html).toContain('grant:consume');
    expect(html).toMatch(/<details><summary>Revoked credential history/);
    expect(html).not.toContain('raw token');
    expect(html).not.toContain('Execute</button>');
  });
  it('does not offer revocation controls for revoked tokens or busy interactions',()=>{
    const html=table([revoked]);
    expect(html).not.toContain('Review revoke');
    expect(table([enabled],true)).toContain('disabled=""');
  });
  it('escapes untrusted metadata, and shows a factual empty state',()=>{
    expect(table([])).toContain('No active credentials');
    const html=table([{...enabled,scopes:['<img src=x onerror=alert(1)>']}]);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
  });
});

describe('P0 credential revoke must be reviewed, exact and one-shot',()=>{
  it('freezes exact scoped token ID and displays its previous scopes before final Confirm',()=>{
    const reviewed=createCredentialRevokeReview('integration-A',enabled);
    expect(reviewed.integrationId).toBe('integration-A');
    const html=renderToStaticMarkup(createElement(CredentialRevokeConfirmation,{
      reviewed,valid:true,busy:false,onBack:()=>undefined,onConfirm:()=>undefined,
    }));
    expect(html).toContain('Confirm revoke credential');
    expect(html).toContain('token-active-a');
    expect(html).toContain('request:create');
    expect(html).toContain('cannot undo an external action');
    expect(html).not.toContain('Execute</button>');
  });
  it('refuses disabled tokens and changes to the saved id/scopes/status',()=>{
    expect(()=>createCredentialRevokeReview('integration-A',revoked))
      .toThrow('CREDENTIAL_REVOKE_UNAVAILABLE');
    const reviewed=createCredentialRevokeReview('integration-A',enabled);
    const mismatch={...enabled,scopes:['grant:consume']};
    const guard=createCredentialRevokeGuard();
    let writes=0;
    return expect(submitReviewedCredentialRevocation(reviewed,guard,
      async()=>[mismatch],async()=>{writes++;return {id:enabled.id,enabled:false}},
      ()=>true)).rejects.toThrow('CREDENTIAL_CHANGED_REVIEW_REQUIRED').then(()=>{
      expect(writes).toBe(0);expect(guard.blocked()).toBe(false);
    });
  });
  it('submits at most one exact reviewed POST even on fast duplicate Confirm',async()=>{
    const guard=createCredentialRevokeGuard();
    const reviewed=createCredentialRevokeReview('integration-A',enabled);
    let release!:()=>void;
    const pending=new Promise<void>(done=>{release=done});
    let posts=0;
    const submit=()=>submitReviewedCredentialRevocation(reviewed,guard,
      async()=>[enabled],async()=>{
        posts++;await pending;return {id:enabled.id,enabled:false};
      },()=>true);
    const a=submit(),b=submit();
    await Promise.resolve();
    expect(posts).toBe(1);
    release();
    expect((await a)?.enabled).toBe(false);
    expect(await b).toBeNull();
    expect(guard.blocked()).toBe(true);
  });
  it('a refresh of integration B cannot unlock ambiguous A revocation',async()=>{
    const guard=createCredentialRevokeGuard();
    const reviewed=createCredentialRevokeReview('integration-A',enabled);
    await expect(submitReviewedCredentialRevocation(reviewed,guard,
      async()=>[enabled],async()=>{throw Error('POST_TIMEOUT');},()=>true))
      .rejects.toThrow('POST_TIMEOUT');
    expect(guard.readSucceeded('integration-B')).toBe(false);
    expect(guard.blocked()).toBe(true);
    expect(guard.readSucceeded('integration-A')).toBe(true);
    expect(guard.blocked()).toBe(false);
  });
  it('rejects a credential list switch during GET, and malformed server revoke receipt',async()=>{
    const guard=createCredentialRevokeGuard();
    const reviewed=createCredentialRevokeReview('integration-A',enabled);
    let post=0;
    await expect(submitReviewedCredentialRevocation(reviewed,guard,
      async()=>[enabled],async()=>{post++;return {id:enabled.id,enabled:false};},
      ()=>false)).rejects.toThrow('CREDENTIAL_CHANGED_REVIEW_REQUIRED');
    expect(post).toBe(0);
    for(const item of [{id:'wrong',enabled:false},{id:enabled.id,enabled:true}]){
      expect(()=>verifyCredentialRevokeReceipt(reviewed,item))
        .toThrow('CREDENTIAL_REVOKE_RECEIPT_MISMATCH');
    }
  });
});
