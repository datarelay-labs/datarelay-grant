import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {
  buildOperationsExceptionRows, OperationsExceptionWorklist,
  type OperationsExceptionKey,
} from '../../src/operations_exception_worklist';

const counts={
 delivery_failed:3,approved_unused:2,execution_unknown:1,
 execution_failed:0,expired:4,
};
describe('P0 Operations administrator exception task-first worklist',()=>{
 it('builds exact five server-backed queues with no fabricated severity rank',()=>{
  const rows=buildOperationsExceptionRows(counts);
  expect(rows).toHaveLength(5);
  expect(rows.map(row=>row.key)).toEqual([
   'delivery_failed','approved_unused','execution_unknown',
   'execution_failed','expired',
  ]);
  expect(rows.map(row=>row.queue)).toEqual([
   'delivery_failed','approved_unused','execution_unknown',
   'execution_failed','expired',
  ]);
  expect(rows.map(row=>row.count)).toEqual([3,2,1,0,4]);
  expect(rows.every(row=>!('rank' in row)&&!('severity' in row))).toBe(true);
 });
 it('treats absent invalid and noninteger counts as unavailable, never zero',()=>{
  const broken=buildOperationsExceptionRows({
   delivery_failed:-1,approved_unused:NaN,
   execution_unknown:2.5,execution_failed:Infinity,
  });
  expect(broken.map(row=>row.count)).toEqual([null,null,null,null,null]);
  const html=renderToStaticMarkup(createElement(OperationsExceptionWorklist,{
   counts:{delivery_failed:-1},onOpen:()=>undefined,
  }));
  expect(html).toContain('Unavailable');
  expect(html).not.toContain('0 affected');
  expect(html).not.toContain('Healthy');
 });
 it('shows exact current exception counts rather than NOC metrics cards',()=>{
  const html=renderToStaticMarkup(createElement(OperationsExceptionWorklist,{
   counts,onOpen:()=>undefined,
  }));
  for(const term of ['Exceptions to resolve','Delivery failed','Approved, not consumed',
    'Execution unknown','Execution failed','Approval expired',
    '3 affected','2 affected','1 affected','No matching requests']){
   expect(html).toContain(term);
  }
  expect(html).toContain('Open Delivery failed queue');
  expect(html).toContain('Open Execution unknown queue');
  expect(html).not.toContain('Mark as resolved');
  expect(html).not.toContain('Retry execution');
  expect(html).not.toContain('Confirm approval');
 });
 it('explains reported failure does not mean verified target effect',()=>{
  const html=renderToStaticMarkup(createElement(OperationsExceptionWorklist,{
   counts,onOpen:()=>undefined,
  }));
  expect(html).toContain('reported');
  expect(html).toContain('not independently verified');
  expect(html).toContain('Transport');
  expect(html).not.toContain('Executed successfully');
 });
 it('unloaded snapshot never presents any false healthy/zero state',()=>{
  const html=renderToStaticMarkup(createElement(OperationsExceptionWorklist,{
   counts:null,onOpen:()=>undefined,
  }));
  expect(html).toContain('Waiting for current administrator-scoped snapshot');
  expect(html).not.toContain('0 affected');
  expect(html).not.toContain('Healthy');
 });
 it('does not show an action outside of exactly defined 5 queues',()=>{
  const rows=buildOperationsExceptionRows({...counts,other_untrusted_queue:9});
  expect(rows).toHaveLength(5);
  expect(rows.some(row=>row.key==='other_untrusted_queue')).toBe(false);
 });
 it('does not invoke navigation, HTTP or mutation during rendering',()=>{
  const requested:string[]=[];
  renderToStaticMarkup(createElement(OperationsExceptionWorklist,{
   counts,onOpen:(name:OperationsExceptionKey)=>requested.push(name),
  }));
  expect(requested).toEqual([]);
 });
 it('escapes an unexpected string supplied as a count instead of HTML',()=>{
  const html=renderToStaticMarkup(createElement(OperationsExceptionWorklist,{
   counts:{...counts,delivery_failed:'<script>x</script>' as unknown as number},
   onOpen:()=>undefined,
  }));
  expect(html).not.toContain('<script>');
  expect(html).toContain('Unavailable');
 });
});
