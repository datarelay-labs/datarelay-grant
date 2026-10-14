import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccountList,
  AdministrationHub,
  createStandardAdministrationTasks,
  AuditList,
  Alert,
  Button,
  Card,
  MfaEnrollmentPanel,
  PasswordChangeForm,
  RecoveryCodesPanel,
  SessionList,
  SystemStatus,
  TextField,
  type AccountProjection,
  type AdministrationHubTask,
  type AdministrationExtensionGroup,
  type AuditEventProjection,
  type AuthSessionSummary,
  type CapabilityAvailability,
  type HealthProjection,
  type SystemInfoProjection,
} from '@datarelay-labs/foundation';
import { api } from './api';
import {
  createAccountCreationReview,
  GRANT_PASSWORD_GUIDANCE,
  GRANT_PASSWORD_PATTERN,
  isCurrentAccountCreateReview,
  type AccountCreateReview,
} from './admin_account_create_review';
import {
  createAccountDisableReview, isCurrentAccountDisableReview,
  type AccountDisableReview,
} from './admin_account_disable_review';
import {
  AdministrationMailReviewConfirmation,createAdministrationMailReview,
  isCurrentAdministrationMailReview,createAdministrationMailAttemptGuard,
  submitReviewedAdministrationMailTest,
  type AdministrationMailReview,type AdministrationMailReceipt,
} from './administration_mail_test_review';
import {
  accountsAdapter,
  authAdapter,
  operationsAdapter,
  productConfig,
} from './foundation.config';
import {
  grantRc41AccountDiscovery,
  grantRc41AdministrationDiscovery,
  grantRc41SessionDiscovery,
} from './foundation_rc41';
import { Form, Select, useTask } from './common';
import type { User } from './types';
import { OperationalSecurityReadinessReadout, type OperationalSecurityReadiness } from './operational_security_readiness';
import './administration-detail.css';

type AdminSection = 'health' | 'accounts' | 'audit' | 'mail' | 'lifecycle' | null;

const administrationSectionLabels: Record<Exclude<AdminSection, null>, string> = {
  health: 'System Health',
  accounts: 'User Management',
  audit: 'Audit',
  mail: 'Mail delivery test',
  lifecycle: 'Backup & Import',
};

function availability(user: User, capability: string): CapabilityAvailability {
  const capabilities = productConfig(user).capabilities as Record<string, boolean | CapabilityAvailability>;
  const value = capabilities[capability];
  if (value === true) return 'supported';
  if (value === false || value == null) return 'unavailable';
  return value;
}

/** Existing Grant Draft-only portability is distinct from a host/DB backup restore.
 * The target route is already administrator-gated by the Grant app router. */
export function GrantConfigurationPortabilityTask() {
  return <Card title="Grant configuration portability">
    <p>The existing configuration tools can export saved Grant policy and
      notification templates, then preview a separate, explicitly reviewed
      Draft-only import. This is not a database backup or disaster recovery.</p>
    <a href="/integrations?view=diagnostics">Open configuration portability</a>
    <p>Navigate to Integrations diagnostics. Imported policies remain disabled
      Drafts; restoring a server or automatically activating policies is not available.</p>
  </Card>;
}

