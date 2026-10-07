import { useState, type FormEvent } from 'react';
import { DataRelayIcon } from '@datarelay-labs/icons';

type LoginSubmission = { username: string; password: string };

export function GrantLoginForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (submission: LoginSubmission) => void | Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const normalized = username.trim();
    if (!normalized || !password) return;
    void onSubmit({ username: normalized, password });
  }

  return (
    <form className="grant-login-form" onSubmit={submit}>
      <div className="grant-login-field">
        <label htmlFor="grant-login-username">Username</label>
        <div className="grant-login-control">
          <DataRelayIcon name="user" aria-hidden="true" />
          <input
            id="grant-login-username"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your username"
          />
        </div>
      </div>

      <div className="grant-login-field">
        <label htmlFor="grant-login-password">Password</label>
        <div className="grant-login-control">
          <DataRelayIcon name="lock" aria-hidden="true" />
          <input
            id="grant-login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />
          <button
            type="button"
            className="grant-password-visibility"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <button className="grant-login-submit" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign In'}
      </button>

      <p className="grant-auth-guidance">
        Accounts are created by an administrator. Self-service registration is not available.
      </p>
    </form>
  );
}
