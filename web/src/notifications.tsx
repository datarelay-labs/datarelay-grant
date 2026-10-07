import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  TextField,
  type AccountProjection,
} from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask, when } from './common';
import type {
  NotificationBranding,
  NotificationDelivery,
  NotificationEvent,
  NotificationEventTemplate,
  NotificationTemplateSet,
} from './types';

const events: NotificationEvent[] = [
  'requested',
  'reminder',
  'approved',
  'denied',
  'expired',
  'cancelled',
  'execution_succeeded',
  'execution_failed',
  'execution_unknown',
];

const defaults: Record<NotificationEvent, NotificationEventTemplate> = {
  requested: {
    subject: '[Grant] Approval: {{request_title}}',
    body: 'Review the exact action and sign in as the assigned approver.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nAction: {{action_kind}}\nTarget: {{target}}\nReason: {{reason}}\nDeadline: {{deadline}}',
  },
  reminder: {
    subject: '[Grant] Reminder: {{request_title}}',
    body: 'This approval request is still waiting for your explicit decision.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDeadline: {{deadline}}',
  },
  approved: {
    subject: '[Grant] Approved: {{request_title}}',
    body: 'The request was explicitly approved.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}\nExecution: {{execution_state}}',
  },
  denied: {
    subject: '[Grant] Denied: {{request_title}}',
    body: 'The request was explicitly denied.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}',
  },
  expired: {
    subject: '[Grant] Expired: {{request_title}}',
    body: 'The request expired without a valid executable approval.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}',
  },
  cancelled: {
    subject: '[Grant] Cancelled: {{request_title}}',
    body: 'The request was cancelled.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}',
  },
  execution_succeeded: {
    subject: '[Grant] Execution succeeded: {{request_title}}',
    body: 'The connected executor reported success.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}',
  },
  execution_failed: {
    subject: '[Grant] Execution failed: {{request_title}}',
    body: 'The connected executor reported failure.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}',
  },
  execution_unknown: {
    subject: '[Grant] Execution state unknown: {{request_title}}',
    body: 'Execution requires reconciliation because its final state is unknown.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}',
  },
};

type PreviewResult = {
  event: NotificationEvent;
  rendered: {
    subject: string;
    body: string;
    sender_display_name: string;
    brand_name: string;
  };
  transport_accepted: boolean;
  receipt_confirmed: boolean;
  execution_allowed: boolean;
};

type NotificationView = 'templates' | 'delivery' | 'branding';
type TemplateView = 'list' | 'editor';

const copyDefaults = () =>
  Object.fromEntries(events.map((event) => [event, { ...defaults[event] }])) as Record<
    NotificationEvent,
    NotificationEventTemplate
  >;

