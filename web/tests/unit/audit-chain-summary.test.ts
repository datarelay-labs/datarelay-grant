import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuditEvidenceChain, AuditEventTable, type AuditChainReport } from '../../src/audit_chain_summary';

function chain(extra: Partial<AuditChainReport> = {}): AuditChainReport {
  return {
    request: {
      id: 'case-42', profile_id: 'profile-a', profile_version_id: 'version-7',
      action_hash: 'immutable-action-hash', state: 'APPROVED',
      decision: 'APPROVED', execution_state: 'REPORTED_SUCCEEDED',
      execution_id: 'execution-reference',
    },
    total_events: 1201,
    events_truncated: true,
    events: [{
      id: 'audit-record-1', at: 1000, action: 'request.approved',
      actor: 'reviewer', request_id: 'case-42',
      details: { recorded: true, source: 'approval' },
    }],
    decisions: [{ actor_id: 'seat-a', decision: 'APPROVED', decided_at: 900 }],
    comments: [{ id: 'comment-1', author_id: 'requester', kind: 'COMMENT', created_at: 890 }],
    comments_total: 2400, comments_truncated: true,
    deliveries: [{ id: 'email-1', kind: 'email', event_type: 'approved',
      state: 'DELIVERED', attempts: 1 }],
    current_is_execution_verified: false, ...extra,
  };
}
function html(item = chain()) {
  return renderToStaticMarkup(createElement(AuditEvidenceChain, { chain: item }));
}

describe('B5 task-first request-to-result audit evidence', () => {
  it('shows exact request/policy/action identity and recorded vs projected counts', () => {
    const output = html();
    for (const value of [
      'case-42', 'profile-a', 'version-7', 'immutable-action-hash',
      '1201', '2400', 'Recorded events', 'Only the first',
      'Request-to-result evidence chain', 'Reported execution',
    ]) expect(output).toContain(value);
  });

  it('collapses technical metadata per event instead of overwhelming the activity view', () => {
    const output = html();
    expect(output).toContain('<details');
    expect(output).toContain('<summary');
    expect(output).toContain('request.approved');
    expect(output).toContain('View recorded metadata');
    expect(output).not.toMatch(/<details[^>]* open/);
  });

  it('never misreports accepted transport or executor report as verified business effects', () => {
    const output = html();
    expect(output).toContain('not independently verified');
    expect(output).toContain('Transport records');
    expect(output).not.toContain('Execution verified');
    expect(output).not.toContain('Execute</button>');
    expect(output).not.toContain('Approve</button>');
  });

  it('escapes untrusted source values in event action and metadata', () => {
    const row = chain({ events: [{
      id: 'one', at: 1, request_id: 'case-42',
      action: '<img src=x onerror=alert(1)>',
      actor: '<script>alert(1)</script>',
      details: { notice: '<svg onload=alert(1)>' },
    }] });
    const output = html(row);
    expect(output).toContain('&lt;img');
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain('&lt;svg');
    expect(output).not.toContain('<img src=x');
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<svg onload');
  });

  it('keeps audit event safe metadata collapsed in the result worklist', () => {
    const item = chain().events[0]!;
    const output = renderToStaticMarkup(createElement(AuditEventTable, {
      items: [item], busy: false, onInspect: () => undefined,
    }));
    expect(output).toContain('request.approved');
    expect(output).toContain('Inspect request evidence');
    expect(output).toContain('View safe metadata');
    expect(output).toMatch(/<details[^>]*><summary>View safe metadata<\/summary>/);
    expect(output).not.toMatch(/<details[^>]* open/);
  });

  it('escapes record metadata and does not expose a mutation action in the audit table', () => {
    const item = {
      ...chain().events[0]!,
      action: '<script>alert(1)</script>',
      details: { value: '<img src=x onerror=alert(1)>' },
    };
    const output = renderToStaticMarkup(createElement(AuditEventTable, {
      items: [item], busy: false, onInspect: () => undefined,
    }));
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain('&lt;img');
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<img src=x');
    expect(output).not.toContain('Execute</button>');
  });

  it('uses a nonactionable system-event label and disables inspector while busy', () => {
    const item = chain().events[0]!;
    const system = renderToStaticMarkup(createElement(AuditEventTable, {
      items: [{ ...item, request_id: null }],
      busy: false, onInspect: () => undefined,
    }));
    const busy = renderToStaticMarkup(createElement(AuditEventTable, {
      items: [item], busy: true, onInspect: () => undefined,
    }));
    expect(system).toContain('System event');
    expect(system).not.toContain('Inspect request evidence</button>');
    expect(busy).toContain('disabled=""');
  });

  it('does not invent missing activity or truncation from an empty report', () => {
    const output = html(chain({
      total_events: 0, events: [], events_truncated: false,
      comments_total: 0, comments: [], comments_truncated: false,
      decisions: [], deliveries: [],
    }));
    expect(output).toContain('No recorded events in this projected chain');
    expect(output).not.toContain('Evidence page bounded');
    expect(output).not.toContain('Comment history bounded');
  });
});
