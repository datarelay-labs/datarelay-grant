import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createInboxReadScope, readCurrentInbox, currentInboxProjection,
  InboxActionTarget, InboxApprovalProgress,
} from '../../src/request_inbox_task_worklist';
import type { RequestRow } from '../../src/types';

const row={
  id:'request-A',title:'Authorize maintenance',
  action:{kind:'service.restart',target:'srv-123',parameters:{force:false}},
  state:'AWAITING', deadline:1000,
  approval_progress:{approved_count:1,required_count:2,total_members:3,
    waiting_on:'APPROVERS',group_name:'SRE rotation',
    waiting_approvers:[{id:'user-2',username:'Sam Reviewer'}],
    waiting_approver_ids:['user-2'],mode:'N_OF_M'},
} as RequestRow;
function later<T>(){let resolve!:(v:T)=>void,reject!:(e:Error)=>void;
  const promise=new Promise<T>((ok,no)=>{resolve=ok;reject=no});
  return {promise,resolve,reject};}
describe('B1 role-scoped approver Inbox task-first authoritative read',()=>{
  it('late filter A cannot display records on newly selected filter B',async()=>{
    const scope=createInboxReadScope(),pending=later<RequestRow[]>(),shown:string[]=[];
    scope.select('/requests?view=needs');
    const old=readCurrentInbox(scope,'/requests?view=needs',()=>pending.promise,
      rows=>shown.push(rows[0]?.id??'none'));
    scope.select('/requests?view=held');
    expect(await readCurrentInbox(scope,'/requests?view=held',
      async()=>[{...row,id:'request-held'}],
      rows=>shown.push(rows[0]?.id??'none'))).toBe(true);
    pending.resolve([row]);
    expect(await old).toBe(false);
    expect(shown).toEqual(['request-held']);
  });
  it('latest same query supersedes older response and obsolete request error',async()=>{
    const scope=createInboxReadScope(),pending=later<RequestRow[]>(),shown:string[]=[];
    scope.select('/requests?view=needs');
    const old=readCurrentInbox(scope,'/requests?view=needs',()=>pending.promise,
      rows=>shown.push(rows[0]?.id??'none'));
    const latest=readCurrentInbox(scope,'/requests?view=needs',
      async()=>[{...row,id:'newest'}],
      rows=>shown.push(rows[0]?.id??'none'));
    pending.reject(Error('outdated network error'));
    expect(await latest).toBe(true);
    expect(await old).toBe(false);
    expect(shown).toEqual(['newest']);
  });
  it('old row projection is hidden on first render of a different query',()=>{
    const old={key:'/requests?view=needs',rows:[row]};
    expect(currentInboxProjection(old,'/requests?view=needs')).toEqual([row]);
    expect(currentInboxProjection(old,'/requests?view=held')).toEqual([]);
    expect(currentInboxProjection(old,'')).toEqual([]);
  });
  it('empty or stale query never starts an unauthorized API request',async()=>{
    const scope=createInboxReadScope();scope.select('/requests?view=held');
    let count=0;
    expect(await readCurrentInbox(scope,'/requests?view=needs',
      async()=>{count++;return [row];},()=>undefined)).toBe(false);
    scope.select('');
    expect(await readCurrentInbox(scope,'',
      async()=>{count++;return [row];},()=>undefined)).toBe(false);
    expect(count).toBe(0);
  });
  it('malformed server response cannot replace a current worklist',async()=>{
    const scope=createInboxReadScope();scope.select('/requests?view=needs');
    let shown=0;
    await expect(readCurrentInbox(scope,'/requests?view=needs',
      async()=>({id:'bad'} as unknown as RequestRow[]),
      ()=>{shown++})).rejects.toThrow('INBOX_READ_INVALID');
    expect(shown).toBe(0);
  });
  it('task summary shows immutable exact action and target, not execute permission',()=>{
    const html=renderToStaticMarkup(createElement(InboxActionTarget,{row}));
    expect(html).toContain('service.restart');
    expect(html).toContain('srv-123');
    expect(html).not.toContain('Execute</button>');
    expect(html).not.toContain('Approve</button>');
  });
  it('missing or malformed approval projection never fabricates 0/1 seats',()=>{
    for(const broken of [
      {...row,approval_progress:undefined},
      {...row,approval_progress:{...row.approval_progress,required_count:0}},
      {...row,approval_progress:{...row.approval_progress,approved_count:8}},
    ]){
      const html=renderToStaticMarkup(createElement(InboxApprovalProgress,{row:broken}));
      expect(html).toContain('Approval progress unavailable');
      expect(html).not.toContain('0 / 1 approved');
    }
  });
  it('valid projected seats show actual quorum, remaining actors and reason only',()=>{
    const html=renderToStaticMarkup(createElement(InboxApprovalProgress,{row}));
    expect(html).toContain('1 / 2 approved');
    expect(html).toContain('SRE rotation');
    expect(html).toContain('Sam Reviewer');
    expect(html).toContain('Waiting on approvers');
  });
  it('escapes untrusted target and group names rather than rendering arbitrary HTML',()=>{
    const malicious={...row,action:{...row.action,target:'<img src=x onerror=alert(1)>'},
      approval_progress:{...row.approval_progress,group_name:'<script>x</script>'}} as RequestRow;
    const action=renderToStaticMarkup(createElement(InboxActionTarget,{row:malicious}));
    const seats=renderToStaticMarkup(createElement(InboxApprovalProgress,{row:malicious}));
    expect(action).toContain('&lt;img');
    expect(action).not.toContain('<img src=x');
    expect(seats).toContain('&lt;script&gt;');
    expect(seats).not.toContain('<script>');
  });
});
