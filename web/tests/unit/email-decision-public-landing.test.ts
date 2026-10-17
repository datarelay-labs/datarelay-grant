import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {
  isEmailDecisionLandingPath,
  parseEmailDecisionLandingToken,
  PublicEmailDecisionLanding,
} from '../../src/email_decision_landing';
const token='A'.repeat(43);
const route='/api/v1/decision-intents/'+token;
describe('P0 human email PIN landing from actual issued API decision link',()=>{
  it('recognizes only the exact public capability page, not broader admin/API paths',()=>{
    expect(isEmailDecisionLandingPath(route)).toBe(true);
    for(const path of ['/','/home','/requests',
      '/api/v1/decision-intents/'+token+'/verify',
      '/api/v1/decision-intents/'+token+'/confirm',
      '/api/v1/decision-intents/',
      '/api/v1/decision-intents/'+token+'/otp/request']){
      expect(isEmailDecisionLandingPath(path)).toBe(false);
    }
  });
  it('strictly validates opaque URL token and rejects path injection/query/fragment',()=>{
    expect(parseEmailDecisionLandingToken(route)).toBe(token);
    for(const path of [
      '/api/v1/decision-intents/a',
      '/api/v1/decision-intents/'+token+'?search=x',
      '/api/v1/decision-intents/'+token+'#fragment',
      '/api/v1/decision-intents/'+token+'.json',
      '/api/v1/decision-intents/'+token+'%2Fother',
      '/api/v1/decision-intents/'+token+'/verify',
      '/api/v1/decision-intents/'+'B'.repeat(101),
      '/other/'+token,
    ])expect(parseEmailDecisionLandingToken(path)).toBeNull();
  });
  it('SSR is inert before effects; no PIN or recipient detail or token rendered',()=>{
    const html=renderToStaticMarkup(createElement(PublicEmailDecisionLanding,{token}));
    expect(html).toContain('Review approval request');
    expect(html).toContain('Checking the current approval link');
    expect(html).toContain('no decision is recorded by opening the link');
    expect(html).not.toContain(token);
    expect(html).not.toContain('Confirm Approve');
    expect(html).not.toContain('approved successfully');
  });
  it('unknown and malformed token renders generic unavailable state without preflight details',()=>{
    const html=renderToStaticMarkup(createElement(PublicEmailDecisionLanding,{token:'bad'}));
    expect(html).toContain('not available');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('Verification ready');
    expect(html).not.toContain('bad');
  });
  it('does not auto-open login, auto-send OTP, auto approve, or display target action before PIN',()=>{
    const html=renderToStaticMarkup(createElement(PublicEmailDecisionLanding,{token}));
    expect(html).not.toContain('datarelay.run');
    expect(html).not.toContain('Execute');
    expect(html).not.toContain('Request one-time code');
    expect(html).not.toContain('Target:');
  });
});
