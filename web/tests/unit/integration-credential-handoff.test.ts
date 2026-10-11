import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CredentialWorklist, createCredentialReadGate, readScopedCredentials } from '../../src/integration_credential_workspace';
import {
  makeIssuedCredentialHandoff, acceptIssuedCredentialHandoff,
  IssuedCredentialHandoffNotice, SelectedCredentialMetadata,
} from '../../src/integration_credential_handoff';
import type { Integration } from '../../src/types';

const a:Integration={id:'connection-A',name:'Control receiver',kind:'datarelay',
  tenant:'',enabled:true,callback_origin:'https://control.example.invalid',
  decision_verification_minimum:'EMAIL_PIN'};
const b:Integration={...a,id:'connection-B',name:'Stellar receiver'};
const token={id:'issued-42',enabled:true,created_at:1000,
  scopes:['request:create','request:read']};
const receipt={id:'issued-42',scopes:['request:create','request:read']};

describe('P0 issued credential exact integration worklist handoff',()=>{
  it('passes the exact role-scoped integration and issued credential into its saved worklist',()=>{
    const handoff=makeIssuedCredentialHandoff('connection-A',[a,b],[token],receipt,1);
    expect(handoff.integrationId).toBe('connection-A');
    expect(handoff.integrationName).toBe('Control receiver');
    expect(handoff.selectedCredentialId).toBe('issued-42');
    expect(handoff.rows).toEqual([token]);
    const gate=createCredentialReadGate(),shown:string[]=[];
    expect(acceptIssuedCredentialHandoff(gate,handoff,0,
      value=>shown.push(value.selectedCredentialId))).toBe(1);
    expect(gate.isSelected('connection-A')).toBe(true);
    expect(shown).toEqual(['issued-42']);
  });
  it('matches the same exact scoped permissions after backend sorted-set storage',()=>{
    // issue_token returns the reviewed order while list_tokens returns
    // sorted(set(scopes)); order is not a privilege or identity difference.
    const reviewed={id:'executor-token',
      scopes:['request:read','grant:consume','result:write']};
    const saved={...token,id:reviewed.id,
      scopes:['grant:consume','request:read','result:write']};
    const handoff=makeIssuedCredentialHandoff('connection-A',[a],[saved],reviewed,11);
    expect(handoff.selectedCredentialId).toBe('executor-token');
    const mismatched=makeIssuedCredentialHandoff('connection-A',[a],
      [{...saved,scopes:['grant:consume','request:read']}],reviewed,12);
    expect(mismatched.selectedCredentialId).toBe('');
  });
  it('never carries the raw credential secret even from extra API fields',()=>{
    const fromServer={...token,token:'raw-password-MUST-NOT-LEAK',
      secret:'also-private',integration_id:'connection-B'};
    const handoff=makeIssuedCredentialHandoff('connection-A',[a],[fromServer],receipt,3);
    expect(JSON.stringify(handoff)).not.toContain('raw-password-MUST-NOT-LEAK');
    expect(JSON.stringify(handoff)).not.toContain('also-private');
    expect(handoff.rows).toEqual([token]);
  });
  it('rejects missing selected integration and malformed or duplicate credential IDs',()=>{
    expect(()=>makeIssuedCredentialHandoff('connection-A',[b],[token],receipt,1))
      .toThrow('CREDENTIAL_HANDOFF_INTEGRATION_MISSING');
    for(const rows of [[token,token], [{...token,id:''}],
      [{...token,scopes:['request:read',123]}],
      [{...token,created_at:Infinity}]]) {
      expect(()=>makeIssuedCredentialHandoff('connection-A',[a],
        rows as typeof token[],receipt,1)).toThrow('CREDENTIAL_HANDOFF_METADATA_INVALID');
    }
  });
  it('does not claim an exact new token when saved metadata is absent, revoked, or has other scopes',()=>{
    for(const metadata of [[],[{...token,enabled:false}],
      [{...token,scopes:['grant:consume']}], [{...token,id:'other-42'}]]) {
      const handoff=makeIssuedCredentialHandoff('connection-A',[a],metadata,receipt,2);
      expect(handoff.selectedCredentialId).toBe('');
      expect(handoff.expectedCredentialId).toBe('issued-42');
      const html=renderToStaticMarkup(createElement(IssuedCredentialHandoffNotice,{handoff}));
      expect(html).toContain('not yet verified in saved credentials');
      expect(html).not.toContain('raw-password');
    }
  });
  it('allows an ambiguous POST to inspect worklist without pretending any ID is confirmed',()=>{
    const handoff=makeIssuedCredentialHandoff('connection-A',[a],[token],null,4);
    expect(handoff.selectedCredentialId).toBe('');
    expect(handoff.expectedCredentialId).toBe('');
    const html=renderToStaticMarkup(createElement(IssuedCredentialHandoffNotice,{handoff}));
    expect(html).toContain('no issuance receipt');
    expect(html).not.toContain('issued-42');
  });
  it('takes latest handoff and invalidates an overlapping old integration GET',async()=>{
    const gate=createCredentialReadGate();
    gate.select('connection-B');
    let resolveA!:(rows:typeof token[])=>void;
    const slow=new Promise<typeof token[]>(done=>{resolveA=done;});
    const rendered:string[]=[];
    const old=readScopedCredentials(gate,'connection-B',()=>slow,
      value=>rendered.push(value[0].id));
    const handoff=makeIssuedCredentialHandoff('connection-A',[a,b],[token],receipt,2);
    const sequence=acceptIssuedCredentialHandoff(gate,handoff,1,
      value=>rendered.push(value.selectedCredentialId));
    expect(sequence).toBe(2);
    expect(acceptIssuedCredentialHandoff(gate,handoff,sequence,
      ()=>{throw Error('duplicate handoff');})).toBe(sequence);
    resolveA([{...token,id:'other-connection-token'}]);
    expect(await old).toBe(false);
    expect(rendered).toEqual(['issued-42']);
  });
  it('stale same-integration GET cannot supersede the transferred saved projection',async()=>{
    const gate=createCredentialReadGate();gate.select('connection-A');
    let resolveOld!:(rows:typeof token[])=>void;
    const slow=new Promise<typeof token[]>(done=>{resolveOld=done;});
    const seen:string[]=[];
    const old=readScopedCredentials(gate,'connection-A',()=>slow,
      rows=>seen.push(rows[0].id));
    const handoff=makeIssuedCredentialHandoff('connection-A',[a],[token],receipt,12);
    acceptIssuedCredentialHandoff(gate,handoff,11,
      fresh=>seen.push(fresh.selectedCredentialId));
    resolveOld([{...token,id:'stale-token'}]);
    expect(await old).toBe(false);
    expect(seen).toEqual(['issued-42']);
  });
  it('offers read-only inspect selection next to a separately reviewed revoke',()=>{
    const html=renderToStaticMarkup(createElement(CredentialWorklist,{
      rows:[token,{...token,id:'revoked-old',enabled:false}],
      busy:false,selectedId:'issued-42',
      onSelect:()=>undefined,onReviewRevoke:()=>undefined,
    }));
    expect(html).toContain('Selected');
    expect(html).toContain('Inspect metadata');
    expect(html).toContain('Review revoke');
    expect(html).toContain('Revoked credential history');
    expect(html).not.toContain('Confirm revoke');
    expect(html).not.toContain('raw-password');
  });
  it('shows selected saved ID/scopes/status in a read-only handoff without another POST',()=>{
    const handoff=makeIssuedCredentialHandoff('connection-A',[a],[token],receipt,7);
    const notice=renderToStaticMarkup(createElement(IssuedCredentialHandoffNotice,{handoff}));
    const details=renderToStaticMarkup(createElement(SelectedCredentialMetadata,{
      integrationId:'connection-A',credential:handoff.rows[0],
    }));
    expect(notice).toContain('Issued credentials');
    expect(notice).toContain('issued-42');
    expect(details).toContain('connection-A');
    expect(details).toContain('issued-42');
    expect(details).toContain('request:create');
    expect(details).not.toContain('Confirm revoke');
    expect(details).not.toContain('raw-password');
  });
  it('escapes untrusted integration names and metadata in display',()=>{
    const handoff=makeIssuedCredentialHandoff('connection-A',
      [{...a,name:'<script>alert(1)</script>'}],[{...token,scopes:['<img src=x>']}],
      null,9);
    const html=renderToStaticMarkup(createElement(IssuedCredentialHandoffNotice,{handoff}));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    const details=renderToStaticMarkup(createElement(SelectedCredentialMetadata,{
      integrationId:'connection-A',credential:handoff.rows[0],
    }));
    expect(details).toContain('&lt;img');
    expect(details).not.toContain('<img src=x>');
  });
});
