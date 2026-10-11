import { useEffect, useState } from 'react';
import { EmailDecisionPortal } from './email_decision_portal';
import {
  loadEmailDecisionIntent, validateDecisionIntentToken,
  type LoadedEmailDecisionIntent,
} from './email_decision_adapter';

/**
 * The EXACT issued email capability URL (GET) serves an inert HTML shell.
 * Only an explicit JSON GET after client mount reveals the outcome / assurance
 * tier, never request details, proof, or a decision. A mail scanner can visit
 * the link without triggering a verification challenge or approval.
 */
const route = /^\/api\/v1\/decision-intents\/([a-zA-Z0-9_-]{32,100})$/;

export function parseEmailDecisionLandingToken(path: string): string | null {
  const match = route.exec(path);
  if (!match || match[0] !== path) return null;
  try {
    return validateDecisionIntentToken(match[1]!);
  } catch {
    return null;
  }
}

export function isEmailDecisionLandingPath(path: string): boolean {
  return parseEmailDecisionLandingToken(path) !== null;
}

export function PublicEmailDecisionLanding({ token }: { token: string }) {
  // A malformed capability is never submitted to the network.
  const valid = token.length >= 32 && token.length <= 100
    && /^[a-zA-Z0-9_-]+$/.test(token);
  const [loaded, setLoaded] = useState<LoadedEmailDecisionIntent | null>(null);
  const [phase, setPhase] = useState<'checking' | 'unavailable'>(
    valid ? 'checking' : 'unavailable',
  );

  useEffect(() => {
    if (!valid) return;
    let current = true;
    // No login/session refresh, PIN/OTP send or mutation on this URL's GET.
    // React StrictMode may repeat this read-only JSON preflight; it cannot
    // record a decision and each resolved adapter remains context-bound.
    void loadEmailDecisionIntent(token).then(
      (intent) => {
        if (!current) return;
        setLoaded(intent);
      },
      () => {
        if (!current) return;
        setPhase('unavailable');
      },
    );
    return () => { current = false; };
  }, [token, valid]);

  return (
    <main className="grant-email-decision-page">
      <div className="grant-email-decision-frame">
        <header className="grant-email-decision-brand">
          <strong>DataRelay Grant</strong>
          <small>Human approval request</small>
        </header>
        {loaded ? (
          <EmailDecisionPortal
            key={token}
            choice={loaded.choice}
            adapter={loaded.adapter}
          />
        ) : (
          <section className="grant-card grant-form" aria-labelledby="grant-email-landing-title">
            <h1 id="grant-email-landing-title">Review approval request</h1>
            {phase === 'checking' ? (
              <p role="status">Checking the current approval link.
                Opening this URL is read-only; no decision is recorded by opening the link.</p>
            ) : (
              <p role="alert">
                This approval link is not available.
                Request a new email from your administrator.
              </p>
            )}
          </section>
        )}
        <p className="grant-email-decision-help">
          No external business action is executed by opening this link.
        </p>
      </div>
    </main>
  );
}
