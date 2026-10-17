import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DecisionEmailSecurityPanel } from '../../src/operations';

const fixture = {
  active_issuances: 11,
  locked_issuances: 2,
  revoked_issuances: 3,
  consumed_issuances: 4,
  expired_issuances: 5,
  active_challenges: 6,
  locked_challenges: 7,
  verified_challenges: 8,
  pending_fresh_mfa: 9,
  mailbox_code_is_mfa: false,
  recipient_receipt_verified: false,
};

describe('G7 read-only email decision security operations', () => {
  it('reports distinct issuance, challenge and independent MFA policy counters', () => {
    const html = renderToStaticMarkup(createElement(DecisionEmailSecurityPanel, { summary: fixture }));
    expect(html).toContain('Email approval verification');
    expect(html).toContain('Decision links');
    expect(html).toContain('Separate email OTP');
    expect(html).toContain('Open requests requiring fresh MFA');
    expect(html).toContain('<td>11</td>');
    expect(html).toContain('<td>2</td>');
    expect(html).toContain('<td>5</td>');
    expect(html).toContain('<td>6</td>');
    expect(html).toContain('<td>7</td>');
    expect(html).toContain('<td>8</td>');
    expect(html).toContain('<td>9</td>');
  });

  it('does not invent zero or verification success when server counters are unavailable', () => {
    const html = renderToStaticMarkup(createElement(DecisionEmailSecurityPanel, { summary: undefined }));
    expect(html).toContain('Counters unavailable');
    expect(html).not.toContain('0 active');
    expect(html).not.toContain('0 locked');
    expect(html).not.toContain('Verified approver');
  });

  it('preserves mailbox-assurance limitations and renders no state-changing controls', () => {
    const html = renderToStaticMarkup(createElement(DecisionEmailSecurityPanel, {
      summary: { ...fixture, locked_issuances: Number.NaN, mailbox_code_is_mfa: true },
    }));
    expect(html).toContain('Unavailable');
    expect(html).toContain('same-mailbox OTP is not independent MFA');
    expect(html).toContain('does not verify the named recipient');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('Reissue');
    expect(html).not.toContain('Resend');
  });
});
