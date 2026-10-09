import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccountList,
  AdminTaskCatalog,
  AuditList,
  Button,
  Card,
  MfaEnrollmentPanel,
  PasswordChangeForm,
  RecoveryCodesPanel,
  SessionList,
  SystemStatus,
  TextField,
  type AccountProjection,
  type AdminTask,
  type AuditEventProjection,
  type AuthSessionSummary,
  type CapabilityAvailability,
  type HealthProjection,
  type SystemInfoProjection,
} from '@datarelay-labs/foundation';
import { api } from './api';
import {
  accountsAdapter,
  authAdapter,
  operationsAdapter,
  productConfig,
} from './foundation.config';
import { Form, Select, useTask } from './common';
import type { User } from './types';
import './administration-layout.css';

type AdminSection = 'health' | 'accounts' | 'audit' | 'mail' | 'lifecycle' | null;

type AdminTaskGroup = {
  id: string;
  title: string;
  description: string;
  tasks: readonly AdminTask[];
};

function availability(user: User, capability: string): CapabilityAvailability {
  const capabilities = productConfig(user).capabilities as Record<string, boolean | CapabilityAvailability>;
  const value = capabilities[capability];
  if (value === true) return 'supported';
  if (value === false || value == null) return 'unavailable';
  return value;
}