export function Administration({ user }: { user: User }) {
  const [accounts, setAccounts] = useState<readonly AccountProjection[]>([]);
  const [events, setEvents] = useState<readonly AuditEventProjection[]>([]);
  const [health, setHealth] = useState<HealthProjection>();
  const [operationalSecurity, setOperationalSecurity] = useState<OperationalSecurityReadiness | null>(null);
  const [info, setInfo] = useState<SystemInfoProjection>();
  const [section, setSection] = useState<AdminSection>(null);
  const sectionRef=useRef<AdminSection>(null);
  const [reviewedMail,setReviewedMail]=useState<AdministrationMailReview|null>(null);
  const [mailAttempted,setMailAttempted]=useState(false);
  const mailTestGuard=useRef(createAdministrationMailAttemptGuard());
  const selectedDetailRef = useRef<HTMLDivElement>(null);
  const accountReviewRef = useRef<HTMLDivElement>(null);
  const taskNavigationRef = useRef<HTMLDivElement>(null);
  const [reviewedAccount, setReviewedAccount] = useState<AccountDisableReview | null>(null);
  const [reviewedCreation, setReviewedCreation] = useState<AccountCreateReview | null>(null);
  const createAttemptGate = useRef(false);
  const [accountCreateAttempted, setAccountCreateAttempted] = useState(false);
  const focusNavigationAfterClose = useRef(false);
  const attemptedAccountIds = useRef(new Set<string>());
  const [accountDisableAttempts, setAccountDisableAttempts] = useState<readonly string[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const task = useTask();

  // Only authoritative Grant capabilities/roles and existing product actions are bound.
  // Foundation owns all shared task names, descriptions, layout and grouping.
  const tasks = useMemo(
    () => createStandardAdministrationTasks({
      'core.https': { availability: 'unavailable', access: 'view', notes: 'TLS is configured by the approved deployment reverse proxy.' },
      'core.users': { availability: availability(user, 'users.manage'), access: user.role === 'admin' ? 'manage' : 'view', target: { kind: 'action', actionId: 'grant.accounts' }, effects: ['security_sensitive'] },
      'core.password': { availability: 'unavailable', access: 'view', notes: 'Personal password and MFA changes are available under Account & security; no system-wide password policy editor exists.' },
      'core.timezone': { availability: 'unavailable', access: 'view', notes: 'Grant does not provide a system timezone configuration API.' },
      'core.network': { availability: 'unavailable', access: 'view', notes: 'Listener and proxy settings are managed by the deployment operator.' },
      'core.retention': { availability: 'unavailable', access: 'view', notes: 'No web-managed record retention policy editor exists.' },
      'core.backup-import': { availability: availability(user, 'grant.lifecycle.guidance'), access: 'view', target: { kind: 'action', actionId: 'grant.lifecycle.guidance' }, notes: 'Operator procedure only; no web restore or import is authorized.' },
      'core.audit': { availability: availability(user, 'audit.read'), access: 'view', target: { kind: 'action', actionId: 'grant.audit' } },
      'core.health': { availability: availability(user, 'health.read'), access: 'view', target: { kind: 'action', actionId: 'grant.health' } },
    }),
    [user],
  );

  const extensionGroups = useMemo<readonly AdministrationExtensionGroup[]>(
    () => [{
      id: 'grant.mail-transport',
      title: 'Mail & Notifications',
      description: 'Grant-managed SMTP transport diagnostics and test messages; notification templates remain in Configuration.',
      after: 'platform-network',
      tasks: [
        {
          id: 'grant.smtp.test',
          label: 'Mail delivery test',
          description: 'Submit a non-authorizing SMTP test message to the authenticated Grant administrator.',
          availability: availability(user, 'grant.smtp.test'),
          access: user.role === 'admin' ? 'manage' : 'view',
          target: { kind: 'action', actionId: 'grant.smtp.test' },
        },
        {
          id: 'grant.smtp.configure',
          label: 'SMTP server configuration',
          description: 'Host, port, sender identity and protected credentials (planned, not yet implemented).',
          availability: 'unavailable',
          access: 'view',
          notes: 'Installation-owned SMTP configuration has no accepted editable Web API. The test email does not prove inbox receipt.',
        },
      ],
    }],
    [user],
  );

  async function load() {
    const [accountRows, auditRows, currentHealth, currentInfo, securityFacts] = await Promise.all([
      accountsAdapter.list(),
      operationsAdapter.listAudit!(),
      operationsAdapter.readHealth(),
      operationsAdapter.readSystemInfo(),
      api<OperationalSecurityReadiness>('/admin/operational-readiness').catch(() => null),
    ]);
    setAccounts(accountRows);
    setEvents(auditRows);
    setHealth(currentHealth);
    setInfo(currentInfo);
    setOperationalSecurity(securityFacts);
  }

  useEffect(() => {
    void task.run(load);
  }, []);

  // Foundation owns the Administration groups. Grant owns task content below
  // the hub and moves keyboard focus to the selected detail rather than
  // leaving the person looking at the original card after pressing Manage.
  useEffect(() => {
    if (section) {
      selectedDetailRef.current?.focus({ preventScroll: true });
      selectedDetailRef.current?.scrollIntoView({ block: 'start' });
      return;
    }
    if (focusNavigationAfterClose.current) {
      focusNavigationAfterClose.current = false;
      taskNavigationRef.current?.focus({ preventScroll: true });
      taskNavigationRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [section]);

  function openTask(selected: AdministrationHubTask) {
    const next: Record<string, AdminSection> = {
      'core.health': 'health',
      'core.users': 'accounts',
      'core.audit': 'audit',
      'grant.smtp.test': 'mail',
      'core.backup-import': 'lifecycle',
    };
    const destination=next[selected.id]??null;
    sectionRef.current=destination;
    setReviewedMail(null);
    setReviewedAccount(null);
    setReviewedCreation(null);
    if (destination !== 'accounts') setPassword('');
    setSection(destination);
  }

  function returnToAdministrationTasks() {
    sectionRef.current = null;
    setReviewedMail(null);
    setReviewedAccount(null);
    setReviewedCreation(null);
    setPassword('');
    focusNavigationAfterClose.current = true;
    setSection(null);
  }

  async function confirmAccountDisable() {
    const intent = reviewedAccount;
    if (!intent || sectionRef.current !== 'accounts' ||
        !isCurrentAccountDisableReview(intent, user, accounts)) {
      setReviewedAccount(null);
      throw Error('ACCOUNT_DISABLE_REVIEW_CHANGED');
    }
    if (attemptedAccountIds.current.has(intent.accountId)) return;

    // Claim the exact identity before async read. After an ambiguous POST
    // there is deliberately no automatic retry or reset of the claim.
    attemptedAccountIds.current.add(intent.accountId);
    setAccountDisableAttempts((ids) => [...ids, intent.accountId]);
    setReviewedAccount(null);
    let fresh: readonly AccountProjection[];
    try {
      fresh = await accountsAdapter.list();
    } catch {
      task.setNotice('Current account status could not be verified. No disable request was sent. Refresh and review again.');
      return;
    }
    if (sectionRef.current !== 'accounts' ||
        !isCurrentAccountDisableReview(intent, user, fresh)) {
      task.setNotice('Selected account, role or status changed. No disable request was sent. Refresh the account directory.');
      return;
    }
    let receipt: { id: string; enabled: boolean };
    try {
      receipt = await api<{ id: string; enabled: boolean }>(
        '/admin/users/' + encodeURIComponent(intent.accountId) + '/disable', 'POST',
      );
    } catch {
      task.setNotice('An account disable may have reached the server. Inspect actual account and audit records before planning another action; no automatic retry is allowed.');
      return;
    }
    if (receipt.id !== intent.accountId || receipt.enabled !== false) {
      task.setNotice('The account disable response could not be verified. Inspect the current directory and audit.');
      return;
    }
    try {
      await load();
      task.setNotice('Account disable acknowledged by Grant. Existing sessions were revoked; inspect pending human approval assignments separately.');
    } catch {
      task.setNotice('Grant acknowledged the disable, but the updated account directory could not be read. Inspect saved state and audit before another action.');
    }
  }

  async function confirmAccountCreation() {
    const intent = reviewedCreation;
    if (!intent || sectionRef.current !== 'accounts' ||
        !isCurrentAccountCreateReview(intent, user, name, email, role, password)) {
      setReviewedCreation(null);
      throw Error('ACCOUNT_CREATE_REVIEW_CHANGED');
    }
    if (createAttemptGate.current) return;
    // A possibly accepted POST must not be repeated in the same rendered task.
    createAttemptGate.current = true;
    setAccountCreateAttempted(true);
    setReviewedCreation(null);
    // An initial credential never persists in the visible editor after an
    // attempted privileged POST (even if its result is ambiguous).
    const submittedCredential = password;
    setPassword('');
    let receipt: { id: string; username: string; email: string; role: string };
    try {
      receipt = await api<typeof receipt>('/admin/users', 'POST', {
        username: intent.username,
        email: intent.email,
        role: intent.role,
        password: submittedCredential,
      });
    } catch {
      task.setNotice('Account creation may have reached the server. Do not retry automatically. Review the current account roster and audit before any new action.');
      return;
    }
    if (!receipt.id ||
        receipt.username !== intent.username ||
        receipt.email !== intent.email || receipt.role !== intent.role) {
      task.setNotice('Account creation receipt did not match the reviewed identity. Inspect the current account roster and audit.');
      return;
    }
    // A verified creation receipt is not proof that a follow-up roster read
    // succeeded; keep both outcomes separate for an administrator.
    setPassword('');
    setName('');
    setEmail('');
    try {
      await load();
      task.setNotice('Grant acknowledged the new account. Provide the initial credential through an approved private channel; no email or business execution was sent.');
    } catch {
      task.setNotice('Grant acknowledged account creation but the current roster could not be loaded. Refresh and inspect before another action.');
    }
  }

  useEffect(() => {
    if (!reviewedAccount && !reviewedCreation) return;
    accountReviewRef.current?.focus({ preventScroll: true });
    accountReviewRef.current?.scrollIntoView({ block: 'start' });
  }, [reviewedAccount, reviewedCreation]);

  function reviewMailTest(){
    if(mailTestGuard.current.blocked())return;
    try{
      setReviewedMail(createAdministrationMailReview(user));
    }catch{
      setReviewedMail(null);
      task.setNotice('A current, administrator-owned mailbox is required before testing email delivery.');
    }
  }

  async function confirmMailTest(){
    const intent=reviewedMail;
    if(!intent||sectionRef.current!=='mail'
      ||!isCurrentAdministrationMailReview(intent,user)){
      setReviewedMail(null);
      throw Error('MAIL_TEST_REVIEW_CHANGED');
    }
    if(mailTestGuard.current.blocked())return;
    setReviewedMail(null);
    const receipt=await submitReviewedAdministrationMailTest(
      intent,mailTestGuard.current,user,
      ()=>{
        setMailAttempted(true);
        return api<AdministrationMailReceipt>('/admin/mail-test','POST');
      },
      ()=>sectionRef.current==='mail',
    );
    if(receipt&&sectionRef.current==='mail'){
      task.setNotice('SMTP transport accepted one administrator test email (event '+receipt.event_id+'). Inbox receipt is not independently verified. Do not automatically repeat this action.');
    }
  }

  return (
    <div className={'grant-stack grant-admin-workspace' + (section ? ' grant-admin-workspace--detail' : '')}>
      {task.feedback}
      <div className="grant-admin-task-navigation" ref={taskNavigationRef} tabIndex={-1}>
      <AdministrationHub
        {...grantRc41AdministrationDiscovery}
        productId="grant"
        showHeader={false}
        tasks={tasks}
        extensionGroups={extensionGroups}
        showUnavailable
        intro={
          <div className="grant-admin-heading">
            <p>Shared system administration is provided by DataRelay Product Foundation.
              Unsupported Grant operations have no active Configure action.</p>
            <div className="grant-admin-shortcuts" aria-label="Administration task shortcuts">
              <Button variant="secondary" onClick={() => window.location.assign('/security')}>
                My account & MFA
              </Button>
              {availability(user, 'grant.integrations.manage') === 'supported' ? (
                <Button variant="secondary" onClick={() => window.location.assign('/integrations')}>
                  Configuration preview
                </Button>
              ) : null}
              <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>
                Refresh
              </Button>
            </div>
          </div>
        }
        onOpen={openTask}
      />
      </div>

      {section ? (
        <div
          ref={selectedDetailRef}
          role="region"
          aria-label="Selected administration task"
          className="grant-admin-selected-detail"
          data-testid="grant-admin-selected-detail"
          tabIndex={-1}
        >
      <div className="grant-admin-selected-heading">
        <div>
          <p className="grant-admin-selected-eyebrow">Selected administration task</p>
          <h2>{administrationSectionLabels[section]}</h2>
        </div>
        <Button variant="secondary" onClick={returnToAdministrationTasks}>
          Back to administration tasks
        </Button>
      </div>
      {section === 'health' ? <div className="grant-stack">
        <SystemStatus health={health} info={info} />
        <OperationalSecurityReadinessReadout status={operationalSecurity} />
      </div> : null}

      {section === 'accounts' ? (
        <div className="grant-stack">
          <Card title="Accounts">
            <p>Review the authoritative Grant account roster before changing access.
              Disabling an account revokes its sessions and may affect pending approval seats.</p>
            <AccountList {...grantRc41AccountDiscovery} accounts={accounts} actions={(account) => (
              user.role === 'admin' && account.status === 'enabled' && account.id !== user.id
                ? <Button variant="danger"
                    disabled={task.busy || accountDisableAttempts.includes(account.id)}
                    onClick={() => {
                      setReviewedCreation(null);
                      setReviewedAccount(createAccountDisableReview(account, user));
                    }}>
                    Review disable {account.displayName}
                  </Button>
                : null
            )} />
          </Card>
          {reviewedAccount && sectionRef.current === 'accounts' ? (
            <div ref={accountReviewRef} tabIndex={-1} className="grant-admin-account-review">
            <Card title="Review account disable"
              description="Confirm the exact account. No write occurs merely by opening this review.">
              <dl className="grant-facts">
                <dt>Account</dt><dd>{reviewedAccount.displayName}</dd>
                <dt>Email</dt><dd>{reviewedAccount.detail ?? 'Unavailable'}</dd>
                <dt>Role</dt><dd>{reviewedAccount.roleValue ?? 'Unavailable'}</dd>
                <dt>Current status</dt><dd>{reviewedAccount.status}</dd>
              </dl>
              <Alert tone="warning" title="Disabling an account changes access">
                Existing sessions will be revoked and approval assignments may
                require another administrator to reconcile. This action never
                approves or executes a business request.
              </Alert>
              <div className="grant-actions">
                <Button variant="secondary" disabled={task.busy}
                  onClick={() => setReviewedAccount(null)}>Back to accounts</Button>
                <Button variant="danger" disabled={task.busy}
                  onClick={() => void task.run(confirmAccountDisable)}>
                  Confirm disable account
                </Button>
              </div>
            </Card>
            </div>
          ) : null}
          {accountDisableAttempts.length > 0 ? (
            <Alert tone="warning" title="Reconcile attempted account changes">
              A disable request was attempted for {accountDisableAttempts.length}
              {' '}account(s). Review current account and audit records before
              another action. An ambiguous POST is never retried automatically.
            </Alert>
          ) : null}
          <Card
            title="Create local account"
            description="Only Grant administrators may create users. Review the exact account and role before the one privileged POST. No default credentials are supplied."
          >
            <Form
              busy={task.busy || accountCreateAttempted}
              label="Review account creation"
              onSubmit={() => {
                if (accountCreateAttempted) return;
                setReviewedAccount(null);
                setReviewedCreation(
                  createAccountCreationReview(user, name, email, role, password),
                );
              }}
            >
              <TextField
                label="New username"
                required
                pattern="[a-zA-Z0-9_.@-]+"
                value={name}
                onChange={(event) => { setName(event.target.value); setReviewedCreation(null); }}
              />
              <TextField
                label="New user email"
                type="email"
                required
                value={email}
                onChange={(event) => { setEmail(event.target.value); setReviewedCreation(null); }}
              />
              <TextField
                label="Initial password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                pattern={GRANT_PASSWORD_PATTERN}
                hint={GRANT_PASSWORD_GUIDANCE}
                required
                value={password}
                onChange={(event) => { setPassword(event.target.value); setReviewedCreation(null); }}
              />
              <Select label="New account role" value={role}
                onChange={(value) => { setRole(value); setReviewedCreation(null); }}>
                <option value="member">Member</option>
                <option value="admin">Administrator</option>
              </Select>
            </Form>
            {reviewedCreation && sectionRef.current === 'accounts' ? (
              <div ref={accountReviewRef} tabIndex={-1}
                className="grant-stack grant-admin-account-review" aria-label="Review new account">
                <h3>Review before creating account</h3>
                <dl className="grant-facts">
                  <dt>Username</dt><dd>{reviewedCreation.username}</dd>
                  <dt>Email</dt><dd>{reviewedCreation.email}</dd>
                  <dt>Role</dt><dd>{reviewedCreation.role}</dd>
                  <dt>Initial credential</dt><dd>Provided privately; never displayed in review.</dd>
                </dl>
                <Alert tone="warning" title="New account credentials are sensitive">
                  No account is created until explicit Confirm. The server
                  authenticates the administrator and validates every field.
                  Grant does not send the password or an approval automatically.
                </Alert>
                <div className="grant-actions">
                  <Button variant="secondary" disabled={task.busy}
                    onClick={() => setReviewedCreation(null)}>Back to editor</Button>
                  <Button variant="primary" disabled={task.busy || createAttemptGate.current}
                    onClick={() => void task.run(confirmAccountCreation)}>
                    Confirm create account
                  </Button>
                </div>
              </div>
            ) : null}
            {accountCreateAttempted ? (
              <Alert tone="warning" title="Reconcile the account creation attempt">
                A create request was attempted or acknowledged. Inspect saved
                accounts and the administrator audit before preparing a new
                user; do not automatically repeat an ambiguous POST.
              </Alert>
            ) : null}
          </Card>
        </div>
      ) : null}

      {section === 'audit' ? (
        <Card title="Audit history">
          <p>Existing Grant administrator-scoped audit records. An event records
            an action; it is not independent verification of an external effect.</p>
          <div className="grant-admin-desktop-audit">
            <AuditList events={events} />
          </div>
          <div className="grant-admin-mobile-audit">
            {events.length === 0 ? <p>No audit records are available.</p> : (
              <ul aria-label="Administration mobile audit history">
                {events.map((event) => (
                  <li key={event.id} className="grant-admin-mobile-audit-card">
                    <div className="grant-admin-mobile-audit-heading">
                      <strong>{event.action}</strong>
                      <small>{event.timestamp}</small>
                    </div>
                    <dl className="grant-admin-mobile-audit-facts">
                      <div><dt>Actor</dt><dd>{event.actor ?? 'Unavailable'}</dd></div>
                      <div><dt>Outcome</dt><dd>{event.outcome ?? 'Unavailable'}</dd></div>
                      <div><dt>Reference</dt><dd>{event.reference ?? event.id}</dd></div>
                    </dl>
                    {event.summary ? <p>{event.summary}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}

      {section === 'mail' ? (
        <Card
          title="Mail delivery test"
          description="Transport acceptance does not prove inbox receipt and this test never authorizes execution."
        >
          <Button
            disabled={task.busy||mailTestGuard.current.blocked()}
            onClick={reviewMailTest}
          >
            Review mail test to me
          </Button>
          <AdministrationMailReviewConfirmation
            reviewed={reviewedMail}
            busy={task.busy||mailTestGuard.current.blocked()}
            valid={Boolean(sectionRef.current==='mail'
              &&isCurrentAdministrationMailReview(reviewedMail,user))}
            onBack={()=>setReviewedMail(null)}
            onConfirm={()=>{void task.run(confirmMailTest);}}
          />
          {mailTestGuard.current.blocked()&&<Alert tone="warning"
            title="Review prior mail test before any separate attempt">
            {mailAttempted
              ? 'An SMTP test email may have been accepted; an uncertain result must not be retried automatically.'
              : 'A mail test is currently being verified.'}
            {' '}Inspect the recipient's actual mailbox and administrative
            audit evidence before scheduling any separate test. This
            client does not prove inbox receipt or grant an approval.
            Another test requires fresh explicit operator review.
          </Alert>}
        </Card>
      ) : null}

      {section === 'lifecycle' ? (
        <div className="grant-stack">
          <Card title="Lifecycle & recovery">
            <p>Host backup, database restore, installation origin, TLS and
              upgrades still require documented operator procedures. Foundation
              renders common administration patterns, not execution authority.</p>
          </Card>
          <GrantConfigurationPortabilityTask />
        </div>
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
          guidance={GRANT_PASSWORD_GUIDANCE}
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
          {...grantRc41SessionDiscovery}
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
