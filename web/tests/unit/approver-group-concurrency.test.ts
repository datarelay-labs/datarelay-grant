import {describe,expect,it} from 'vitest';
import {ApiError,errorText} from '../../src/api';
import {prepareApproverGroupUpdate} from '../../src/approvers';
import type {ApproverGroup} from '../../src/types';

const stored: ApproverGroup = {
  id: 'group-1', name: 'Escalation reviewers',
  member_ids: ['first','second'], enabled: true, updated_at: 1781132213.443,
};

describe('G3 administrator group revision integrity', () => {
  it('sends the exact loaded group revision, not a synthesized clock', () => {
    const payload=prepareApproverGroupUpdate(stored,'Renamed',['first','second','third']);
    expect(payload).toEqual({
      name: 'Renamed', member_ids: ['first','second','third'],
      expected_updated_at: stored.updated_at,
    });
    payload.member_ids.pop();
    expect(stored.member_ids).toEqual(['first','second']);
  });

  it('refuses to save without a valid authoritative group revision', () => {
    expect(()=>prepareApproverGroupUpdate(null,'Missing',['first'])).toThrow(
      'APPROVER_GROUP_VERSION_UNAVAILABLE',
    );
    for(const invalid of [0,NaN,Infinity,-1]){
      expect(()=>prepareApproverGroupUpdate(
        {...stored,updated_at:invalid},'Invalid',['first'],
      )).toThrow('APPROVER_GROUP_VERSION_UNAVAILABLE');
    }
  });

  it('explains conflicts as review-first and never tells the operator to retry blindly', () => {
    const message=errorText(new ApiError(409,'APPROVER_GROUP_STALE'));
    expect(message).toContain('Another administrator changed this group');
    expect(message).toContain('Review and reload');
  });
});