export function Administration({ user }: { user: User }) {
  const [accounts, setAccounts] = useState<readonly AccountProjection[]>([]);
  const [events, setEvents] = useState<readonly AuditEventProjection[]>([]);
  const [health, setHealth] = useState<HealthProjection>();
  const [info, setInfo] = useState<SystemInfoProjection>();
  const [section, setSection] = useState<AdminSection>(null);
  const selectedTaskRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const task = useTask();

  // Same Foundation AdminTaskCatalog used by Control, but grouped by actual
  // Grant capabilities. Missing server implementations never get Manage actions.
  const groups = useMemo<readonly AdminTaskGroup[]>(
    () => [
      {
        id: 'access-security',
        title: 'Access & security',
        description: 'Grant accounts, personal credentials, and transport security.',
        tasks: [
          {
            id: 'tls.configure',
            label: 'HTTPS',
            description: 'TLS certificates, listener, and HTTPS redirect.',
            availability: availability(user, 'tls.configure'),
            notes: 'Not available in Grant. TLS is configured by the approved reverse proxy.',
          },
          {
            id: 'users.manage',
            label: 'User Management',
            description: 'Review Grant accounts and create administrator-managed users.',
            availability: availability(user, 'users.manage'),
            effects: ['security_sensitive'],
          },
          {
            id: 'identity.password.change',
            label: 'Password & MFA',
            description: 'Change your own password, manage MFA and active sessions.',
            availability: availability(user, 'identity.password.change'),
            notes: 'Personal account security only; no administrator-wide password policy.',
          },
        ],
      },
      {
        id: 'platform-network',
        title: 'Platform & network',
        description: 'Display timezone and reverse-proxy networking boundaries.',
        tasks: [
          {
            id: 'grant.timezone.configure',
            label: 'Display timezone',
            description: 'Personal or system-wide time display preferences.',
            availability: 'unavailable',
            notes: 'Grant currently uses the browser locale; no timezone editor is implemented.',
          },
          {
            id: 'grant.network.configure',
            label: 'Network',
            description: 'Published ports, proxy destinations and network listener settings.',
            availability: 'unavailable',
            notes: 'Configured by the deployment operator; no Grant network settings API.',
          },
        ],
      },
      {
        id: 'lifecycle-recovery',
        title: 'Lifecycle & recovery',
        description: 'Data retention, backup and non-applying configuration portability.',
        tasks: [
          {
            id: 'grant.retention.configure',
            label: 'Retention',
            description: 'Cleanup schedules and record retention policies.',
            availability: 'unavailable',
            notes: 'Grant has no administrator retention-policy editor.',
          },
          {
            id: 'grant.lifecycle.guidance',
            label: 'Backup & restore',
            description: 'Read the supported CLI-only backup and recovery procedure.',
            availability: availability(user, 'grant.lifecycle.guidance'),
          },
          {
            id: 'grant.configuration.preview',
            label: 'Configuration preview',
            description: 'Review safe export and dry-run import conflicts in Integrations.',
            availability: availability(user, 'grant.lifecycle.guidance'),
            notes: 'Read-only preview; no configuration import/apply control exists.',
          },
        ],
      },
      {
        id: 'operations-audit',
        title: 'Operations & audit',
        description: 'Authoritative health, historical evidence and notification diagnostics.',
        tasks: [
          {
            id: 'audit.read',
            label: 'Audit history',
            description: 'Review Grant authentication, administration and approval audit events.',
            availability: availability(user, 'audit.read'),
          },
          {
            id: 'health.read',
            label: 'System health',
            description: 'Read authoritative Grant health and installation information.',
            availability: availability(user, 'health.read'),
          },
          {
            id: 'grant.smtp.test',
            label: 'Mail delivery test',
            description: 'Send a non-authorizing email to the signed-in administrator.',
            availability: availability(user, 'grant.smtp.test'),
          },
        ],
      },
    ],
    [user],
  );

  async function load() {
    const [accountRows, auditRows, currentHealth, currentInfo] = await Promise.all([
      accountsAdapter.list(),
      operationsAdapter.listAudit!(),
      operationsAdapter.readHealth(),
      operationsAdapter.readSystemInfo(),
    ]);
    setAccounts(accountRows);
    setEvents(auditRows);
    setHealth(currentHealth);
    setInfo(currentInfo);
  }

  useEffect(() => {
    void task.run(load);
  }, []);

  // Details render below four task groups. Move focus and the viewport so
  // Manage/View does not appear to do nothing in a long Administration page.
  useEffect(() => {
    if (!section) return;
    selectedTaskRef.current?.focus({ preventScroll: true });
    selectedTaskRef.current?.scrollIntoView({ block: 'start' });
  }, [section]);

  function openTask(selected: AdminTask) {
    if (selected.id === 'identity.password.change') {
      window.location.assign('/security');
      return;
    }
    if (selected.id === 'grant.configuration.preview') {
      window.location.assign('/integrations');
      return;
    }
    const next: Record<string, AdminSection> = {
      'health.read': 'health',
      'users.manage': 'accounts',
      'audit.read': 'audit',
      'grant.smtp.test': 'mail',
      'grant.lifecycle.guidance': 'lifecycle',
    };
    setSection(next[selected.id] ?? null);
  }

  return (
    <div className="grant-stack grant-admin-workspace" data-testid="grant-admin-workspace">
      {task.feedback}
      <section className="grant-admin-heading" aria-labelledby="grant-admin-title">
        <div>
          <p className="grant-eyebrow">Platform administration</p>
          <h2 id="grant-admin-title">Administration</h2>
          <p>
            Choose a configuration task for access, security, recovery or audit.
            Approval policies, notifications and integrations stay in their own workspaces.
          </p>
        </div>
        <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>
          Refresh
        </Button>
      </section>

      <div className="grant-admin-access-context" role="status">
        <strong>Signed in as Administrator.</strong>
        <p>
          Changes to Grant users and mail require administrator authority.
          Unavailable platform settings are shown for clarity, without working controls.
        </p>
      </div>

      <div className="grant-admin-task-groups" data-testid="grant-admin-task-groups">
        {groups.map((group) => (
          <section className="grant-admin-task-group" key={group.id}
            aria-labelledby={group.id + '-heading'} data-testid={'grant-admin-group-' + group.id}>
            <header>
              <h3 id={group.id + '-heading'}>{group.title}</h3>
              <p>{group.description}</p>
            </header>
            <AdminTaskCatalog tasks={group.tasks} onOpen={openTask} showUnavailable />
          </section>
        ))}
      </div>

      {section ? (
        <div
          ref={selectedTaskRef}
          className="grant-admin-selected-task"
          role="region"
          aria-label="Selected administration task"
          data-testid="grant-admin-selected-task"
          tabIndex={-1}
        >
      {section === 'health' ? <SystemStatus health={health} info={info} /> : null}

      {section === 'accounts' ? (
        <div className="grant-stack">
          <Card title="Accounts">
            <AccountList accounts={accounts} />
          </Card>
          <Card
            title="Create local account"
            description="Only Grant administrators may create users. No default or shared credentials are supplied."
          >
            <Form
              busy={task.busy}
              label="Create account"
              onSubmit={() =>
                void task.run(async () => {
                  await api('/admin/users', 'POST', { username: name, email, password, role });
                  setName('');
                  setEmail('');
                  setPassword('');
                  await load();
                  task.setNotice(
                    'Account created. Share credentials through an approved secure channel.',
                  );
                })
              }
            >
              <TextField
                label="New username"
                required
                pattern="[a-zA-Z0-9_.@-]+"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <TextField
                label="New user email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <TextField
                label="Initial password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Select label="New account role" value={role} onChange={setRole}>
                <option value="member">Member</option>
                <option value="admin">Administrator</option>
              </Select>
            </Form>
          </Card>
        </div>
      ) : null}

      {section === 'audit' ? (
        <Card title="Audit history">
          <AuditList events={events} />
        </Card>
      ) : null}

      {section === 'mail' ? (
        <Card
          title="Mail delivery test"
          description="Transport acceptance does not prove inbox receipt and this test never authorizes execution."
        >
          <Button
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                await api('/admin/mail-test', 'POST');
                task.setNotice(
                  'SMTP accepted the test message for your account. Verify actual receipt separately.',
                );
              })
            }
          >
            Send test email to me
          </Button>
        </Card>
      ) : null}

      {section === 'lifecycle' ? (
        <Card title="Lifecycle & recovery">
          <p>
            Backup, restore, installation origin, TLS and upgrades follow the documented
            operator procedures. Foundation renders common administration interaction
            patterns; Grant remains authoritative for its state, validation and audit.
          </p>
        </Card>
      ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Security({
  user,
  onSignedOut,
  onRefresh,
}: {
  user: User;
  onSignedOut: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [sessions, setSessions] = useState<readonly AuthSessionSummary[]>([]);
  const [material, setMaterial] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const task = useTask();

  async function load() {
    setSessions(await authAdapter.listSessions!());
  }

  useEffect(() => {
    void task.run(load);
  }, []);

  return (
    <div className="grant-stack">
      {task.feedback}
      <Card title="Change password">
        <PasswordChangeForm
          busy={task.busy}
          onSubmit={(input) =>
            task.run(async () => {
              await authAdapter.changePassword!(input);
              onSignedOut();
            })
          }
        />
      </Card>
      <Card
        title="Multi-factor authentication"
        description={
          user.mfa_enabled
            ? 'TOTP is enabled for your account.'
            : 'Add a second factor before using Grant for sensitive approvals.'
        }
      >
        {!user.mfa_enabled && !material ? (
          <Button
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => setMaterial(await api('/auth/mfa/enroll', 'POST')))
            }
          >
            Set up MFA
          </Button>
        ) : null}
        {material ? (
          <MfaEnrollmentPanel
            material={{
              accountLabel: user.username,
              issuer: 'DataRelay Grant',
              secret: material.secret,
              otpauthUri: material.otpauth_uri,
            }}
            busy={task.busy}
            onConfirm={(code) =>
              task.run(async () => {
                const result = await api<{ recovery_codes: string[] }>('/auth/mfa/confirm', 'POST', {
                  code,
                });
                setCodes(result.recovery_codes);
                setMaterial(null);
                await onRefresh();
              })
            }
          />
        ) : null}
        {codes.length ? (
          <RecoveryCodesPanel codes={codes} onContinue={() => setCodes([])} />
        ) : null}
      </Card>
      <Card title="Active sessions">
        <SessionList
          sessions={sessions}
          onRevoke={(id) =>
            task.run(async () => {
              await authAdapter.revokeSession!(id);
              if (sessions.find((session) => session.id === id)?.current) onSignedOut();
              else await load();
            })
          }
        />
      </Card>
    </div>
  );
}
