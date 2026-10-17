import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RequestExecutionReport } from '../../src/request_execution_report';
import type { RequestRow } from '../../src/types';

function request(changes: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'DEMO', integration_id: 'example', profile_id: 'policy',
    requester_id: 'requester', approver_id: 'reviewer', title: 'Review deployment',
    reason: '', action: { kind: 'service.deploy', target: 'isolated', parameters: {} },
    action_hash: 'hash', source: {}, state: 'APPROVED',
    collaboration_state: 'OPEN', decision: 'APPROVED',
    decision_actor: 'reviewer', decision_at: 100, revision: 2,
    created_at: 95, deadline: 2000, grant_until: 5000, predecessor_id: null,
    execution_id: 'execution', execution_state: 'REPORTED_SUCCEEDED',
    execution_result: { status: 'success', evidence: 'external-test-evidence' },
    delivery_state: 'DELIVERED', ...changes,
  };
}

function markup(row: RequestRow): string {
  return renderToStaticMarkup(createElement(RequestExecutionReport, { row }));
}

describe('Grant reported execution result is evidence, not Grant-verified action', () => {
  it('renders no unearned effect claim for a request without any report', () => {
    const html = markup(request({ execution_result: null, execution_state: 'UNKNOWN' }));
    expect(html).toBe('');
  });

  it('shows reported state and connected-system status before collapsed raw evidence', () => {
    const html = markup(request());
    expect(html).toContain('Reported execution result');
    expect(html).toContain('REPORTED SUCCEEDED');
    expect(html).toContain('Reported by the connected system');
    expect(html).toContain('not independently verified by Grant');
    expect(html).toContain('Connected-system status');
    expect(html).toContain('success');
    expect(html).toContain('Raw external report evidence');
    expect(html).toContain('external-test-evidence');
    expect(html.indexOf('Connected-system status')).toBeLessThan(
      html.indexOf('<details'),
    );
    expect(html.indexOf('external-test-evidence')).toBeGreaterThan(
      html.indexOf('<details'),
    );
    expect(html).not.toContain('<details open=""');
  });

  it('does not imply external reconciliation or grant a retry on an UNKNOWN report', () => {
    const html = markup(request({
      execution_state: 'UNKNOWN',
      execution_result: { status: 'indeterminate', evidence: 'No native readback' },
    }));
    expect(html).toContain('UNKNOWN');
    expect(html).toContain('indeterminate');
    expect(html).toContain('not independently verified');
    expect(html).not.toContain('Executed successfully');
    expect(html).not.toContain('<button');
  });

  it('shows failure as a reported status and never equates transport with execution', () => {
    const html = markup(request({
      delivery_state: 'DELIVERED',
      execution_state: 'REPORTED_FAILED',
      execution_result: { status: 'failed', evidence: 'upstream rejected' },
    }));
    expect(html).toContain('REPORTED FAILED');
    expect(html).toContain('failed');
    expect(html).toContain('not independently verified by Grant');
    expect(html).not.toContain('Retry');
    expect(html).not.toContain('Execute</button>');
  });

  it('keeps untrusted long evidence in a closed disclosure and React-escaped', () => {
    const html = markup(request({
      execution_result: {
        status: '<script>alert(1)</script>',
        evidence: '<img src=x onerror=alert(1)>' + 'a'.repeat(1000),
      },
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<details open=""');
    expect(html.indexOf('&lt;img')).toBeGreaterThan(html.indexOf('<details'));
  });

  it('contains no action buttons or network side effect and preserves existing card heading', () => {
    const html = markup(request());
    expect(html).toContain('Reported execution result');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Approved and executed');
  });
});
