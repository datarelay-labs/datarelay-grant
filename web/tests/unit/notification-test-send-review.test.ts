import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createNotificationTestSendReview,
  isCurrentNotificationTestSendReview,
  NotificationTestSendConfirmation,
  createNotificationTestSendAttemptGuard,
  submitReviewedNotificationTestSend,
} from '../../src/notification_test_send_review';
import { templateDraftSignature } from '../../src/notification_preview';
import type { NotificationEvent, NotificationTemplateSet } from '../../src/types';

const event: NotificationEvent = 'requested';
const templates = Object.fromEntries([
  'requested', 'reminder', 'approved', 'denied', 'expired', 'cancelled',
  'execution_succeeded', 'execution_failed', 'execution_unknown',
].map((name) => [name, { subject: 'Request {{request_title}}', body: 'Review {{target}}' }])) as NotificationTemplateSet['templates'];
const saved: NotificationTemplateSet = {
  id: 'set-a', name: 'Operator emails', enabled: true, templates,
  created_at: 100, updated_at: 101,
};
const sample = {
  request_title: 'Change window', request_url: 'https://example.invalid/requests/test',
  external_id: 'REF-77', action_kind: 'service.deploy', target: 'isolated-node',
  reason: 'Approved lab test only', deadline: '2026-10-11T10:00:00Z',
  decision_state: 'AWAITING', execution_state: 'NOT_STARTED',
};
const inputs = JSON.stringify(['Change window', 'isolated-node',
  'Approved lab test only', 'AWAITING', 'NOT_STARTED']);
function preview(body = 'Review isolated-node') {
  return {
    template_set_id: 'set-a', template_updated_at: saved.updated_at, preview_hash: 'c'.repeat(64), event,
    rendered: {
      subject: 'Request Change window', body,
      sender_display_name: 'DataRelay Grant', brand_name: 'DataRelay Grant',
    },
    transport_accepted: false, receipt_confirmed: false, execution_allowed: false,
  };
}
function intent() {
  return createNotificationTestSendReview(
    saved, event, sample, inputs, preview(),
  );
}
function html(valid = true, text = '<img src=x onerror=alert(1)>') {
  const row = createNotificationTestSendReview(saved, event, sample, inputs, preview(text));
  return renderToStaticMarkup(createElement(NotificationTestSendConfirmation, {
    reviewed: row, valid, busy: false,
    onCancel: () => undefined, onConfirm: () => undefined,
  }));
}

