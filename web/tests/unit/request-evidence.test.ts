import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RequestEvidence } from '../../src/request_evidence';
import type { RequestRow } from '../../src/types';

function request(extra: Partial<RequestRow> = {}): RequestRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    external_id: 'DEMO', integration_id: 'demo', profile_id: 'demo',
    requester_id: 'u1', approver_id: 'u2', title: 'Demo',
    reason: '', action: { kind: 'test', target: 'isolated', parameters: {} },
    action_hash: 'hash', source: {}, state: 'HELD',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 1, created_at: 100, deadline: 10000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'FAILED',
    deliveries: [
      { id: 'failed1', kind: 'email', state: 'FAILED', attempts: 2,
        last_error: 'SMTP unavailable', revision: 1 },
      { id: 'pending2', kind: 'webhook', state: 'PENDING', attempts: 0,
        last_error: null, revision: 1 },
      { id: 'done3', kind: 'email', state: 'DELIVERED', attempts: 1,
        last_error: null, revision: 1 },
    ],
    timeline: [
      { id: 'audit1', at: 102, actor: 'user', action: 'request.created',
        detail: { result: 'waiting' } },
    ],
    ...extra,
  };
}

function markup(row: RequestRow, isAdmin: boolean, busy = false): string {
  return renderToStaticMarkup(createElement(RequestEvidence, {
    row, isAdmin, busy, onResend: () => undefined,
  }));
}

describe('Grant progressive evidence and resend boundary', () => {
  it('provides collapsed delivery attempts and recorded events with nested audit JSON', () => {
    const html = markup(request(), false);
    expect(html).toContain('Delivery attempts · 3');
    expect(html).toContain('Recorded events · 1');
    expect(html).toContain('Event evidence');
    expect(html).toContain('SMTP unavailable');
    expect(html).toContain('request.created');
    expect(html).toContain('waiting');
    expect(html).not.toContain('<details open=""');
    expect(html).toContain('Transport acceptance does not prove external execution.');
  });

  it('keeps retry controls hidden from member users regardless of delivery state', () => {
    const html = markup(request(), false);
    expect(html).not.toContain('Resend email');
    expect(html).not.toContain('Resend webhook');
  });

  it('only exposes admin resend for FAILED or PENDING, never successful deliveries', () => {
    const html = markup(request(), true);
    expect(html).toContain('Resend email');
    expect(html).toContain('Resend webhook');
    expect(html.match(/Resend email/g)).toHaveLength(1);
    expect(html.match(/Resend webhook/g)).toHaveLength(1);
  });

  it('uses the exact existing busy guard on resend controls', () => {
    const html = markup(request(), true, true);
    expect(html).toContain('Resend email');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Resend webhook');
  });

  it('can show an empty history without fabricating evidence or exposing actions', () => {
    const html = markup(request({ deliveries: [], timeline: [] }), true);
    expect(html).toContain('Delivery attempts · 0');
    expect(html).toContain('Recorded events · 0');
    expect(html).not.toContain('request.created');
    expect(html).not.toContain('Resend email</button>');
    expect(html).not.toContain('Resend webhook</button>');
  });
});
