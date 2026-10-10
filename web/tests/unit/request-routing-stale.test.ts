import {describe,expect,it} from 'vitest';
import {prepareEscalationUpdate,type EscalationReview} from '../../src/request_admin';

const staged: EscalationReview = {
  kind: 'escalation', target: 'group:group-1',
  afterSeconds: 3600, revision: 7,
};
describe('G4 reviewed request routing revisions',()=>{
  it('sends the exact reviewed revision when scheduling a group',()=>{
    expect(prepareEscalationUpdate(staged,7)).toEqual({
      target_group_id: 'group-1', after_seconds: 3600, expected_revision: 7,
    });
    expect(prepareEscalationUpdate({...staged,target:'user:person-1'},7)).toEqual({
      target_user_id: 'person-1', after_seconds: 3600, expected_revision: 7,
    });
  });
  it('rejects stale or invalid routing reviews before sending an HTTP mutation',()=>{
    expect(()=>prepareEscalationUpdate(staged,8)).toThrow('ROUTING_CHANGED_REVIEW_REQUIRED');
    expect(()=>prepareEscalationUpdate({...staged,revision:0},0)).toThrow('ROUTING_CHANGED_REVIEW_REQUIRED');
    expect(()=>prepareEscalationUpdate({...staged,target:'wrong:id'},7)).toThrow('ESCALATION_DRAFT_INVALID');
    expect(()=>prepareEscalationUpdate({...staged,afterSeconds:1},7)).toThrow('ESCALATION_DRAFT_INVALID');
  });
});
