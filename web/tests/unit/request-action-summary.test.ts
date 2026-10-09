import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RequestActionSummary } from '../../src/request_action_summary';
import type { RequestRow } from '../../src/types';

function sample(changes: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'SAFE-DEMO-1',
    integration_id: 'integration', profile_id: 'policy',
    requester_id: 'requester', approver_id: 'approver',
    title: 'Review the deployment', reason: 'Planned maintenance',
    action: {
      kind: 'service.deploy', target: 'test-only-service',
      parameters: { version: '1.2.3', restart: true, service: { tier: 'internal' } },
    },
    action_hash: 'example-immutable-sha256-hash',
    source: { case_id: 'DEMO-CASE', tenant: 'sandbox' },
    state: 'AWAITING', collaboration_state: 'OPEN',
    decision: null, decision_actor: null, decision_at: null,
    revision: 1, created_at: 100, deadline: 10_000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'PENDING', ...changes,
  };
}

function markup(row: RequestRow, canReplace = false): string {
  return renderToStaticMarkup(createElement(RequestActionSummary, {
    row, canReplace, navigate: () => undefined,
  }));
}

describe('Grant request detail explicit action-first evidence', () => {
  it('keeps immutable operation, target and all business parameters directly visible', () => {
    const output = markup(sample());
    expect(output).toContain('Exact action requiring approval');
    expect(output).toContain('service.deploy');
    expect(output).toContain('test-only-service');
    expect(output).toContain('1.2.3');
    expect(output).toContain('restart');
    expect(output).toContain('true');
    expect(output).toContain('internal');
    expect(output).toContain('Approval never executes this action directly.');
    expect(output.indexOf('Operation')).toBeLessThan(output.indexOf('<details'));
  });

  it('only folds technical fingerprint, raw parameter JSON and original source', () => {
    const output = markup(sample());
    expect(output).toContain('<details');
    expect(output).toContain('Technical action fingerprint');
    expect(output).toContain('example-immutable-sha256-hash');
    expect(output).toContain('Original source reference');
    expect(output).toContain('DEMO-CASE');
    expect(output).toContain('<pre>');
    expect(output).not.toContain('<details open=""');
  });

  it('uses readable prior-request action without displaying raw predecessor UUID as link label', () => {
    const id = 'bbbb0000-0000-4000-8000-000000000002';
    const output = markup(sample({ predecessor_id: id }), true);
    expect(output).toContain('Linked replacement request');
    expect(output).toContain('View prior request');
    expect(output).not.toContain('>' + id + '</button>');
    expect(output).toContain('Create replacement request');
    expect(markup(sample())).not.toContain('View prior request');
    expect(markup(sample())).not.toContain('Create replacement request');
  });

  it('does not invent approval controls or execute backend actions', () => {
    const output = markup(sample());
    expect(output).not.toContain('Confirm approved');
    expect(output).not.toContain('Approve</button>');
    expect(output).not.toContain('Deny</button>');
    expect(output).not.toContain('Resend');
    expect(output).not.toContain('Execute');
  });

  it('escapes untrusted action values instead of rendering HTML', () => {
    const output = markup(sample({
      action: {
        kind: 'service.test',
        target: '<script>alert("test")</script>',
        parameters: { reason: '<img src=x onerror=alert(1)>' },
      },
    }));
    expect(output).toContain('&lt;script&gt;');
    expect(output).not.toContain('<script>');
    expect(output).toContain('&lt;img');
    expect(output).not.toContain('<img src=x');
  });

  it('clearly represents an empty parameter set, with no false approval side effect', () => {
    const output = markup(sample({
      action: { kind: 'service.noop', target: 'test-only', parameters: {} },
    }));
    expect(output).toContain('Parameters');
    expect(output).toContain('None');
    expect(output).toContain('Action content cannot be edited.');
  });
});