function eventLabel(value: NotificationEvent): string {
  return value
    .replaceAll('_', ' ')
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

export function Notifications() {
  const [sets, setSets] = useState<NotificationTemplateSet[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [users, setUsers] = useState<AccountProjection[]>([]);
  const [branding, setBranding] = useState<NotificationBranding>({
    brand_name: 'DataRelay Grant',
    sender_display_name: 'DataRelay Grant',
    logo_asset: '/assets/datarelay-grant-icon.svg',
  });
  const [view, setView] = useState<NotificationView>('templates');
  const [templateView, setTemplateView] = useState<TemplateView>('list');
  const [brandName, setBrandName] = useState('DataRelay Grant');
  const [senderName, setSenderName] = useState('DataRelay Grant');
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [event, setEvent] = useState<NotificationEvent>('requested');
  const [draftTemplates, setDraftTemplates] =
    useState<Record<NotificationEvent, NotificationEventTemplate>>(copyDefaults());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [recipient, setRecipient] = useState('');
  const [sampleTitle, setSampleTitle] = useState('Sample approval request');
  const [sampleTarget, setSampleTarget] = useState('sample-target');
  const [sampleReason, setSampleReason] = useState('Notification preview');
  const [decisionState, setDecisionState] = useState('AWAITING');
  const [executionState, setExecutionState] = useState('NOT_STARTED');
  const task = useTask();

  const load = async () => {
    const [templateSets, deliveryHealth, safeVariables, currentBranding, accounts] =
      await Promise.all([
        api<NotificationTemplateSet[]>('/notification-template-sets'),
        api<{ deliveries: NotificationDelivery[] }>('/notification-deliveries'),
        api<{ variables: string[] }>('/notification-variables'),
        api<NotificationBranding>('/notification-branding'),
        api<AccountProjection[]>('/admin/users'),
      ]);
    setSets(templateSets);
    setDeliveries(deliveryHealth.deliveries);
    setVariables(safeVariables.variables);
    setBranding(currentBranding);
    setBrandName(currentBranding.brand_name);
    setSenderName(currentBranding.sender_display_name);
    setUsers(accounts);
  };

  useEffect(() => {
    void task.run(load);
  }, []);

  function resetEditor() {
    setEditing('');
    setName('');
    setEnabled(true);
    setEvent('requested');
    setDraftTemplates(copyDefaults());
    setPreview(null);
  }

  function startCreate() {
    resetEditor();
    setTemplateView('editor');
  }

  function edit(row: NotificationTemplateSet) {
    setEditing(row.id);
    setName(row.name);
    setEnabled(row.enabled);
    setDraftTemplates(structuredClone(row.templates));
    setEvent('requested');
    setPreview(null);
    setTemplateView('editor');
  }

  function updateCurrent(field: 'subject' | 'body', value: string) {
    setDraftTemplates({
      ...draftTemplates,
      [event]: { ...draftTemplates[event], [field]: value },
    });
  }

  async function save() {
    const payload = {
      name,
      templates: draftTemplates,
      ...(editing ? { enabled } : {}),
    };
    const saved = await api<NotificationTemplateSet>(
      editing ? '/notification-template-sets/' + editing : '/notification-template-sets',
      editing ? 'PUT' : 'POST',
      payload,
    );
    const wasEditing = Boolean(editing);
    setEditing(saved.id);
    await load();
    task.setNotice(
      wasEditing
        ? 'Notification template set updated. Existing requests keep their snapshot.'
        : 'Notification template set created.',
    );
  }

  function sample() {
    return {
      request_title: sampleTitle,
      request_url: location.origin + '/requests/sample',
      external_id: 'preview-sample',
      action_kind: 'sample.operation',
      target: sampleTarget,
      reason: sampleReason,
      deadline: new Date(Date.now() + 3600000).toISOString(),
      decision_state: decisionState,
      execution_state: executionState,
    };
  }

  async function runPreview() {
    if (!editing) return;
    setPreview(
      await api<PreviewResult>(
        '/notification-template-sets/' + editing + '/preview',
        'POST',
        { event, sample: sample() },
      ),
    );
  }

  async function sendTest(toDesignated: boolean) {
    if (!editing) return;
    const result = await api<{
      transport_accepted: boolean;
      receipt_confirmed: boolean;
      execution_allowed: boolean;
      event_id: string;
    }>('/notification-template-sets/' + editing + '/test-send', 'POST', {
      event,
      sample: sample(),
      ...(toDesignated && recipient ? { recipient_user_id: recipient } : {}),
    });
    task.setNotice(
      'Transport accepted: ' +
        String(result.transport_accepted) +
        '. Inbox receipt confirmed: ' +
        String(result.receipt_confirmed) +
        '. Test messages never authorize execution.',
    );
  }

  async function saveBranding() {
    const updated = await api<NotificationBranding>('/notification-branding', 'PUT', {
      brand_name: brandName,
      sender_display_name: senderName,
    });
    setBranding(updated);
    task.setNotice('Notification branding updated for future request snapshots.');
  }

  async function resend(id: string) {
    await api('/deliveries/' + id + '/resend', 'POST');
    await load();
    task.setNotice('Notification resend scheduled. This cannot replay an action.');
  }

  return (
    <div className="grant-stack">
      {task.feedback}
      <section className="grant-page-heading" aria-labelledby="grant-notifications-title">
        <div>
          <p className="grant-eyebrow">Configuration</p>
          <h2 id="grant-notifications-title">Notifications</h2>
          <p>
            Configure event messages, inspect delivery health and control system-owned
            branding without mixing those tasks into one operations canvas.
          </p>
        </div>
      </section>

      <nav className="grant-tabs" aria-label="Notification sections">
        <button
          type="button"
          aria-current={view === 'templates' ? 'page' : undefined}
          onClick={() => setView('templates')}
        >
          Template Sets
        </button>
        <button
          type="button"
          aria-current={view === 'delivery' ? 'page' : undefined}
          onClick={() => setView('delivery')}
        >
          Delivery Health
        </button>
        <button
          type="button"
          aria-current={view === 'branding' ? 'page' : undefined}
          onClick={() => setView('branding')}
        >
          Branding
        </button>
      </nav>

      {view === 'templates' && templateView === 'list' ? (
        <Card
          title="Template Sets"
          description="Each set owns the complete Grant 1.0 event family. Existing requests keep their original snapshot."
          actions={<Button onClick={startCreate}>Create template set</Button>}
        >
          <div className="grant-table-scroll">
            <table className="grant-table">
              <thead>
                <tr>
                  <th>Template set</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sets.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className="grant-table-link"
                        onClick={() => edit(row)}
                      >
                        {row.name}
                      </button>
                      <small>{row.id}</small>
                    </td>
                    <td>{row.enabled ? 'Enabled' : 'Disabled'}</td>
                    <td>{events.length} required events</td>
                    <td>{when(row.updated_at)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={task.busy}
                        onClick={() => edit(row)}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!sets.length ? (
            <p>No custom template sets configured. Policies may use the system defaults.</p>
          ) : null}
        </Card>
      ) : null}

      {view === 'templates' && templateView === 'editor' ? (
        <>
          <section className="grant-detail-header" aria-label="Notification template workspace">
            <div>
              <Button variant="ghost" onClick={() => setTemplateView('list')}>
                ← Back to template sets
              </Button>
              <p className="grant-eyebrow">Notification template set</p>
              <h2>{editing ? name || 'Template set' : 'New template set'}</h2>
              <p>
                Edit one event at a time. Preview and test use the same render contract as
                delivery.
              </p>
            </div>
          </section>

          <Card
            title={editing ? 'Template set details' : 'Create notification template set'}
            description="All Grant events stay in one coherent set; editing never rewrites existing request snapshots."
          >
            <Form
              busy={task.busy}
              onSubmit={() => void task.run(save)}
              label={editing ? 'Save template set' : 'Create template set'}
            >
              <TextField
                label="Template set name"
                required
                maxLength={100}
                value={name}
                onChange={(change) => setName(change.target.value)}
              />

              <div className="grant-event-editor">
                <div>
                  <p className="grant-field-label">Event template</p>
                  <div className="grant-event-tabs" role="list" aria-label="Notification events">
                    {events.map((item) => (
                      <button
                        type="button"
                        key={item}
                        aria-current={event === item ? 'page' : undefined}
                        onClick={() => {
                          setEvent(item);
                          setPreview(null);
                        }}
                      >
                        {eventLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>
                <TextField
                  label="Event subject"
                  required
                  maxLength={250}
                  value={draftTemplates[event].subject}
                  onChange={(change) => updateCurrent('subject', change.target.value)}
                />
                <TextArea
                  label="Event body"
                  required
                  value={draftTemplates[event].body}
                  onChange={(value) => updateCurrent('body', value)}
                />
              </div>

              {editing ? (
                <label className="grant-checkbox">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(change) => setEnabled(change.target.checked)}
                  />
                  Template set enabled
                </label>
              ) : null}
            </Form>

            <details className="grant-safe-variables">
              <summary>Safe variables</summary>
              <p>
                {variables.map((variable) => (
                  <code key={variable}>{'{{' + variable + '}}'} </code>
                ))}
              </p>
            </details>
          </Card>

          {editing ? (
            <Card
              title="Preview & test send"
              description="Transport acceptance is distinct from inbox receipt. Test messages never authorize execution."
            >
              <div className="grant-grid">
                <TextField
                  label="Sample request title"
                  value={sampleTitle}
                  onChange={(change) => setSampleTitle(change.target.value)}
                />
                <TextField
                  label="Sample target"
                  value={sampleTarget}
                  onChange={(change) => setSampleTarget(change.target.value)}
                />
                <TextField
                  label="Sample decision state"
                  value={decisionState}
                  onChange={(change) => setDecisionState(change.target.value)}
                />
                <TextField
                  label="Sample execution state"
                  value={executionState}
                  onChange={(change) => setExecutionState(change.target.value)}
                />
              </div>
              <TextArea
                label="Sample reason"
                value={sampleReason}
                onChange={setSampleReason}
              />
              <Select
                label="Designated test recipient"
                value={recipient}
                onChange={setRecipient}
                required={false}
              >
                <option value="">Authenticated administrator</option>
                {users
                  .filter((user) => user.status === 'enabled')
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
              </Select>
              <div className="grant-actions">
                <Button
                  variant="secondary"
                  disabled={task.busy}
                  onClick={() => void task.run(runPreview)}
                >
                  Preview rendered message
                </Button>
                <Button
                  variant="secondary"
                  disabled={task.busy}
                  onClick={() => void task.run(() => sendTest(false))}
                >
                  Send test to me
                </Button>
                <Button
                  variant="secondary"
                  disabled={task.busy || !recipient}
                  onClick={() => void task.run(() => sendTest(true))}
                >
                  Send to designated test recipient
                </Button>
              </div>
              {preview ? (
                <Alert tone="warning" title={preview.rendered.subject}>
                  <pre className="grant-mono">{preview.rendered.body}</pre>
                  <p>
                    Sender: {preview.rendered.sender_display_name} · transport accepted:{' '}
                    {String(preview.transport_accepted)} · inbox receipt confirmed:{' '}
                    {String(preview.receipt_confirmed)} · execution allowed:{' '}
                    {String(preview.execution_allowed)}
                  </p>
                </Alert>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      {view === 'delivery' ? (
        <Card
          title="Delivery Health"
          description="Failures and retries are notification state only. Resending a notification never replays an approved action."
          actions={
            <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>
              Refresh
            </Button>
          }
        >
          <div className="grant-table-scroll">
            <table className="grant-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>State</th>
                  <th>Attempts</th>
                  <th>Request</th>
                  <th>Last error</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {deliveries.slice(0, 100).map((item) => (
                  <tr key={item.id}>
                    <td>{eventLabel(item.event_type as NotificationEvent)}</td>
                    <td>
                      {item.state}
                      <small>
                        transport {String(item.transport_accepted)} · receipt{' '}
                        {String(item.receipt_confirmed)}
                      </small>
                    </td>
                    <td>{item.attempts}</td>
                    <td><code>{item.request_id}</code></td>
                    <td>{item.last_error ?? '—'}</td>
                    <td>{when(item.created_at)}</td>
                    <td>
                      {item.state === 'FAILED' ? (
                        <Button
                          variant="secondary"
                          disabled={task.busy}
                          onClick={() => void task.run(() => resend(item.id))}
                        >
                          Schedule resend
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!deliveries.length ? <p>No email delivery events recorded yet.</p> : null}
        </Card>
      ) : null}

      {view === 'branding' ? (
        <Card
          title="Branding"
          description="System-owned product identity applies to future notification snapshots; templates can change text but not approval authority."
        >
          <Form
            busy={task.busy}
            onSubmit={() => void task.run(saveBranding)}
            label="Save branding"
          >
            <TextField
              label="Brand name"
              required
              maxLength={100}
              value={brandName}
              onChange={(change) => setBrandName(change.target.value)}
            />
            <TextField
              label="Sender display name"
              required
              maxLength={100}
              value={senderName}
              onChange={(change) => setSenderName(change.target.value)}
            />
          </Form>
          <p>
            System logo: <code>{branding.logo_asset}</code>
          </p>
        </Card>
      ) : null}
    </div>
  );
}
