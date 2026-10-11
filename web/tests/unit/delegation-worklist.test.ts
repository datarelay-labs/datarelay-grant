import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  partitionDelegationsForWork, DelegationWorklist,
} from '../../src/delegation_worklist';
import type { DelegationRow, DirectoryMember } from '../../src/delegation_review';
import type { User } from '../../src/types';
import { Delegations } from '../../src/delegations';

const member:User={id:'alice',username:'Alice',email:'a@example.invalid',
 role:'member',mfa_enabled:false};
const other:User={...member,id:'outsider',username:'Outsider'};
const admin:User={...member,id:'admin',username:'Admin',role:'admin'};
const people:DirectoryMember[]=[{id:'bob',username:'Bob'},{id:'charlie',username:'Charlie'}];
const current:DelegationRow={id:'current',delegator_id:'alice',substitute_id:'bob',
 starts_at:9000,ends_at:11000,revoked_at:null};
const upcoming:DelegationRow={...current,id:'upcoming',starts_at:12000,ends_at:15000};
const expired:DelegationRow={...current,id:'expired',starts_at:500,ends_at:1000};
const revoked:DelegationRow={...current,id:'revoked',revoked_at:9100};
const now=10000;
function html(rows:DelegationRow[], user:User=member) {
  return renderToStaticMarkup(createElement(DelegationWorklist,{
    rows,nowSeconds:now,user,directory:people,busy:false,
    onReviewRevoke:()=>undefined,onRefresh:()=>undefined,
  }));
}

describe('P0 My work delegation list-first active-vs-history task UI',()=>{
  it('mounts active work above the creation form on the actual Delegations page',()=>{
    const output=renderToStaticMarkup(createElement(Delegations,{user:member}));
    expect(output.indexOf('Active and scheduled delegations'))
      .toBeLessThan(output.indexOf('Delegate my approvals'));
    expect(output).toContain('Previous delegations (0)');
    expect(output).toContain('Review delegation');
  });

  it('separates current and scheduled from revoked/expired without altering backend roles',()=>{
    const result=partitionDelegationsForWork([expired,upcoming,revoked,current],now);
    expect(result.current.map(r=>r.id)).toEqual(['current','upcoming']);
    expect(result.history.map(r=>r.id).sort()).toEqual(['expired','revoked']);
  });

  it('renders currently actionable delegation and status before collapsed history',()=>{
    const output=html([revoked,upcoming,expired,current]);
    expect(output).toContain('Active and scheduled delegations');
    expect(output).toContain('Previous delegations');
    expect(output).toContain('1 Active');
    expect(output).toContain('1 Scheduled');
    expect(output).toContain('<details');
    expect(output).not.toContain('<details open=');
    expect(output.indexOf('Active and scheduled delegations')).toBeLessThan(
      output.indexOf('Previous delegations'));
    expect(output).toContain('Review revoke');
    expect(output).toContain('Alice');
    expect(output).toContain('Bob');
  });

  it('current list sorts expiring active work ahead of future scheduled work',()=>{
    const later={...current,id:'later',ends_at:14000};
    const output=partitionDelegationsForWork([upcoming,later,current],now);
    expect(output.current.map(r=>r.id)).toEqual(['current','later','upcoming']);
  });

  it('only renders revoke controls for the current delegator or authorized admin viewer',()=>{
    expect(html([current],member)).toContain('Review revoke');
    expect(html([current],admin)).toContain('Review revoke');
    expect(html([current],other)).not.toContain('Review revoke');
  });

  it('retains expired/revoked evidence as read-only history, never actionable',()=>{
    const output=html([expired,revoked]);
    expect(output).toContain('Expired');
    expect(output).toContain('Revoked');
    expect(output).not.toContain('Review revoke');
    expect(output).toContain('Previous delegations (2)');
  });

  it('renders a factual empty state without implying automatic approvals or access',()=>{
    const output=html([]);
    expect(output).toContain('No active or scheduled delegations');
    expect(output).toContain('Previous delegations (0)');
    expect(output).not.toContain('Execute');
    expect(output).not.toContain('Auto approve');
  });

  it('escapes untrusted user names and suppresses controls while a write is pending',()=>{
    const output=renderToStaticMarkup(createElement(DelegationWorklist,{
      rows:[current],nowSeconds:now,user:member,
      directory:[{id:'bob',username:'<img src=x onerror=alert(1)>'}],
      busy:true,onReviewRevoke:()=>undefined,onRefresh:()=>undefined,
    }));
    expect(output).toContain('&lt;img');
    expect(output).not.toContain('<img src=x');
    expect(output).toContain('disabled=""');
  });
});
