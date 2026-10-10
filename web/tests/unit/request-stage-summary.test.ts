import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RequestStageSummary } from '../../src/request_stage_summary';
import type { RequestRow } from '../../src/types';

function request(override: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'DEMO-1', integration_id: 'example', profile_id: 'policy',
    requester_id: 'requester', approver_id: 'reviewer', title: 'Review an operation',
    reason: 'Maintenance',
    action: { kind: 'service.deploy', target: 'test-only-service', parameters: {} },
    action_hash: 'immutable-hash', source: {}, state: 'AWAITING',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 4, created_at: 100, deadline: 1000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'PENDING', ...override,
  };
}

function html(row: RequestRow): string {
  return renderToStaticMarkup(createElement(RequestStageSummary, { row }));
}

describe('Grant request-detail task-first status presentation', () => {
  it('shows the exact immutable business action before all three status stages', () => {
    const output = html(request());
    expect(output).toContain('Action requiring approval');
    expect(output).toContain('service.deploy');
    expect(output).toContain('test-only-service');
    const start = output.indexOf('Action requiring approval');
    for (const label of ['Human decision', 'Notification transport', 'Reported external execution']) {
      expect(output.indexOf(label)).toBeGreaterThan(start);
    }
    expect(output.indexOf('Human decision')).toBeLessThan(
      output.indexOf('Notification transport'),
    );
    expect(output.indexOf('Notification transport')).toBeLessThan(
      output.indexOf('Reported external execution'),
    );
  });

  it('never treats a human approval or delivered notification as a verified external effect', () => {
    const output = html(request({
      state: 'APPROVED', delivery_state: 'DELIVERED', execution_state: 'NOT_STARTED',
    }));
    expect(output).toContain('APPROVED');
    expect(output).toContain('DELIVERED');
    expect(output).toContain('NOT STARTED');
    expect(output).toContain('does not execute');
    expect(output).toContain('not proof of mailbox receipt');
    expect(output).toContain('No external effect is confirmed');
    expect(output).not.toContain('Execution verified');
    expect(output).not.toContain('Approve</button>');
    expect(output).not.toContain('Execute</button>');
  });

  it('qualifies only reported success or failure as unverified product reports', () => {
    const success = html(request({
      state: 'APPROVED', execution_state: 'REPORTED_SUCCEEDED',
      execution_result: { status: 'success', evidence: 'example' },
    }));
    const failure = html(request({
      state: 'APPROVED', execution_state: 'REPORTED_FAILED',
    }));
    expect(success).toContain('REPORTED SUCCEEDED');
    expect(success).toContain('reported success');
    expect(success).toContain('not independently verified');
    expect(failure).toContain('REPORTED FAILED');
    expect(failure).toContain('reported failure');
    expect(failure).toContain('not independently verified');
  });

  it('does not imply success, retry or false completion for ambiguous outcome', () => {
    const output = html(request({ execution_state: 'UNKNOWN' }));
    expect(output).toContain('UNKNOWN');
    expect(output).toContain('outcome is unknown');
    expect(output).toContain('do not assume success or repeat execution');
    expect(output).not.toContain('Execute</button>');
    expect(output).not.toContain('Retry</button>');
  });

  it('surfaces paused and replacement-required collaboration as non-decision status', () => {
    const waiting = html(request({ collaboration_state: 'INFO_REQUESTED' }));
    const changed = html(request({ collaboration_state: 'CHANGES_REQUESTED' }));
    expect(waiting).toContain('Waiting for requester information');
    expect(waiting).toContain('Approval is paused');
    expect(changed).toContain('Request changes required');
    expect(changed).toContain('fresh approval');
    expect(html(request())).not.toContain('Approval is paused');
  });

  it('escapes untrusted operation/target and exposes no mutation controls', () => {
    const output = html(request({
      action: { kind: '<script>alert(1)</script>', target: '<img src=x onerror=alert(2)>', parameters: {} },
    }));
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain('&lt;img');
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<img src=x');
    expect(output).not.toContain('<button');
  });
});
