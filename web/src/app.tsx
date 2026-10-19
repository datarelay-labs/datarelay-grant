import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  MfaChallengeForm,
  ThemeRoot,
} from '@datarelay-labs/foundation';
import { ControlConsumerAppShellLayout } from '@datarelay-labs/control-clone';
import { Administration, Security } from './administration';
import { AdminWorkflowSetup } from './admin_workflow_setup';
import { GrantAuthFrame } from './grant_auth_frame';
import { GrantF31ControlLogin } from './foundation_f31_login';
import { AuditExplorer } from './audit_explorer';
import { Approvers } from './approvers';
import { Delegations } from './delegations';
import { ApiError, setCsrf } from './api';
import { useTask } from './common';
import { authAdapter, productConfig, readSession } from './foundation.config';
import { readDisplayTimezone, setDisplayTimezone } from './display_timezone';
import { grantControlShellConfiguration } from './grant_control_shell_composition';
import { Home } from './home';
import { Integrations } from './integrations';
import { Notifications } from './notifications';
import { Operations, operatorPresets } from './operations';
import { Profiles } from './policies';
import { NewRequest, RequestDetail, RequestList } from './requests';
import { PublicEmailDecisionLanding, parseEmailDecisionLandingToken } from './email_decision_landing';
import type { Session } from './types';
import {createGrantNavigation,type GrantNavigation} from './grant_navigation';



export function App() {
  // The original emailed capability URL is a public human-decision route.
  // It must be selected before any private session bootstrap or login UI.
  if (location.pathname.startsWith('/api/v1/decision-intents/')) {
    const token = parseEmailDecisionLandingToken(
      location.pathname + location.search + location.hash,
    );
    return <PublicEmailDecisionLanding key={token ?? 'unavailable'} token={token ?? ''} />;
  }
  return <AuthenticatedGrantApp />;
}

function AuthenticatedGrantApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState(location.pathname === '/' ? '/home' : location.pathname);
  const navigation=useRef<GrantNavigation|null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const task = useTask();

  const signedOut = () => {
    setCsrf('');
    setSession(null);
  };

  async function refresh() {
    try {
      const next = await readSession();
      if (next.user) {
        const display = await readDisplayTimezone();
        setDisplayTimezone(display.effective);
      } else {
        setDisplayTimezone('UTC');
      }
      setSession(next);
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
    navigation.current=createGrantNavigation(window,next=>setPath(next==='/'?'/home':next));
    return () => {navigation.current?.dispose();navigation.current=null;};
  }, []);

  function navigate(next: string) {
    navigation.current?.navigate(next);
  }

  if (loading) {
    return (
      <ThemeRoot theme={theme} className="dr-control-reference">
        <GrantAuthFrame
          productName="DataRelay Grant"
          productSubtitle="Approval Control Platform"
          description="Request. Approve. Execute. Control sensitive actions with explicit human authorization."
          title="Connecting to DataRelay"
          subtitle="Verifying your current Grant session."
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
        </GrantAuthFrame>
      </ThemeRoot>
    );
  }

  const user = session?.user;
  if (!user) {
    const mfa = session?.state === 'mfa_required';
    return (
      <ThemeRoot theme={theme} className="dr-control-reference">
        {mfa ? (
          <GrantAuthFrame
            productName="DataRelay Grant"
            productSubtitle="Approval Control Platform"
            description="Request. Approve. Execute. Control sensitive actions with explicit human authorization."
            title="Verify your identity"
            subtitle="Complete multi-factor authentication to continue."
          >
            {task.feedback}
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
          </GrantAuthFrame>
        ) : (
          <GrantF31ControlLogin
            onAuthenticated={() => {
              void task.run(async () => {
                await refresh();
                // A direct /login bookmark is public only. After the native
                // session is established, land in the Grant requester/admin
                // workspace rather than rendering a signed-in Not Found page.
                if (path === '/login') navigate('/home');
              });
            }}
          />
        )}
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
    page = <NewRequest navigate={navigate} isAdmin={user.role === 'admin'} />;
  } else if (/^\/requests\/[a-f0-9-]{36}\/replace$/.test(path)) {
    page = <NewRequest key={path} navigate={navigate} predecessorId={path.split('/')[2]!}
      isAdmin={user.role === 'admin'} />;
  } else if (/^\/requests\/[a-f0-9-]{36}$/.test(path)) {
    page = <RequestDetail key={path} id={path.split('/')[2]!} user={user} navigate={navigate} />;
  } else if (path === '/delegations') {
    page = <Delegations user={user} />;
  } else if (path === '/security') {
    page = <Security user={user} onSignedOut={signedOut} onRefresh={refresh} />;
  } else if (user.role === 'admin' && path === '/admin/setup') {
    page = <AdminWorkflowSetup navigate={navigate} />;
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
  } else if (user.role === 'admin' && path === '/audit') {
    page = <AuditExplorer />;
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
    <ControlConsumerAppShellLayout
      configuration={grantControlShellConfiguration(user)}
      pathname={path}
      pageTitle={title}
      onNavigate={navigate}
      quickNavigation
      settingsPath="/security"
      onSignOut={() => {
        void task.run(async () => {
          try {
            await authAdapter.signOut();
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 401)) throw error;
          }
          signedOut();
        });
      }}
    >
      <div id="dr-main-content" className="min-w-0">
        {task.feedback}
        {page}
      </div>
    </ControlConsumerAppShellLayout>
  );
}
