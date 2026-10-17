import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlatformLoginPage } from '@datarelay-labs/foundation-f31';
import { createGrantF31LoginAdapter } from '../../src/foundation_f31_login';
import { setCsrf } from '../../src/api';

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrf('');
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('F31 Control-original Grant login bridge', () => {
  it('renders the imported original Control login instead of a new Grant imitation', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformLoginPage, {
        adapter: createGrantF31LoginAdapter(),
        onAuthenticated: () => undefined,
      }),
    );
    expect(html).toContain('gdc-login-centered');
    expect(html).toContain('Welcome to DataRelay');
    expect(html).toContain('Show password');
  });

  it('signs in using Grant native server sessions, not a new Foundation identity database', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ state: 'authenticated', csrf: 'server-csrf-a' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createGrantF31LoginAdapter().signIn({ username: 'test-admin', password: 'test-only-credential' });
    expect(result).toEqual({ state: 'authenticated' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/login');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin' });
  });

  it('requires password-first session challenge before F31 TOTP and never uses email decision endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ state: 'mfa_required', csrf: 'server-challenge-b' }))
      .mockResolvedValueOnce(json({ csrf: 'server-csrf-final' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createGrantF31LoginAdapter();
    const pending = await adapter.signIn({ username: 'test-admin', password: 'test-only-credential' });
    expect(pending).toEqual({
      state: 'mfa_required',
      challengeRef: 'server-challenge-b',
      methods: ['totp', 'recovery'],
    });
    await expect(adapter.verifyOtp({ challengeRef: 'not-this-session', code: '123456' }))
      .rejects.toThrow('no longer current');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const done = await adapter.verifyOtp({ challengeRef: 'server-challenge-b', code: '123456' });
    expect(done).toEqual({ state: 'authenticated' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/mfa/verify');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"recovery":false');
    await expect(adapter.verifyOtp({ challengeRef: 'server-challenge-b', code: '123456' }))
      .rejects.toThrow('no longer current');
  });

  it('allows a legacy 20-hex Grant recovery code only on its verified original MFA challenge', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ state: 'mfa_required', csrf: 'grant-legacy-bound' }))
      .mockResolvedValueOnce(json({ csrf: 'grant-legacy-authenticated' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createGrantF31LoginAdapter();
    await adapter.signIn({ username: 'test-admin', password: 'test-only-credential' });
    await expect(adapter.verifyOtp({ challengeRef: 'unrelated', code: 'abcdefabcdefabcdefab' }))
      .rejects.toThrow('no longer current');
    expect(await adapter.verifyOtp({
      challengeRef: 'grant-legacy-bound',
      code: 'abcdefabcdefabcdefab',
    })).toEqual({ state: 'authenticated' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/mfa/verify');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"recovery":true');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes explicit recovery flag for a bound recovery code and fails unverified factors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ state: 'mfa_required', csrf: 'server-challenge-c' }))
      .mockResolvedValueOnce(json({ error: { code: 'MFA_INVALID', category: 'validation' } }, 422));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createGrantF31LoginAdapter();
    await adapter.signIn({ username: 'test-admin', password: 'test-only-credential' });
    await expect(adapter.verifyOtp({ challengeRef: 'server-challenge-c', code: 'abcdefabcdefabcdefabcdef' }))
      .rejects.toThrow('MFA INVALID');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"recovery":true');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
