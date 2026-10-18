import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {
  EmailDecisionPortal,type EmailDecisionAdapter,
} from '../../src/email_decision_portal';
import type {EmailDecisionChoice} from '../../src/email_decision_flow';

function initial(choice:EmailDecisionChoice,pinDigits:4|6=4){
 const never=vi.fn(async()=>{throw Error('NEVER_AUTO_SEND');});
 const adapter:EmailDecisionAdapter={
  verifyPin:never,requestOtp:never,verifyOtp:never,
  verifyFreshMfa:never,confirm:never,
 };
 const html=renderToStaticMarkup(createElement(EmailDecisionPortal,{choice,adapter,pinDigits}));
 return {html,never};
}

describe('P0-2B mounted portal human intent is inert before explicit PIN',()=>{
 it.each([
  ['APPROVE','Approve'],['HOLD','Hold'],['DENY','Deny'],
 ] as const)('%s first renders PIN, not automatic %s', (choice,label)=>{
  const {html,never}=initial(choice);
  expect(html).toContain(label+' request');
  expect(html).toContain('Four-digit code from the email');
  expect(html).toContain('Verify code');
  expect(html).not.toContain('Confirm '+label);
  expect(html).not.toContain('Your decision was recorded');
  expect(never).not.toHaveBeenCalled();
 });
 it('PIN is four numeric masked characters and has disabled initial submit',()=>{
  const {html}=initial('APPROVE');
  expect(html).toContain('id="grant-email-pin"');
  expect(html).toContain('type="password"');
  expect(html).toContain('inputMode="numeric"');
  expect(html).toContain('pattern="[0-9]{4}"');
  expect(html).toContain('maxLength="4"');
  expect(html).toContain('disabled=""');
 });
 it('renders optional six-digit PIN as a masked, inert form while retaining four-digit default',()=>{
  const {html,never}=initial('APPROVE',6);
  expect(html).toContain('Six-digit code from the email');
  expect(html).toContain('pattern="[0-9]{6}"');
  expect(html).toContain('maxLength="6"');
  expect(html).toContain('type="password"');
  expect(html).toContain('disabled=""');
  expect(never).not.toHaveBeenCalled();
 });
 it('does not expose request summary, named person, OTP or fresh MFA before PIN',()=>{
  const {html}=initial('DENY');
  for(const forbidden of [
   'Verified request summary','grant-email-denial-reason',
   'grant-email-mfa','grant-email-otp','Request one-time code',
   'Verify fresh Grant TOTP','protected action has executed',
  ])expect(html).not.toContain(forbidden);
  expect(html).toContain('mailbox access, not personal identity');
 });
 it('server rendering never accesses network or mutates any decision adapter',()=>{
  const spy=vi.fn();
  vi.stubGlobal('fetch',spy);
  try{
   const {never}=initial('APPROVE');
   expect(spy).not.toHaveBeenCalled();
   expect(never).not.toHaveBeenCalled();
  }finally{vi.unstubAllGlobals();}
 });
});
