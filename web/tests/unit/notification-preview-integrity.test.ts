import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  hasUnsavedTemplateChanges, NotificationPreviewActions,
  NotificationRequestLink, templateDraftSignature,
} from '../../src/notification_preview';
import type { NotificationTemplateSet } from '../../src/types';

const saved: NotificationTemplateSet = {
  id: 'template-id',
  name: 'Operational notifications',
  enabled: true,
  templates: {
    requested: { subject: 'Request {{request_title}}', body: 'Review {{target}}' },
    reminder: { subject: 'Reminder', body: 'Still pending' },
    approved: { subject: 'Approved', body: 'Approved' },
    denied: { subject: 'Denied', body: 'Denied' },
    expired: { subject: 'Expired', body: 'Expired' },
    cancelled: { subject: 'Cancelled', body: 'Cancelled' },
    execution_succeeded: { subject: 'Success', body: 'Done' },
    execution_failed: { subject: 'Failed', body: 'Failed' },
    execution_unknown: { subject: 'Unknown', body: 'Check status' },
  },
  created_at: 100,
  updated_at: 101,
};

function actions(savedExists: boolean, dirty: boolean, busy = false) {
  return renderToStaticMarkup(createElement(NotificationPreviewActions, {
    saved: savedExists, dirty, busy,
    onPreview: () => undefined, onTestSend: () => undefined,
  }));
}

describe('Grant notification preview/test-send integrity', () => {
  it('compares persisted editor content without relying on record metadata or template key order', () => {
    const signature = templateDraftSignature(saved);
    expect(hasUnsavedTemplateChanges(signature, saved)).toBe(false);
    expect(templateDraftSignature({
      ...saved,
      templates: Object.fromEntries(Object.entries(saved.templates).reverse()) as typeof saved.templates,
      updated_at: 999,
    })).toBe(signature);
    expect(hasUnsavedTemplateChanges(signature, {
      ...saved, name: 'Another name',
    })).toBe(true);
    expect(hasUnsavedTemplateChanges(signature, { ...saved, enabled: false })).toBe(true);
    expect(hasUnsavedTemplateChanges(signature, {
      ...saved,
      templates: { ...saved.templates, requested: {
        ...saved.templates.requested, body: 'Unsaved new target' },
      },
    })).toBe(true);
    expect(hasUnsavedTemplateChanges(signature, {
      ...saved,
      templates: { ...saved.templates, denied: {
        ...saved.templates.denied, subject: 'Do not send old subject' },
      },
    })).toBe(true);
  });

  it('keeps both server actions disabled until the changed draft is saved', () => {
    const dirty = actions(true, true);
    expect(dirty).toContain('Unsaved changes');
    expect(dirty).toContain('Save this template set');
    expect((dirty.match(/disabled=""/g) ?? []).length).toBe(2);
    expect(dirty).toContain('Preview rendered message');
    expect(dirty).toContain('Send test to me');
    const savedActions = actions(true, false);
    expect(savedActions).not.toContain('Unsaved changes');
    expect(savedActions).not.toContain('disabled=""');
    expect((actions(false, false).match(/disabled=""/g) ?? []).length).toBe(2);
    expect((actions(true, false, true).match(/disabled=""/g) ?? []).length).toBe(2);
  });

  it('links to the real request-detail route without showing a raw UUID', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const html = renderToStaticMarkup(createElement(NotificationRequestLink, {
      requestId: id,
    }));
    expect(html).toContain('href="/requests/' + id + '"');
    expect(html).toContain('Open request');
    expect(html).not.toContain('>' + id + '</a>');
    const malformed = renderToStaticMarkup(createElement(NotificationRequestLink, {
      requestId: 'r/unsafe?value',
    }));
    expect(malformed).toContain('href="/requests/r%2Funsafe%3Fvalue"');
    expect(malformed).not.toContain('r/unsafe?value');
  });
});
