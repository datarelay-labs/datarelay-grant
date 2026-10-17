import {describe,it,expect} from 'vitest';
import {createEmailDesign} from '../../src/email_design';
import {applyEmailPreset,resetEmailAppearance,insertEmailVariable,createEmailHistory,emailVariableOptions} from '../../src/email_canvas_model';

describe('accepted canvas-first draft invariants',()=>{
 it('preserves copy, per-event headings, language and protected actions for every preset/reset',()=>{
  const original={...createEmailDesign(),locale:'ko' as const,heading:'Shared heading',footer:'Our footer',
   event_headings:{requested:'승인 요청',reminder:'Reminder'},button_suffixes:{approve:'Change',hold:'Later',deny:'Reason',details:'Read'}};
  for(const preset of ['standard','compact','high_visibility'] as const){
   const next=applyEmailPreset(original,preset);
   expect(next).toMatchObject({locale:'ko',heading:original.heading,footer:original.footer,event_headings:original.event_headings,button_suffixes:original.button_suffixes,blocks:original.blocks});
   expect(next.preset).toBe(preset);expect(next).not.toBe(original);
  }
  expect(resetEmailAppearance(original,'actions')).toMatchObject({locale:'ko',footer:original.footer,event_headings:original.event_headings});
  expect(original.preset).toBe('standard');
 });
 it('inserts only allowed variables at the intended field selection and honors its length limit',()=>{
  expect(insertEmailVariable('Hello world',6,11,'request_title',['request_title'],250)).toEqual({value:'Hello {{request_title}}',cursor:23});
  expect(()=>insertEmailVariable('Hello',0,0,'password',['request_title'],250)).toThrow();
  expect(()=>insertEmailVariable('x'.repeat(245),245,245,'target',['target'],250)).toThrow();
 });
 it('history snapshots the whole draft and invalidates redo on a new branch',()=>{
  const history=createEmailHistory<{subject:string;size:string}>();
  const first={subject:'Before',size:'M'},second={subject:'After',size:'L'};
  history.push(first);first.subject='external mutation';
  expect(history.undo(second)).toEqual({subject:'Before',size:'M'});
  expect(history.redo({subject:'Before',size:'M'})).toEqual(second);
  history.undo(second);history.push({subject:'Another',size:'S'});
  expect(history.canRedo()).toBe(false);
 });
 it('labels variables with synthetic examples and exposes only server allowlisted entries',()=>{
  expect(emailVariableOptions(['request_title','target'],'request')[0]).toMatchObject({key:'request_title',label:'Request title'});
  expect(emailVariableOptions(['target'],'request')).toHaveLength(0);
 });
});
