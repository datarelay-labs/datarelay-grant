import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {ApproverGroup} from '../../src/types';
import {ApproverGroupDirectory,Approvers} from '../../src/approvers';
import {
  assessSavedGroupAccountCoverage,
  createApproverDirectoryReadScope,readCurrentApproverDirectory,
  ApproverGroupAccountCoverage,
} from '../../src/approver_group_directory_truth';

const group:ApproverGroup={
  id:'saved-group',name:'Production on-call',
  enabled:true,member_ids:['alice','bob','chris'],updated_at:1781132213,
};
const accounts=[
 {id:'alice',displayName:'Alice',status:'enabled'},
 {id:'bob',displayName:'Bob',status:'enabled'},
 {id:'chris',displayName:'Chris',status:'enabled'},
];
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:Error)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};}
describe('P0 Approver Groups source-truth directory',()=>{
 it('counts exactly saved unique members matched to currently enabled accounts',()=>{
  const state=assessSavedGroupAccountCoverage(group,accounts);
  expect(state.saved).toBe(3);
  expect(state.enabled).toBe(3);
  expect(state.unavailable).toBe(0);
  expect(state.status).toBe('current');
  expect(state.display).toContain('3 / 3 currently enabled accounts');
 });
 it('explicitly flags disabled or missing member instead of counting every saved ID as eligible',()=>{
  const state=assessSavedGroupAccountCoverage(group,[
    accounts[0],accounts[1],{...accounts[2],status:'disabled'},
  ]);
  expect(state.status).toBe('attention');
  expect(state.enabled).toBe(2);
  expect(state.unavailable).toBe(1);
  expect(state.display).toContain('1 member account unavailable');
  const missing=assessSavedGroupAccountCoverage(group,accounts.slice(0,2));
  expect(missing.unavailable).toBe(1);
 });
 it('rejects duplicate saved member identities rather than fabricating group quorum',()=>{
  const state=assessSavedGroupAccountCoverage({...group,member_ids:['alice','alice','bob']},accounts);
  expect(state.status).toBe('attention');
  expect(state.display).toContain('Repeated saved member identity');
  expect(state.enabled).toBeNull();
 });
 it('never asserts current account coverage while the account list is unavailable',()=>{
  const state=assessSavedGroupAccountCoverage(group,null);
  expect(state.saved).toBe(3);
  expect(state.enabled).toBeNull();
  expect(state.status).toBe('unverified');
  expect(state.display).toContain('Account status not checked');
 });
 it('keeps disabled groups distinct from current approval availability',()=>{
  const state=assessSavedGroupAccountCoverage({...group,enabled:false},accounts);
  expect(state.status).toBe('disabled');
  expect(state.display).toContain('Group disabled');
 });
 it('fails closed for empty identities, malformed group and invalid account identities',()=>{
  for(const ids of [[],['alice',''],['alice',' ']]){
   const state=assessSavedGroupAccountCoverage({...group,member_ids:ids},accounts);
   expect(state.status).toBe('attention');
   expect(state.enabled).toBeNull();
  }
  const corrupt=assessSavedGroupAccountCoverage(group,[{...accounts[0],id:''},accounts[1]]);
  expect(corrupt.status).toBe('unverified');
  expect(corrupt.enabled).toBeNull();
 });
 it('renders exact coverage warnings as read-only content and escapes untrusted labels',()=>{
  const html=renderToStaticMarkup(createElement(ApproverGroupAccountCoverage,{
    group:{...group,name:'<script>unsafe()</script>'},
    accounts:[accounts[0]],
  }));
  expect(html).toContain('2 member accounts unavailable');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('Approve</button>');
  expect(html).not.toContain('Save group</button>');
 });
 it('mounted directory shows saved count and enabled account source side by side',()=>{
  const html=renderToStaticMarkup(createElement(ApproverGroupDirectory,{
   groups:[group],accounts,loaded:true,search:'',busy:false,
   onSearchChange:()=>{},onOpen:()=>{},onCreate:()=>{},
  }));
  expect(html).toContain('Production on-call');
  expect(html).toContain('3 members');
  expect(html).toContain('3 / 3 currently enabled accounts');
  expect(html).toContain('Saved membership is not proof of current decision eligibility');
  expect(html).not.toContain('Approve</button>');
 });
 it('mount never invents an empty group list before both authenticated GETs finish',()=>{
  const initial=renderToStaticMarkup(createElement(Approvers));
  expect(initial).toContain('Loading current saved approver groups');
  expect(initial).not.toContain('No approver groups.');
  const html=renderToStaticMarkup(createElement(ApproverGroupDirectory,{
   groups:[],accounts:null,loaded:false,search:'',busy:true,
   onSearchChange:()=>{},onOpen:()=>{},onCreate:()=>{},
  }));
  expect(html).toContain('Loading current saved approver groups');
  expect(html).not.toContain('No approver groups.');
 });
 it('normalizes REAL SQLite GET enabled=1 to true and enabled=0 to false',async()=>{
  const gate=createApproverDirectoryReadScope();
  let shown:ApproverGroup[]=[];
  await readCurrentApproverDirectory(gate,
   async()=>({groups:[
    {...group,id:'numeric-enabled',enabled:1 as unknown as boolean},
    {...group,id:'numeric-disabled',enabled:0 as unknown as boolean},
   ],accounts}),
   value=>{shown=value.groups});
  expect(shown.map(row=>row.enabled)).toEqual([true,false]);
  expect(shown.every(row=>typeof row.enabled==='boolean')).toBe(true);
 });
 it('rejects unexpected SQLite enabled flags rather than guessing eligibility',async()=>{
  for(const unsafe of [2,-1,'1',null]){
   const gate=createApproverDirectoryReadScope();let presentations=0;
   await expect(readCurrentApproverDirectory(gate,
    async()=>({groups:[{...group,enabled:unsafe as boolean}],accounts}),
    ()=>{presentations++})).rejects.toThrow('APPROVER_DIRECTORY_INVALID');
   expect(presentations).toBe(0);
  }
 });
 it('drops stale concurrent directory GET responses and errors',async()=>{
  const gate=createApproverDirectoryReadScope(),old=deferred<{
    groups:ApproverGroup[];accounts:typeof accounts}>();
  const results:string[]=[];
  const a=readCurrentApproverDirectory(gate,()=>old.promise,
    result=>results.push(result.groups[0].name));
  expect(await readCurrentApproverDirectory(gate,
    async()=>({groups:[{...group,name:'Latest'}],accounts}),
    result=>results.push(result.groups[0].name))).toBe(true);
  old.reject(Error('old role read failed'));
  expect(await a).toBe(false);
  expect(results).toEqual(['Latest']);
 });
 it('rejects invalid group/account list projection without displaying a false zero-member directory',async()=>{
  const gate=createApproverDirectoryReadScope();
  let rendered=0;
  await expect(readCurrentApproverDirectory(gate,
    async()=>({groups:[{...group,id:''}],accounts}),
    ()=>{rendered++;})).rejects.toThrow('APPROVER_DIRECTORY_INVALID');
  expect(rendered).toBe(0);
 });
});
