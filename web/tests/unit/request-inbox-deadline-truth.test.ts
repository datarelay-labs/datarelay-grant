import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import { InboxDeadlineTruth } from '../../src/request_inbox_deadline_truth';
import type { RequestRow } from '../../src/types';
const example={
  id:'request-1',state:'AWAITING',decision:null,
  deadline:1780000000,overdue:false,escalation:null,
} as RequestRow;
const render=(row:RequestRow)=>renderToStaticMarkup(createElement(InboxDeadlineTruth,{row}));
describe('B1 server-authored approval deadline is not external execution expiry',()=>{
  it('does not infer overdue from a past date when the server did not mark overdue',()=>{
    const html=render({...example,deadline:1000,overdue:false});
    expect(html).not.toContain('Approval overdue');
    expect(html).not.toContain('Approval overdue');
  });
  it('shows server-projected pending/held overdue truth without calculating a new overdue state',()=>{
    for(const state of ['AWAITING','HELD']){
      const html=render({...example,state,overdue:true});
      expect(html).toContain('Approval overdue');
      expect(html).not.toContain('Escalation due');
      expect(html).toContain('Decision deadline');
    }
  });
  it('identifies expired undecided request separately from expired approved grant',()=>{
    const undecided=render({...example,state:'EXPIRED',decision:null,overdue:false});
    expect(undecided).toContain('Approval expired without a decision');
    const expiredGrant=render({...example,state:'EXPIRED',decision:'APPROVED'});
    expect(expiredGrant).toContain('Grant expired after approval');
    expect(expiredGrant).not.toContain('Approval overdue');
    expect(expiredGrant).not.toContain('Approval overdue');
  });
  it('approved request does not become pending again because its old approval deadline passed',()=>{
    const html=render({...example,state:'APPROVED',decision:'APPROVED',deadline:1000});
    expect(html).toContain('Human decision complete');
    expect(html).not.toContain('Approval overdue');
  });
  it('reports unavailable decision deadline without creating a fabricated date',()=>{
    for(const deadline of [0,Number.NaN,Number.POSITIVE_INFINITY]){
      const html=render({...example,deadline});
      expect(html).toContain('Decision deadline unavailable');
      expect(html).not.toContain('Invalid Date');
    }
  });
  it('does not infer an overdue event from a completed escalation with no current overdue flag',()=>{
    const html=render({...example,overdue:false,
      escalation:{target_user_id:null,target_group_id:null,target_members:[],
        due_at:1500,fired_at:1510}});
    expect(html).toContain('Escalation recorded');
    expect(html).not.toContain('Approval overdue');
  });
});
