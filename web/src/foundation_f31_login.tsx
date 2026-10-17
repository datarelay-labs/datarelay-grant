/** Latest F31 Control-original login presentation over Grant's existing
 * server-authenticated identity and CSRF/MFA boundary.
 *
 * Foundation's embedded SQLite security runtime has a DIFFERENT session
 * database; it must not silently assume authority over Grant approvals.
 * This adapter never creates users, passwords, sessions or MFA decisions.
 * Email approval PIN/OTP remains owned by Grant's decision-intent endpoints.
 */
import { useMemo, useState, type FormEvent } from 'react';
import {
  PlatformLoginPage,
  type ControlLoginAdapter,
} from '@datarelay-labs/foundation-f31';
import { ApiError, api, errorText, setCsrf } from './api';

type LoginReply = { state: 'authenticated' | 'mfa_required'; csrf: string };

export function createGrantF31LoginAdapter(): ControlLoginAdapter {
  let pendingChallenge: string | null = null;
  return {
    async signIn({ username, password }) {
      try {
        // The server issues an HttpOnly session and a session-bound CSRF token.
        const reply = await api<LoginReply>('/auth/login', 'POST', { username, password });
        if (!reply.csrf || typeof reply.csrf !== 'string') {
          throw new Error('Authentication returned no bound session.');
        }
        setCsrf(reply.csrf);
        if (reply.state === 'authenticated') {
          pendingChallenge = null;
          return { state: 'authenticated' };
        }
        if (reply.state !== 'mfa_required') {
          throw new Error('Invalid authentication state.');
        }
        // An opaque server-issued, session-bound reference; only the Grant
        // server authorizes password-first TOTP or one-time recovery.
        pendingChallenge = reply.csrf;
        return {
          state: 'mfa_required',
          challengeRef: pendingChallenge,
          methods: ['totp', 'recovery'],
        };
      } catch (error) {
        if (error instanceof ApiError) throw new Error(errorText(error));
        throw error;
      }
    },
    async verifyOtp({ challengeRef, code }) {
      if (!pendingChallenge || challengeRef !== pendingChallenge) {
        throw new Error('This sign-in challenge is no longer current. Sign in again.');
      }
      // Pre-F31 Grant enrollment issued 20-hex recovery codes; new native
      // Foundation issuance uses 24-hex. Retain both on the same server gate.
      const recovery = /^(?:[0-9a-f]{20}|[0-9a-f]{24})$/i.test(code);
      if (!recovery && !/^\d{6}$/.test(code)) {
        throw new Error('Enter a valid authenticator or recovery code.');
      }
      try {
        const reply = await api<{ csrf: string }>('/auth/mfa/verify', 'POST', {
          code,
          recovery,
        });
        if (!reply.csrf) throw new Error('MFA verification returned no active session.');
        setCsrf(reply.csrf);
        pendingChallenge = null;
        return { state: 'authenticated' };
      } catch (error) {
        if (error instanceof ApiError) throw new Error(errorText(error));
        throw error;
      }
    },
  };
}

export function GrantF31ControlLogin({ onAuthenticated }: {
  onAuthenticated: () => void;
}) {
  const [legacyChallenge, setLegacyChallenge] = useState<string | null>(null);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyCode, setLegacyCode] = useState('');
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  // Never clone/rewrite the Control login. The only additive Grant path is for
  // pre-F31 20-hex recovery codes which the original Control UI cannot input.
  const adapter = useMemo<ControlLoginAdapter>(() => {
    const backend = createGrantF31LoginAdapter();
    return {
      async signIn(credentials) {
        const result = await backend.signIn(credentials);
        setLegacyChallenge(result.state === 'mfa_required' ? result.challengeRef : null);
        setLegacyOpen(false);
        setLegacyCode('');
        setLegacyError(null);
        return result;
      },
      async verifyOtp(input) {
        const result = await backend.verifyOtp(input);
        setLegacyChallenge(null);
        setLegacyOpen(false);
        setLegacyCode('');
        return result;
      },
    };
  }, []);

  async function verifyLegacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!legacyChallenge || legacyBusy) return;
    if (!/^[a-f0-9]{20}$/i.test(legacyCode)) {
      setLegacyError('Enter one of your previously issued 20-character recovery codes.');
      return;
    }
    setLegacyBusy(true);
    setLegacyError(null);
    try {
      await adapter.verifyOtp({ challengeRef: legacyChallenge, code: legacyCode });
      setLegacyCode('');
      onAuthenticated();
    } catch (error) {
      setLegacyError(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setLegacyBusy(false);
    }
  }

  return (
    <>
      <PlatformLoginPage adapter={adapter} onAuthenticated={onAuthenticated} />
      {legacyChallenge && (
        <aside className="mx-auto max-w-[420px] px-5 pb-5 text-sm text-gdc-foreground">
          <button type="button"
            className="rounded-md p-2 text-gdc-mutedStrong underline focus-visible:outline focus-visible:outline-2"
            onClick={() => {
              setLegacyOpen(value => !value);
              setLegacyError(null);
              setLegacyCode('');
            }}
            aria-expanded={legacyOpen}
            aria-controls="grant-existing-recovery">
            Use a previously issued Grant recovery code
          </button>
          {legacyOpen && (
            <form id="grant-existing-recovery" onSubmit={event => void verifyLegacy(event)}
              className="space-y-2 rounded-lg border border-gdc-inputBorder p-3">
              <label htmlFor="grant-legacy-recovery" className="block">
                Existing 20-character recovery code
              </label>
              <input id="grant-legacy-recovery" type="password" autoComplete="one-time-code"
                className="w-full rounded-md border border-gdc-inputBorder bg-gdc-input p-2 text-gdc-foreground"
                value={legacyCode} maxLength={20} onChange={event => setLegacyCode(event.target.value)} />
              {legacyError && <p role="alert" className="text-rose-500">{legacyError}</p>}
              <button type="submit" disabled={legacyBusy}
                className="rounded-md bg-gdc-primary px-3 py-2 text-white disabled:opacity-50">
                {legacyBusy ? 'Verifying…' : 'Verify existing recovery code'}
              </button>
            </form>
          )}
        </aside>
      )}
    </>
  );
}
