import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  TextField,
} from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask, when } from './common';
import {
  hasUnsavedTemplateChanges, NotificationPreviewActions,
  NotificationRequestLink, templateDraftSignature,
} from './notification_preview';
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

type DeliveryState = 'ALL' | 'PENDING' | 'SENDING' | 'FAILED' | 'DELIVERED' | 'SUPERSEDED';
type DeliveryFilter = {
  state: DeliveryState;
  event: 'ALL' | NotificationEvent;
  requestId: string;
};
type DeliveryHistoryPage = {
  deliveries: NotificationDelivery[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
};
const defaultDeliveryFilters: DeliveryFilter = { state: 'ALL', event: 'ALL', requestId: '' };
const DELIVERY_PAGE_LIMIT = 50;
const deliveryStates: DeliveryState[] = ['ALL', 'PENDING', 'SENDING', 'FAILED', 'DELIVERED', 'SUPERSEDED'];

// Filters are deliberately bounded and only narrow the current administrator
// route. Querying health never issues a delivery resend or execution grant.
export function notificationDeliveryQuery(filters: DeliveryFilter, offset: number): string {
  const requestId = filters.requestId.trim();
  if (!deliveryStates.includes(filters.state) ||
      (filters.event !== 'ALL' && !events.includes(filters.event)) ||
      filters.requestId.length > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    throw new Error('INVALID_DELIVERY_HEALTH_FILTER');
  }
  const query = new URLSearchParams({
    limit: String(DELIVERY_PAGE_LIMIT), offset: String(offset),
  });
  if (filters.state !== 'ALL') query.set('state', filters.state);
  if (filters.event !== 'ALL') query.set('event_type', filters.event);
  if (requestId) query.set('request_id', requestId);
  return '/notification-deliveries?' + query.toString();
}

export function deliveryPageLabel(page: Pick<DeliveryHistoryPage,
  'deliveries' | 'total' | 'limit' | 'offset' | 'has_more'> | null): string {
  if (!page ||
      !Number.isSafeInteger(page.total) || page.total < 0 ||
      !Number.isSafeInteger(page.offset) || page.offset < 0) {
    return 'Delivery page unavailable';
  }
  if (page.total === 0) return 'No matching email delivery events';
  if (!page.deliveries.length) return 'No deliveries on this page of ' + page.total + ' matching events';
  return String(page.offset + 1) + '–' + String(page.offset + page.deliveries.length) +
    ' of ' + page.total + ' matching deliveries';
}

export function NotificationDeliveryHealth() {
  const [draft, setDraft] = useState<DeliveryFilter>(defaultDeliveryFilters);
  const [applied, setApplied] = useState<DeliveryFilter>(defaultDeliveryFilters);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<DeliveryHistoryPage | null>(null);
  const task = useTask();

  async function loadPage() {
    const next = await api<DeliveryHistoryPage>(notificationDeliveryQuery(applied, offset));
    setPage(next);
  }
  useEffect(() => { void task.run(loadPage); }, [applied, offset]);

  function apply() {
    setOffset(0);
    setPage(null);
    setApplied({ ...draft });
  }
  function clear() {
    setDraft({ ...defaultDeliveryFilters });
    setPage(null);
    setOffset(0);
    setApplied({ ...defaultDeliveryFilters });
  }
  async function scheduleResend(id: string) {
    // Only explicit administrator button activation reaches this write.
    await api('/deliveries/' + id + '/resend', 'POST');
    await loadPage();
    task.setNotice('Notification resend scheduled. This cannot replay a protected action.');
  }
  return <div className="grant-stack">
    {task.feedback}
    <Card title="Delivery Health"
      description="Search stored email delivery events. Resend is a separate explicit notification-only operation; transport acceptance never proves inbox receipt."
      actions={<Button variant="secondary" disabled={task.busy}
        onClick={() => void task.run(loadPage)}>Refresh</Button>}>
      <section className="grant-stack" aria-label="Filter delivery health">
        <div className="grant-grid">
          <Select label="Delivery state" required={false} value={draft.state}
            onChange={(state) => setDraft({ ...draft, state: state as DeliveryState })}>
            {deliveryStates.map((state) => <option value={state} key={state}>
              {state === 'ALL' ? 'All states' : state}
            </option>)}
          </Select>
          <Select label="Notification event" required={false} value={draft.event}
            onChange={(event) => setDraft({
              ...draft, event: event as DeliveryFilter['event'],
            })}>
            <option value="ALL">All events</option>
            {events.map((event) => <option key={event} value={event}>
              {eventLabel(event)}
            </option>)}
          </Select>
          <TextField label="Exact request ID" required={false} value={draft.requestId}
            placeholder="Optional request ID"
            onChange={(event) => setDraft({
              ...draft, requestId: event.target.value.slice(0, 100),
            })} />
        </div>
        <div className="grant-actions">
          <Button disabled={task.busy} onClick={apply}>Apply filters</Button>
          <Button variant="ghost" disabled={task.busy} onClick={clear}>Clear filters</Button>
        </div>
      </section>
      <p aria-live="polite">{deliveryPageLabel(page)}</p>
      <p>Receipt is not independently confirmed by this delivery ledger.</p>
      <div className="grant-table-scroll">
        <table className="grant-table">
          <thead><tr>
            <th>Event</th><th>State</th><th>Attempts</th><th>Request</th>
            <th>Last error</th><th>Created</th><th aria-label="Actions" />
          </tr></thead>
          <tbody>{page?.deliveries.map((item) => <tr key={item.id}>
            <td>{eventLabel(item.event_type as NotificationEvent)}</td>
            <td>{item.state}<small>
              transport {String(item.transport_accepted)} · receipt {String(item.receipt_confirmed)}
            </small></td>
            <td>{item.attempts}</td>
            <td><NotificationRequestLink requestId={item.request_id} /></td>
            <td>{item.last_error ?? '—'}</td>
            <td>{when(item.created_at)}</td>
            <td>{item.state === 'FAILED' ? <Button variant="secondary"
              disabled={task.busy}
              onClick={() => void task.run(() => scheduleResend(item.id))}>
              Schedule resend
            </Button> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="grant-actions">
        <Button variant="secondary" disabled={task.busy || offset <= 0}
          onClick={() => { setPage(null); setOffset(Math.max(0, offset - DELIVERY_PAGE_LIMIT)); }}>
          Previous page
        </Button>
        <Button variant="secondary"
          disabled={task.busy || !page?.has_more || offset + DELIVERY_PAGE_LIMIT > 100000}
          onClick={() => { setPage(null); setOffset(offset + DELIVERY_PAGE_LIMIT); }}>
          Next page
        </Button>
      </div>
      {page?.has_more && offset + DELIVERY_PAGE_LIMIT > 100000 ? (
        <p>Use a narrower filter to review records beyond the bounded paging window.</p>
      ) : null}
    </Card>
  </div>;
}

export function Notifications() {
  const [sets, setSets] = useState<NotificationTemplateSet[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [branding, setBranding] = useState<NotificationBranding>({
    brand_name: 'DataRelay Grant',
    sender_display_name: 'DataRelay Grant',
    logo_asset: '/assets/datarelay-grant-icon.svg',
  });
  const [view, setView] = useState<NotificationView>('templates');
  const [templateView, setTemplateView] = useState<TemplateView>('list');
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const previewGeneration = useRef(0);
  const [brandName, setBrandName] = useState('DataRelay Grant');
  const [senderName, setSenderName] = useState('DataRelay Grant');
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [event, setEvent] = useState<NotificationEvent>('requested');
  const [draftTemplates, setDraftTemplates] =
    useState<Record<NotificationEvent, NotificationEventTemplate>>(copyDefaults());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [sampleTitle, setSampleTitle] = useState('Sample approval request');
  const [sampleTarget, setSampleTarget] = useState('sample-target');
  const [sampleReason, setSampleReason] = useState('Notification preview');
  const [decisionState, setDecisionState] = useState('AWAITING');
  const [executionState, setExecutionState] = useState('NOT_STARTED');
  const task = useTask();
  const draftDirty = hasUnsavedTemplateChanges(savedSignature, {
    name, enabled, templates: draftTemplates,
  });

  function invalidatePreview() {
    previewGeneration.current += 1;
    setPreview(null);
  }

  const load = async () => {
    const [templateSets, safeVariables, currentBranding] =
      await Promise.all([
        api<NotificationTemplateSet[]>('/notification-template-sets'),
        api<{ variables: string[] }>('/notification-variables'),
        api<NotificationBranding>('/notification-branding'),
      ]);
    setSets(templateSets);
    setVariables(safeVariables.variables);
    setBranding(currentBranding);
    setBrandName(currentBranding.brand_name);
    setSenderName(currentBranding.sender_display_name);
  };

  useEffect(() => {
    void task.run(load);
  }, []);

  function resetEditor() {
    setEditing('');
    setSavedSignature(null);
    setName('');
    setEnabled(true);
    setEvent('requested');
    setDraftTemplates(copyDefaults());
    invalidatePreview();
  }

  function startCreate() {
    resetEditor();
    setTemplateView('editor');
  }

  function edit(row: NotificationTemplateSet) {
    setEditing(row.id);
    setSavedSignature(templateDraftSignature(row));
    setName(row.name);
    setEnabled(row.enabled);
    setDraftTemplates(structuredClone(row.templates));
    setEvent('requested');
    invalidatePreview();
    setTemplateView('editor');
  }

  function updateCurrent(field: 'subject' | 'body', value: string) {
    setDraftTemplates({
      ...draftTemplates,
      [event]: { ...draftTemplates[event], [field]: value },
    });
    invalidatePreview();
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
    setName(saved.name);
    setEnabled(saved.enabled);
    setDraftTemplates(structuredClone(saved.templates));
    setSavedSignature(templateDraftSignature(saved));
    invalidatePreview();
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
    if (!editing || draftDirty) return;
    const generation = previewGeneration.current;
    const rendered = await api<PreviewResult>(
      '/notification-template-sets/' + editing + '/preview',
      'POST',
      { event, sample: sample() },
    );
    if (previewGeneration.current === generation) setPreview(rendered);
  }

  async function sendTest() {
    if (!editing || draftDirty) return;
    const result = await api<{
      transport_accepted: boolean;
      receipt_confirmed: boolean;
      execution_allowed: boolean;
      event_id: string;
    }>('/notification-template-sets/' + editing + '/test-send', 'POST', {
      event,
      sample: sample(),
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
    invalidatePreview();
    task.setNotice('Notification branding updated for future request snapshots.');
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
                onChange={(change) => {
                  setName(change.target.value);
                  invalidatePreview();
                }}
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
                          invalidatePreview();
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
                    onChange={(change) => {
                      setEnabled(change.target.checked);
                      invalidatePreview();
                    }}
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
                  onChange={(change) => {
                    setSampleTitle(change.target.value);
                    invalidatePreview();
                  }}
                />
                <TextField
                  label="Sample target"
                  value={sampleTarget}
                  onChange={(change) => {
                    setSampleTarget(change.target.value);
                    invalidatePreview();
                  }}
                />
                <TextField
                  label="Sample decision state"
                  value={decisionState}
                  onChange={(change) => {
                    setDecisionState(change.target.value);
                    invalidatePreview();
                  }}
                />
                <TextField
                  label="Sample execution state"
                  value={executionState}
                  onChange={(change) => {
                    setExecutionState(change.target.value);
                    invalidatePreview();
                  }}
                />
              </div>
              <TextArea
                label="Sample reason"
                value={sampleReason}
                onChange={(value) => {
                  setSampleReason(value);
                  invalidatePreview();
                }}
              />
              <NotificationPreviewActions
                saved={Boolean(editing)}
                dirty={draftDirty}
                busy={task.busy}
                onPreview={() => void task.run(runPreview)}
                onTestSend={() => void task.run(sendTest)}
              />
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

      {view === 'delivery' ? <NotificationDeliveryHealth /> : null}

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
