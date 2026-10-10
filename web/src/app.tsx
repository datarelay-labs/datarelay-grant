import { useEffect, useState } from 'react';
import {
  AuthLayout,
  Button,
  Card,
  LoginForm,
  MfaChallengeForm,
  ProductShell,
  ThemeRoot,
} from '@datarelay-labs/foundation';
import { Administration, Security } from './administration';
import { Approvers } from './approvers';
import { Delegations } from './delegations';
import { ApiError, setCsrf } from './api';
import { useTask } from './common';
import { authAdapter, productConfig, readSession } from './foundation.config';
import { Home } from './home';
import { Integrations } from './integrations';
import { Notifications } from './notifications';
import { Operations, operatorPresets } from './operations';
import { Profiles } from './policies';
import { NewRequest, RequestDetail, RequestList } from './requests';
import type { Session } from './types';

const AUTH_RESOURCES = [
  {
    title: 'Documentation',
    description: 'datarelay.run/docs',
    href: 'https://datarelay.run/docs',
    external: true,
  },
  {
    title: 'Quick Start Guide',
    description: 'datarelay.run/quickstart',
    href: 'https://datarelay.run/quickstart',
    external: true,
  },
  {
    title: 'Release Notes',
    description: 'datarelay.run/releases',
    href: 'https://datarelay.run/releases',
    external: true,
  },
  {
    title: 'DataRelay Website',
    description: 'datarelay.run',
    href: 'https://datarelay.run',
    external: true,
  },
  {
    title: 'Support',
    description: 'support@datarelay.run',
    href: 'mailto:support@datarelay.run',
  },
] as const;

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState(location.pathname === '/' ? '/home' : location.pathname);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const task = useTask();

  const signedOut = () => {
    setCsrf('');
    setSession(null);
  };

  async function refresh() {
    try {
      setSession(await readSession());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) signedOut();
      else throw error;
    }
  }

  useEffect(() => {
    void task.run(async () => {
      await refresh();
      setLoading(false);
    });
    const onPopState = () => setPath(location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(next: string) {
    if (!next.startsWith('/') || next.startsWith('//')) return;
    history.pushState(null, '', next);
    setPath(next);
  }

  if (loading) {
    return (
      <ThemeRoot theme={theme}>
        <AuthLayout
          productName="DataRelay Grant"
          productSubtitle="Approval Control Platform"
          description="Request. Approve. Execute. Control sensitive actions with explicit human authorization."
          title="Connecting to DataRelay"
          subtitle="Verifying your current Grant session."
          resources={AUTH_RESOURCES}
        >
          {task.feedback}
          <Button
            variant="secondary"
            onClick={() =>
              void task.run(async () => {
                await refresh();
                setLoading(false);
              })
            }
          >
            Retry
          </Button>
        </AuthLayout>
      </ThemeRoot>
    );
  }

  const user = session?.user;
  if (!user) {
    const mfa = session?.state === 'mfa_required';
    return (
      <ThemeRoot theme={theme}>
        <AuthLayout
          productName="DataRelay Grant"
          productSubtitle="Approval Control Platform"
          description="Request. Approve. Execute. Control sensitive actions with explicit human authorization."
          title={mfa ? 'Verify your identity' : 'Welcome to DataRelay'}
          subtitle={mfa ? 'Complete multi-factor authentication to continue.' : 'Please sign in to continue.'}
          resources={AUTH_RESOURCES}
        >
          {task.feedback}
          {mfa ? (
            <>
              <MfaChallengeForm
                busy={task.busy}
                methods={['totp', 'recovery_code']}
                onSubmit={(input) =>
                  task.run(async () => {
                    await authAdapter.verifyMfa!(input);
                    await refresh();
                  })
                }
              />
              <Button
                variant="ghost"
                onClick={() =>
                  void task.run(async () => {
                    await authAdapter.signOut();
                    signedOut();
                  })
                }
              >
                Back to sign in
              </Button>
            </>
          ) : (
            <>
              <LoginForm
                busy={task.busy}
                onSubmit={(input) =>
                  task.run(async () => {
                    await authAdapter.signIn(input);
                    await refresh();
                  })
                }
              />
              <p className="dr-auth-form__guidance">
                Accounts are created by an administrator. Self-service registration is not available.
              </p>
            </>
          )}
        </AuthLayout>
      </ThemeRoot>
    );
  }

  const config = productConfig(user);
  const title =
    path.startsWith('/requests/')
      ? path === '/requests/new'
        ? 'New request'
        : 'Request details'
      : path.startsWith('/operations/queue/') || path.startsWith('/operations/integration/')
        ? 'Operational requests'
        : path === '/security'
          ? 'Account & security'
          : config.navigation.find((item) => item.path === path)?.label ?? 'Not found';

  let page;
  if (path === '/home') {
    page = <Home user={user} navigate={navigate} />;
  } else if (path === '/requests' || path === '/approvals' || path === '/my-requests') {
    page = <RequestList key={path} user={user} mode={path === '/approvals' ? 'approvals' : path === '/my-requests' ? 'requester' : 'all'} navigate={navigate} />;
  } else if (path === '/requests/new') {
    page = <NewRequest navigate={navigate} />;
  } else if (/^\/requests\/[a-f0-9-]{36}\/replace$/.test(path)) {
    page = <NewRequest key={path} navigate={navigate} predecessorId={path.split('/')[2]!} />;
  } else if (/^\/requests\/[a-f0-9-]{36}$/.test(path)) {
    page = <RequestDetail key={path} id={path.split('/')[2]!} user={user} navigate={navigate} />;
  } else if (path === '/delegations') {
    page = <Delegations user={user} />;
  } else if (path === '/security') {
    page = <Security user={user} onSignedOut={signedOut} onRefresh={refresh} />;
  } else if (user.role === 'admin' && path === '/operations') {
    page = <Operations navigate={navigate} />;
  } else if (user.role === 'admin' && /^\/operations\/queue\/[a-z_]+$/.test(path)
    && Object.hasOwn(operatorPresets, path.split('/')[3]!)) {
    page = <RequestList key={path} user={user} mode="all"
      preset={operatorPresets[path.split('/')[3]!]} navigate={navigate} />;
  } else if (user.role === 'admin' && /^\/operations\/integration\/[a-f0-9-]{36}$/.test(path)) {
    page = <RequestList key={path} user={user} mode="all"
      preset={{ integration_id: path.split('/')[3]! }} navigate={navigate} />;
  } else if (user.role === 'admin' && path === '/integrations') {
    page = <Integrations />;
  } else if (user.role === 'admin' && path === '/profiles') {
    page = <Profiles />;
  } else if (user.role === 'admin' && path === '/approvers') {
    page = <Approvers />;
  } else if (user.role === 'admin' && path === '/notifications') {
    page = <Notifications />;
  } else if (user.role === 'admin' && path === '/email-templates') {
    page = <Notifications />;
  } else if (user.role === 'admin' && path === '/system') {
    page = <Administration user={user} />;
  } else {
    page = (
      <Card title="Page unavailable">
        <p>This page does not exist or is not available to your account.</p>
      </Card>
    );
  }

  return (
    <ThemeRoot theme={theme}>
      <ProductShell
        product={config.product}
        navigation={config.navigation}
        capabilities={config.capabilities}
        currentPath={path}
        onNavigate={navigate}
        pageTitle={title}
        pageSubtitle="Human approval is explicit. Delivery and execution remain separate."
        principal={{ displayName: user.username, detail: user.email }}
        headerActions={
          <Button
            variant="secondary"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            Use {theme === 'light' ? 'dark' : 'light'} theme
          </Button>
        }
        userActions={
          <div className="grant-user-actions">
            <Button variant="ghost" onClick={() => navigate('/security')}>
              Account & security
            </Button>
            <Button
              variant="ghost"
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  try {
                    await authAdapter.signOut();
                  } catch (error) {
                    if (!(error instanceof ApiError && error.status === 401)) throw error;
                  }
                  signedOut();
                })
              }
            >
              Sign out
            </Button>
          </div>
        }
      >
        {task.feedback}
        {page}
      </ProductShell>
    </ThemeRoot>
  );
}
