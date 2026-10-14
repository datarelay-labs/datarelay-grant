import {describe,expect,test} from 'vitest';
import {
  createAccountCreationReview,
  GRANT_PASSWORD_GUIDANCE,
  GRANT_PASSWORD_PATTERN,
  isValidGrantPassword,
} from '../../src/admin_account_create_review';

const admin={
  id:'admin-id',
  username:'admin',
  email:'admin@example.invalid',
  role:'admin',
  mfa_enabled:false,
} as const;

describe('Grant password policy',()=>{
  test('requires 8+ chars with uppercase, number and special character',()=>{
    expect(isValidGrantPassword('Stellar1!')).toBe(true);
    expect(isValidGrantPassword('A1!bcdef')).toBe(true);
    for(const password of ['Stellar1','stellar1!','Stellar!!','A1!bcde']){
      expect(isValidGrantPassword(password)).toBe(false);
    }
    expect(GRANT_PASSWORD_PATTERN).toContain('{8,256}');
    expect(GRANT_PASSWORD_GUIDANCE).toContain('uppercase');
    expect(GRANT_PASSWORD_GUIDANCE).toContain('number');
    expect(GRANT_PASSWORD_GUIDANCE).toContain('special');
  });

  test('account creation review uses the same policy',()=>{
    expect(()=>createAccountCreationReview(
      admin as any,'new-user','new-user@example.invalid','member','Stellar1!'
    )).not.toThrow();
    expect(()=>createAccountCreationReview(
      admin as any,'new-user','new-user@example.invalid','member','Stellar1'
    )).toThrow('ACCOUNT_CREATE_REVIEW_UNAVAILABLE');
  });
});