describe('B4 admin test email preview -> separately reviewed one-shot send', () => {
  it('snapshots an exact saved template, rendered preview and sample before ANY send', () => {
    const reviewed = intent();
    expect(reviewed.templateSetId).toBe(saved.id);
    expect(reviewed.event).toBe('requested');
    expect(reviewed.templateSignature).toBe(templateDraftSignature(saved));
    expect(reviewed.sample).toEqual(sample);
    expect(reviewed.preview.rendered.subject).toBe('Request Change window');
    expect(isCurrentNotificationTestSendReview(
      reviewed, saved, event, inputs, false,
    )).toBe(true);
  });

  it('refuses a preview from another template, event or any reported transport effect', () => {
    const altered = [
      { ...preview(), template_set_id: 'other-set' },
      { ...preview(), event: 'denied' as const },
      { ...preview(), execution_allowed: true },
      { ...preview(), transport_accepted: true },
      { ...preview(), receipt_confirmed: true },
    ];
    for (const response of altered) {
      expect(() => createNotificationTestSendReview(
        saved, event, sample, inputs, response,
      )).toThrow('TEST_SEND_PREVIEW_MISMATCH');
    }
  });

  it('requires fresh review after template content, status, event or sample changes', () => {
    const reviewed = intent();
    expect(isCurrentNotificationTestSendReview(
      reviewed, { ...saved, templates: {
        ...saved.templates, requested: { subject: 'Changed subject', body: 'New' },
      } }, event, inputs, false,
    )).toBe(false);
    expect(isCurrentNotificationTestSendReview(
      reviewed, { ...saved, enabled: false }, event, inputs, false,
    )).toBe(false);
    expect(isCurrentNotificationTestSendReview(
      reviewed, saved, 'denied', inputs, false,
    )).toBe(false);
    expect(isCurrentNotificationTestSendReview(
      reviewed, saved, event, JSON.stringify(['altered input']), false,
    )).toBe(false);
    expect(isCurrentNotificationTestSendReview(
      reviewed, saved, event, inputs, true,
    )).toBe(false);
  });

  it('renders real subject/body safely, signed-in admin recipient and explicit final confirmation', () => {
    const output = html();
    expect(output).toContain('Confirm test email to my account');
    expect(output).toContain('Request Change window');
    expect(output).toContain('&lt;img');
    expect(output).not.toContain('<img src=x');
    expect(output).toContain('signed-in administrator');
    expect(output).toContain('Confirm send test email');
    expect(output).toContain('does not approve or execute');
    expect(output).not.toContain('Execute</button>');
    const invalid = html(false);
    expect(invalid).toContain('disabled=""');
  });

  it('one synchronous claim prevents two concurrent sends before React state catches up', async () => {
    const gate = createNotificationTestSendAttemptGuard();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let posts = 0;
    async function confirm() {
      if (!gate.claim()) return false;
      gate.markPostStarted();
      try { posts++; await pending; return true; }
      finally { gate.settled(); }
    }
    const first = confirm();
    const second = confirm();
    expect(posts).toBe(1);
    expect(gate.blocked()).toBe(true);
    release();
    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(gate.blocked()).toBe(true);
  });

  it('keeps an ambiguous SMTP POST outcome latched, without automatic retry', () => {
    const gate = createNotificationTestSendAttemptGuard();
    expect(gate.claim()).toBe(true);
    gate.markPostStarted();
    gate.settled();
    expect(gate.claim()).toBe(false);
    expect(gate.blocked()).toBe(true);
  });

  it('pre-POST GET failure can release the claim because no mail was sent', () => {
    const gate = createNotificationTestSendAttemptGuard();
    expect(gate.claim()).toBe(true);
    gate.settled();
    expect(gate.blocked()).toBe(false);
    expect(gate.claim()).toBe(true);
  });

  it('an in-flight test send is not unlocked by a racing refresh', () => {
    const gate = createNotificationTestSendAttemptGuard();
    gate.claim(); gate.markPostStarted();
    expect(gate.readSucceeded()).toBe(false);
    expect(gate.blocked()).toBe(true);
  });

  it('only an explicit successful fresh read re-enables another manual reviewed send', () => {
    const gate = createNotificationTestSendAttemptGuard();
    gate.claim(); gate.markPostStarted(); gate.settled();
    expect(gate.readSucceeded()).toBe(true);
    expect(gate.blocked()).toBe(false);
    expect(gate.claim()).toBe(true);
  });

  it('reads one authoritative saved template then makes one reviewed SMTP POST only', async () => {
    const gate = createNotificationTestSendAttemptGuard();
    const calls: string[] = [];
    const result = await submitReviewedNotificationTestSend(
      intent(), gate,
      async () => { calls.push('GET saved template'); return [saved]; },
      async (reviewed) => {
        calls.push('POST test email');
        expect(reviewed.sample).toEqual(sample);
        expect(reviewed.event).toBe('requested');
        return { transport_accepted: true, receipt_confirmed: false };
      },
    );
    expect(result).toEqual({ transport_accepted: true, receipt_confirmed: false });
    expect(calls).toEqual(['GET saved template', 'POST test email']);
    expect(gate.blocked()).toBe(true);
  });

  it('fails before POST when another admin edited the persisted template', async () => {
    const gate = createNotificationTestSendAttemptGuard();
    let writes = 0;
    await expect(submitReviewedNotificationTestSend(
      intent(), gate,
      async () => [{ ...saved, templates: {
        ...saved.templates, requested: { subject: 'Changed in parallel', body: 'Other' },
      } }],
      async () => { writes++; return { accepted: true }; },
    )).rejects.toThrow('TEST_SEND_SAVED_TEMPLATE_CHANGED');
    expect(writes).toBe(0);
    expect(gate.blocked()).toBe(false);
  });

  it('does not retry an ambiguous SMTP effect or unlock until explicit fresh read', async () => {
    const gate = createNotificationTestSendAttemptGuard();
    let posts = 0, reads = 0;
    await expect(submitReviewedNotificationTestSend(
      intent(), gate,
      async () => { reads++; return [saved]; },
      async () => { posts++; throw new Error('SMTP_OUTCOME_UNKNOWN'); },
    )).rejects.toThrow('SMTP_OUTCOME_UNKNOWN');
    expect(posts).toBe(1);
    expect(reads).toBe(1);
    expect(await submitReviewedNotificationTestSend(
      intent(), gate,
      async () => { reads++; return [saved]; },
      async () => { posts++; return { accepted: true }; },
    )).toBeNull();
    expect(posts).toBe(1);
    expect(reads).toBe(1);
    expect(gate.blocked()).toBe(true);
  });

  it('suppresses a second same-render submit during the saved-template GET', async () => {
    const gate = createNotificationTestSendAttemptGuard();
    let resolveRead!: (rows: NotificationTemplateSet[]) => void;
    const pending = new Promise<NotificationTemplateSet[]>((resolve) => {
      resolveRead = resolve;
    });
    let reads = 0, posts = 0;
    const read = () => { reads++; return pending; };
    const post = async () => { posts++; return 'accepted'; };
    const first = submitReviewedNotificationTestSend(intent(), gate, read, post);
    const second = submitReviewedNotificationTestSend(intent(), gate, read, post);
    expect(reads).toBe(1);
    expect(posts).toBe(0);
    resolveRead([saved]);
    expect(await Promise.all([first, second])).toEqual(['accepted', null]);
    expect(posts).toBe(1);
    expect(gate.blocked()).toBe(true);
  });
});
