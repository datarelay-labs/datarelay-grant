import { useEffect, useMemo, useState } from 'react';
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

type AdminSection = 'health' | 'accounts' | 'audit' | 'mail' | 'lifecycle' | null;

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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const task = useTask();

  const tasks = useMemo<readonly AdminTask[]>(
    () => [
      {
        id: 'health.read',
        label: 'System health',
        description: 'Read Grant health and authoritative system information.',
        availability: availability(user, 'health.read'),
      },
      {
        id: 'users.manage',
        label: 'Accounts',
        description: 'Review local accounts and create administrator-managed Grant users.',
        availability: availability(user, 'users.manage'),
        effects: ['security_sensitive'],
      },
      {
        id: 'audit.read',
        label: 'Audit history',
        description: 'Review authentication, administration and approval-control audit events.',
        availability: availability(user, 'audit.read'),
      },
      {
        id: 'grant.smtp.test',
        label: 'Mail delivery test',
        description: 'Submit a non-authorizing test message to the authenticated administrator.',
        availability: availability(user, 'grant.smtp.test'),
      },
      {
        id: 'grant.lifecycle.guidance',
        label: 'Lifecycle & recovery',
        description: 'Read the supported backup, restore, TLS and upgrade operating boundary.',
        availability: availability(user, 'grant.lifecycle.guidance'),
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

  function openTask(selected: AdminTask) {
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
    <div className="grant-stack">
      {task.feedback}
      <section className="grant-admin-heading" aria-labelledby="grant-admin-title">
        <div>
          <p className="grant-eyebrow">Foundation administration</p>
          <h2 id="grant-admin-title">Administration</h2>
          <p>
            Common administration follows DataRelay Product Foundation capability and adapter
            contracts. Unsupported operations are not presented as working controls.
          </p>
        </div>
        <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>
          Refresh
        </Button>
      </section>

      <AdminTaskCatalog tasks={tasks} onOpen={openTask} />

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
