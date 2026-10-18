import {describe,it,expect} from 'vitest';
import {createEmailDesign} from '../../src/email_design';
import {addEmailContent,moveEmailContent,removeEmailContent} from '../../src/email_canvas_model';
describe('U1.05 bounded optional block authoring',()=>{
 it('adds at most three unique blocks and moves only within the explanatory region',()=>{
  const initial=createEmailDesign();let value=addEmailContent(initial);value=addEmailContent(value);value=addEmailContent(value);
  expect(value.shared_layout_revision).toBe(7);expect(Object.keys(value.optional_content!)).toEqual(['content_1','content_2','content_3']);
  expect(()=>addEmailContent(value)).toThrow();
  const moved=moveEmailContent(value,'content_3',-1);
  expect(moved.blocks).toEqual(['brand','heading','message','content_1','content_3','content_2','request_context','actions','verification','footer']);
  expect(moveEmailContent(value,'content_1',-1)).toEqual(value);
  expect(()=>moveEmailContent(value,'actions',-1)).toThrow();
  expect(()=>removeEmailContent(value,'verification')).toThrow();
  expect(initial.shared_layout_revision).toBe(5);expect(initial.blocks).toHaveLength(7);
 });
 it('removes content and reuses a free identity without changing wording or protected blocks',()=>{
  const first=addEmailContent(createEmailDesign());const removed=removeEmailContent(first,'content_1');
  expect(removed.blocks).toEqual(createEmailDesign().blocks);expect(removed.optional_content).toEqual({});
  expect(addEmailContent(removed).optional_content).toEqual(first.optional_content);
 });
});
