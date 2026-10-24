import { describe, expect, it } from 'vitest';
import {
  prepareRequestCreationReview,
  isCurrentRequestCreationReview,
  submitReviewedRequestCreationWithFreshRead,
  type NewRequestDraft,
} from '../../src/request_creation_review';
import type { Profile } from '../../src/types';

const profile: Profile = {
  id: 'parameter-policy', version_id: 'parameter-v1', version: 1,
  name: 'Parameter fidelity', integration_id: 'parameter-integration',
  approver_id: 'reviewer', approval_mode: 'SINGLE', approver_group_id: null,
  approvals_required: null, action_kind: 'service.restart', email_template_id: null,
  deadline_seconds: 3600, reminder_seconds: 600, max_reminders: 2,
  grant_seconds: 1800, tenant_selector: '', environment: '', severity: '',
  risk_level: '', lifecycle: 'ACTIVE', enabled: true,
};
function draft(parameters: string): NewRequestDraft {
  return {
    profile, predecessor: null, title: 'Review exact parameters',
    target: 'private-test-service', external: 'parameter-review-only',
    parameters, reason: '', sourceTenant: '', environment: '', severity: '', riskLevel: '',
  };
}

describe('Action parameter fidelity before final request review', () => {
  it.each([
    ['overflow', '{"limit":1e400}'],
    ['negative overflow', '{"limit":-1e400}'],
    ['underflow', '{"limit":1e-400}'],
    ['negative underflow', '{"limit":-1e-400}'],
    ['rounded large integer', '{"record_id":9007199254740993}'],
    ['outside API integer range', '{"record_id":9007199254740992}'],
    ['negative outside API integer range', '{"record_id":-9007199254740992}'],
    ['fractional value unsupported by API', '{"amount":0.125}'],
    ['fraction rounded to one', '{"amount":1.0000000000000001}'],
    ['fraction rounded to maximum safe integer', '{"amount":9007199254740991.1}'],
    ['duplicate root key', '{"target":"first","target":"second"}'],
    ['duplicate nested array object key', '{"settings":[{"name":1,"name":2}]}'],
    ['duplicate decoded escaped key', '{"settings":[{"name":1,"\\u006eame":2}]}'],
    ['duplicate empty key', '{"":1,"":2}'],
  ])('rejects %s without changing the editor text', (_name, parameters) => {
    const input = draft(parameters);
    expect(() => prepareRequestCreationReview(input)).toThrow();
    expect(input.parameters).toBe(parameters);
  });

  it.each([
    ['ordinary nested values', '{"limit":125,"whole":1e3,"arr":[true,null,"한글",{"step":2}]}',
      { limit: 125, whole: 1000, arr: [true, null, '한글', { step: 2 }] }],
    ['safe integer boundaries', '{"maximum":9007199254740991,"minimum":-9007199254740991}',
      { maximum: 9007199254740991, minimum: -9007199254740991 }],
    ['equivalent integer notation', '{"a":1.000,"b":100e-2,"c":10e+2,"d":-0,"e":0e99999}',
      { a: 1, b: 1, c: 1000, d: 0, e: 0 }],
    ['quoted numeric identifiers', '{"record_id":"9007199254740993","huge":"1e400"}',
      { record_id: '9007199254740993', huge: '1e400' }],
    ['same keys in different objects', '{"left":{"same":1},"right":{"same":2}}',
      { left: { same: 1 }, right: { same: 2 } }],
    ['JSON-looking text', '{"text":"{\\"same\\":1,\\"same\\":2} and 1e400"}',
      { text: '{"same":1,"same":2} and 1e400' }],
  ])('preserves %s in the exact serialized payload', (_name, parameters, expected) => {
    const input = draft(parameters as string);
    const review = prepareRequestCreationReview(input);
    expect(JSON.parse(JSON.stringify(review.payload.action.parameters))).toEqual(expected);
    expect(input.parameters).toBe(parameters);
    expect(isCurrentRequestCreationReview(review, input)).toBe(true);
  });

  it('keeps prototype-like keys as inert own JSON properties', () => {
    const review = prepareRequestCreationReview(draft('{"__proto__":{"flag":1},"constructor":{"flag":2}}'));
    const parameters = review.payload.action.parameters;
    expect(Object.getPrototypeOf(parameters)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(parameters, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parameters, 'constructor')).toBe(true);
    expect(JSON.stringify(parameters)).toBe('{"__proto__":{"flag":1},"constructor":{"flag":2}}');
    expect(({} as Record<string, unknown>).flag).toBeUndefined();
  });

  it('reports the invalid parameter path without echoing its numeric value', () => {
    expect(() => prepareRequestCreationReview(draft('{"settings":[{"limit":1e400}]}')))
      .toThrow(/\$\.settings\[0\]\.limit/);
    try {
      prepareRequestCreationReview(draft('{"settings":[{"limit":1e400}]}'));
    } catch (error) {
      expect((error as Error).message).not.toContain('1e400');
    }
  });

  it('keeps duplicate-key error locations bounded for long user-supplied names', () => {
    const key = 'field'.repeat(800);
    const source = '{' + JSON.stringify(key) + ':1,' + JSON.stringify(key) + ':2}';
    try {
      prepareRequestCreationReview(draft(source));
      expect.fail('duplicate key must not reach confirmation');
    } catch (error) {
      expect((error as Error).message).toMatch(/Duplicate/);
      expect((error as Error).message.length).toBeLessThan(300);
    }
  });

  it('applies the existing backend depth bound without overflowing the browser stack', () => {
    const allowed = '{"a":'.repeat(6) + '1' + '}'.repeat(6);
    expect(prepareRequestCreationReview(draft(allowed)).payload.action.parameters).toBeTruthy();
    const tooDeep = '{"a":'.repeat(7) + '1' + '}'.repeat(7);
    expect(() => prepareRequestCreationReview(draft(tooDeep))).toThrow(/nested|depth/i);
    const extreme = '{"a":' + '['.repeat(3000) + '1' + ']'.repeat(3000) + '}';
    expect(() => prepareRequestCreationReview(draft(extreme))).toThrow(/nested|depth/i);
  });

  it('invalidates an earlier review and never reads or posts after lossy input replaces it', async () => {
    const original = draft('{"limit":1}');
    const review = prepareRequestCreationReview(original);
    const changed = draft('{"limit":1.0000000000000001}');
    const calls: string[] = [];
    expect(isCurrentRequestCreationReview(review, changed)).toBe(false);
    await expect(submitReviewedRequestCreationWithFreshRead(
      review, changed,
      async () => { calls.push('GET'); return { policy: profile, predecessor: null }; },
      async () => { calls.push('POST'); return {}; },
    )).rejects.toThrow('REQUEST_REVIEW_CHANGED');
    expect(calls).toEqual([]);
  });
});
