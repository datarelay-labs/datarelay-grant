import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {RequestGrantScope} from '../../src/request_grant_scope';
import {RequestDetailOverview} from '../../src/request_detail_overview';
import type {RequestRow} from '../../src/types';

const baseline: RequestRow = {
  id:'00000000-0000-4000-8000-000000000001', external_id:'REQUEST-100',
  integration_id:'i1', profile_id:'p1', requester_id:'requester',
  approver_id:'reviewer', title:'Approve service deployment', reason:'Patch',
  action:{kind:'service.deploy',target:'application.example',parameters:{}},
  action_hash:'immutable-fingerprint', source:{}, state:'AWAITING',
  collaboration_state:'OPEN',decision:null,decision_actor:null,decision_at:null,
  revision:1,created_at:100,deadline:1000,grant_until:null,
  predecessor_id:null,execution_id:null,execution_state:'NOT_STARTED',
  execution_result:null,delivery_state:'PENDING',
};
const render = (changes: Partial<RequestRow> = {}) => renderToStaticMarkup(
  createElement(RequestGrantScope,{row:{...baseline,...changes}}));

describe('P0-2E StrongDM/Teleport bounded authorization context',()=>{
  it('pending requests disclose no grant and do not imply approved or execution state',()=>{
    const html=render();
    expect(html).toContain('Execution grant scope and validity');
    expect(html).toContain('No current execution grant recorded');
    expect(html).not.toContain('Grant expires');
    expect(html).not.toContain('Active execution grant');
    expect(html).not.toContain('<button');
  });
  it('approved requests show the exact action boundary and server-recorded end without claiming an effect',()=>{
    const html=render({state:'APPROVED',decision:'APPROVED',grant_until:2200000000,
      execution_state:'REPORTED_SUCCEEDED',execution_result:{status:'ok',evidence:'self-report'}});
    expect(html).toContain('Granted for this immutable action');
    expect(html).toContain('service.deploy');
    expect(html).toContain('application.example');
    expect(html).toContain('Grant expires (server recorded)');
    expect(html).toContain('Connected systems execute separately');
    expect(html).not.toContain('Verified execution');
    expect(html).not.toContain('Active execution grant');
    expect(html).not.toContain('self-report');
  });
  it('expired approved grant is historical, never another overdue human approval',()=>{
    const html=render({state:'EXPIRED',decision:'APPROVED',grant_until:1800000000,overdue:true});
    expect(html).toContain('Previously approved grant expired');
    expect(html).toContain('Recorded grant end');
    expect(html).not.toContain('No current execution grant recorded');
    expect(html).not.toContain('Active execution grant');
    expect(html).not.toContain('Escalation due');
  });
  it('approved state with missing or corrupt duration fails closed and never invents an end',()=>{
    for(const grant_until of [null,0,Number.NaN,Number.POSITIVE_INFINITY,-1]){
      const html=render({state:'APPROVED',decision:'APPROVED',grant_until});
      expect(html).toContain('Grant validity unavailable — verify server state before execution');
      expect(html).not.toContain('Grant expires (server recorded)');
      expect(html).not.toContain('Invalid Date');
      expect(html).not.toContain('Active execution grant');
    }
  });
  it('never resurrects revoked/denied/held authorization from stale timestamps',()=>{
    for(const state of ['DENIED','HELD','CANCELLED']){
      const html=render({state,decision:'APPROVED',grant_until:2200000000});
      expect(html).toContain('No current execution grant recorded');
      expect(html).not.toContain('Granted for this immutable action');
      expect(html).not.toContain('Grant expires');
    }
  });
  it('preserves escaping of untrusted action identity and exposes no mutation control',()=>{
    const html=render({state:'APPROVED',decision:'APPROVED',grant_until:2200000000,
      action:{kind:'<script>alert(1)</script>',target:'<img src=x onerror=alert(1)>',parameters:{secret:'not-to-show'}}});
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('not-to-show');
    expect(html).not.toContain('<button');
  });
  it('is mounted on real Request Detail below task action, not a standalone mockup',()=>{
    const html=renderToStaticMarkup(createElement(RequestDetailOverview,{
      row:{...baseline,state:'APPROVED',decision:'APPROVED',grant_until:2200000000},
      canReplace:false,navigate:()=>undefined,
    }));
    expect(html).toContain('Execution grant scope and validity');
    expect(html.indexOf('Exact action requiring approval')).toBeLessThan(
      html.indexOf('Execution grant scope and validity'));
    expect(html).toContain('Grant expires (server recorded)');
    expect(html).not.toContain('Execute</button>');
  });
});
