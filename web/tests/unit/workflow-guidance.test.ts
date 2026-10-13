import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {HomeGettingStarted} from '../../src/home_getting_started';
import {RequestWorkflowGuide,RequestIntakeSteps} from '../../src/request_workflow_guide';
import {NewRequest} from '../../src/requests';
import {RequestDetailOverview} from '../../src/request_detail_overview';
import type {HomeWorkspace} from '../../src/home_pages';
import type {RequestRow,User} from '../../src/types';

const user:User={id:'requester',username:'newcomer',email:'user@example.invalid',role:'member',mfa_enabled:false};
const view:HomeWorkspace={decisions:[],overdue:[],submitted:[],needsResponse:[],recent:[],deliveryFailures:[],approvedUnused:[],executionUnknown:[],executionFailed:[],executionExceptions:[]};
const row:RequestRow={id:'00000000-0000-4000-8000-000000000001',external_id:'fixture.1',integration_id:'integration',profile_id:'policy',requester_id:'requester',approver_id:'approver',title:'Restart reports',reason:'Release test',action:{kind:'service.restart',target:'report-host',parameters:{}},action_hash:'sha256',source:{},state:'APPROVED',collaboration_state:'OPEN',decision:'APPROVED',decision_actor:'approver',decision_at:20,revision:1,created_at:10,deadline:1000,grant_until:2000,predecessor_id:null,execution_id:null,execution_state:'NOT_STARTED',execution_result:null,delivery_state:'DELIVERED',approval_progress:{mode:'SINGLE',approved_count:1,required_count:1,total_members:1,waiting_approver_ids:[],waiting_approvers:[],group_name:null,waiting_on:'EXECUTOR'}};

describe('Guided Grant workflow for a first-time user',()=>{
 it('places three discoverable role-safe starting points ahead of the work list',()=>{
  const navigate=vi.fn();
  const html=renderToStaticMarkup(createElement(HomeGettingStarted,{user,view,navigate}));
  expect(html).toContain('Start here');
  for(const value of ['Create approval request','Review assigned work','Track my requests','01','02','03']) expect(html).toContain(value);
  expect(html).not.toContain('Execute now');
  expect(html).not.toContain('Approve now');
  expect(navigate).not.toHaveBeenCalled();
 });
 it('does not claim exact approval totals when Home loaded only a bounded subset',()=>{
  const html=renderToStaticMarkup(createElement(HomeGettingStarted,{
    user,view:{...view,decisions:[row],submitted:[row]},summaryComplete:false,navigate:vi.fn(),
  }));
  expect(html).toContain('At least 1 approval');
  expect(html).toContain('At least 1 request');
 });
 it('makes active policy then essential fields then explicit review distinguishable',()=>{
  const html=renderToStaticMarkup(createElement(RequestIntakeSteps,{policySelected:true,detailsEntered:false}));
  expect(html).toContain('Request creation progress');
  expect(html).toContain('Choose policy');
  expect(html).toContain('Describe action');
  expect(html).toContain('Review before creating');
  expect(html).not.toContain('Auto approve');
 });
 it('shows exact decision, callback transport and UNVERIFIED external outcome separately',()=>{
  const html=renderToStaticMarkup(createElement(RequestWorkflowGuide,{row}));
  for(const value of ['Human decision','Notification transport','External result','APPROVED','DELIVERED','NOT STARTED']) expect(html).toContain(value);
  expect(html).toContain('not proof of execution');
  expect(html).not.toContain('Execution verified');
  expect(html).not.toContain('Execute</button>');
 });
 it('keeps advanced JSON and auto-generated identifiers available but closed by default',()=>{
  const html=renderToStaticMarkup(createElement(NewRequest,{navigate:vi.fn()}));
  expect(html).toContain('Advanced integration details');
  expect(html).toContain('External request ID');
  expect(html).toContain('Action parameters (JSON object; no credentials)');
  expect(html).toMatch(/<details[^>]*class="grant-intake-advanced"[^>]*>/);
  expect(html).not.toMatch(/<details[^>]*class="grant-intake-advanced"[^>]* open/);
  expect(html).toContain('Review request');
  expect(html).not.toContain('Approve request</button>');
 });
 it('retains deadline and exact-action evidence while adding legible progress',()=>{
  const html=renderToStaticMarkup(createElement(RequestDetailOverview,{row,canReplace:false,navigate:vi.fn()}));
  expect(html).toContain('Exact action requiring approval');
  expect(html).toContain('Decision status and deadline');
  expect(html).toContain('Approval deadline');
  expect(html).toContain('Review current status');
  expect(html).not.toContain('Execution verified');
 });
});
