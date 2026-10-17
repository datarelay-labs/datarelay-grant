import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GrantAuthFrame } from '../../src/grant_auth_frame';

describe('Grant first-time sign-in task order', () => {
  it('puts the actual sign-in form ahead of optional help links', () => {
    const html = renderToStaticMarkup(
      <GrantAuthFrame productName="DataRelay Grant" title="Welcome to DataRelay">
        <form><input aria-label="Username" /><button type="submit">Sign in</button></form>
      </GrantAuthFrame>,
    );
    const signIn = html.indexOf('Sign in</button>');
    const help = html.indexOf('Help &amp; documentation');
    expect(signIn).toBeGreaterThan(0);
    expect(help).toBeGreaterThan(signIn);
    expect(html).not.toContain('dr-auth-layout__resources');
    expect(html).toContain('<details');
    expect(html).toContain('aria-label="Resources"');
  });

  it('keeps all previously available resource destinations accessible on demand', () => {
    const html = renderToStaticMarkup(
      <GrantAuthFrame productName="DataRelay Grant" title="Sign in">
        <button>Continue</button>
      </GrantAuthFrame>,
    );
    for (const link of ['Documentation', 'Quick Start Guide', 'Release Notes',
      'DataRelay Website', 'Support']) expect(html).toContain(link);
    expect(html).toContain('href="mailto:support@datarelay.run"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('type="password"');
  });
});
