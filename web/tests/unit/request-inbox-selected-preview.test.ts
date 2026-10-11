import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {RequestRow} from '../../src/types';
import {
  currentSelectedInboxRequest,
  InboxSelectedRequestPreview,
  type InboxPreviewSelection,
} from '../../src/request_inbox_selected_preview';

const request={
 id:'b7351642-7e12-4d23-8c8f-4979f5305501',
 title:'Rotate payment gateway credential',
 external_id:'REQ-42',
 requester_id:'req-user',
 action:{kind:'credential.rotate',target:'payments-prod',parameters:{}},
 reason:'Production change needs a human decision',
 state:'AWAITING',decision:null,execution_state:'NOT_STARTED',
 delivery_state:'PENDING',collaboration_state:'OPEN',
 approval_progress:{mode:'ANY_ONE',approved_count:0,required_count:1,
  total_members:2,waiting_on:'APPROVERS',
  waiting_approver_ids:[],waiting_approvers:[],group_name:'Production reviewers'},
 deadline:1781172200,created_at:1781110100,
} as RequestRow;
const selection:InboxPreviewSelection={query:'/requests?view=needs&offset=0',requestId:request.id};
const rows=[request];
describe('Competitor-inspired Entra/ServiceNow selected request preview in actual Inbox',()=>{
 it('only projects selected exact ID from current role-scoped saved query',()=>{
  expect(currentSelectedInboxRequest(selection,rows,selection.query,false)).toBe(request);
  expect(currentSelectedInboxRequest(selection,rows,selection.query+'&other=1',false)).toBeNull();
  expect(currentSelectedInboxRequest(selection,rows,selection.query,true)).toBeNull();
  expect(currentSelectedInboxRequest(selection,[],selection.query,false)).toBeNull();
  expect(currentSelectedInboxRequest({...selection,requestId:'wrong'},rows,selection.query,false)).toBeNull();
  expect(currentSelectedInboxRequest(null,rows,selection.query,false)).toBeNull();
 });
 it('rejects an untrusted selection for a different request with identical title',()=>{
  const impostor={...request,id:'different-request'};
  expect(currentSelectedInboxRequest(selection,[impostor],selection.query,false)).toBeNull();
 });
 it('shows immutable action and target before navigation plus current seat/deadline context',()=>{
  const html=renderToStaticMarkup(createElement(InboxSelectedRequestPreview,{
   row:request,onOpen:()=>undefined,onClose:()=>undefined,
  }));
  for(const text of ['Selected request context',request.title,'credential.rotate',
    'payments-prod','REQ-42','Production reviewers','0 / 1 approved',
    'Open full request','Close preview','Human decision','External execution']){
   expect(html).toContain(text);
  }
  expect(html).not.toContain('Execute</button>');
  expect(html).not.toContain('Confirm approve</button>');
 });
 it('does not claim execution when human approval or SMTP delivery is recorded',()=>{
  const html=renderToStaticMarkup(createElement(InboxSelectedRequestPreview,{
   row:{...request,state:'APPROVED',decision:'APPROVED',
    execution_state:'REPORTED_SUCCEEDED',delivery_state:'DELIVERED'},
   onOpen:()=>undefined,onClose:()=>undefined,
  }));
  expect(html).toContain('reported, not independently verified');
  expect(html).toContain('Transport only');
  expect(html).toContain('APPROVED');
  expect(html).toContain('REPORTED SUCCEEDED');
 });
 it('escapes untrusted request title, reason and action, with no raw parameters',()=>{
  const html=renderToStaticMarkup(createElement(InboxSelectedRequestPreview,{
   row:{...request,title:'<script>x</script>',reason:'<img src=x onerror=alert(1)>',
    action:{...request.action,target:'<b>unsafe</b>',parameters:{api_key:'secret sentinel'}}},
   onOpen:()=>undefined,onClose:()=>undefined,
  }));
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<b>unsafe');
  expect(html).not.toContain('secret sentinel');
  expect(html).toContain('&lt;script&gt;');
 });
 it('does not call navigation or API during read-only rendering',()=>{
  const actions:string[]=[];
  renderToStaticMarkup(createElement(InboxSelectedRequestPreview,{
   row:request,onOpen:()=>actions.push('open'),onClose:()=>actions.push('close'),
  }));
  expect(actions).toEqual([]);
 });
 it('invalid or empty row identity never appears as an actionable preview',()=>{
  expect(currentSelectedInboxRequest(
   {...selection,requestId:'../../audit'},rows,selection.query,false)).toBeNull();
  expect(currentSelectedInboxRequest(
   selection,[{...request,id:''}],selection.query,false)).toBeNull();
 });
});
