/** Bounded, role-scoped Home snapshot from the existing GET /requests pagination contract.
 * A full final page is only known complete after a shorter page. When the cap is
 * reached, Home displays lower-bound counts rather than a misleading exact total.
 * The authoritative server filters and per-request security checks remain intact.
 */
export async function collectVisibleRequestPages<Row>(
  readPage: (limit: number, offset: number) => Promise<Row[]>,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<{ rows: Row[]; complete: boolean }> {
  const { pageSize = 100, maxPages = 10 } = options;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    throw new Error('HOME_PAGE_BUDGET_INVALID');
  }

  const rows: Row[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const next = await readPage(pageSize, page * pageSize);
    if (!Array.isArray(next) || next.length > pageSize) {
      throw new Error('REQUEST_PAGE_SIZE_INVALID');
    }
    rows.push(...next);
    if (next.length < pageSize) return { rows, complete: true };
  }
  return { rows, complete: false };
}

import type { RequestRow } from './types';

export type HomeWorkspace = {
  decisions: RequestRow[];
  overdue: RequestRow[];
  submitted: RequestRow[];
  needsResponse: RequestRow[];
  recent: RequestRow[];
  deliveryFailures: RequestRow[];
  approvedUnused: RequestRow[];
  executionUnknown: RequestRow[];
  executionFailed: RequestRow[];
  executionExceptions: RequestRow[];
};

/** Derive Home from already role-scoped /requests responses. Nothing here
 * expands server authority, authorizes a vote or claims actual execution.
 */
export function projectHomeWorkspace(
  rows: readonly RequestRow[],
  viewerId: string,
  isAdmin: boolean,
  nowSeconds: number,
): HomeWorkspace {
  const latest = (a: RequestRow, b: RequestRow) =>
    b.created_at - a.created_at || a.id.localeCompare(b.id);
  const byDeadline = (a: RequestRow, b: RequestRow) =>
    a.deadline - b.deadline || latest(a, b);
  const own = rows.filter((row) => row.requester_id === viewerId).sort(latest);
  const assigned = rows.filter((row) => row.viewer_assigned === true);

  const decisions = assigned.filter((row) =>
    row.viewer_can_decide === true &&
    (row.state === 'AWAITING' || row.state === 'HELD') &&
    row.collaboration_state === 'OPEN' &&
    row.deadline > nowSeconds,
  ).sort(byDeadline);

  const overdue = assigned.filter((row) =>
    row.overdue === true ||
    (row.state === 'EXPIRED' && row.deadline <= nowSeconds),
  ).sort(byDeadline);

  const needsResponse = own.filter((row) =>
    (row.collaboration_state === 'INFO_REQUESTED' &&
      (row.state === 'AWAITING' || row.state === 'HELD')) ||
    (row.collaboration_state === 'CHANGES_REQUESTED' &&
      (row.state === 'AWAITING' || row.state === 'HELD' || row.state === 'EXPIRED')),
  ).sort(byDeadline);

  // Operator-only secondary content. Client-side visibility is not a
  // security boundary: /admin/operations also enforces backend RBAC.
  const deliveryFailures = isAdmin ? rows.filter((row) =>
    row.delivery_state === 'FAILED' ||
    (row.notification_failure_count ?? 0) > 0,
  ) : [];

  const approvedUnused = isAdmin ? rows.filter((row) =>
    row.state === 'APPROVED' && row.execution_state === 'NOT_STARTED',
  ) : [];
  const executionUnknown = isAdmin ? rows.filter((row) =>
    row.execution_state.includes('UNKNOWN'),
  ) : [];
  const executionFailed = isAdmin ? rows.filter((row) =>
    row.execution_state.includes('FAILED'),
  ) : [];
  const executionExceptions = isAdmin ? rows.filter((row) =>
    (row.state === 'APPROVED' && row.execution_state === 'NOT_STARTED') ||
    row.execution_state.includes('UNKNOWN') ||
    row.execution_state.includes('FAILED'),
  ) : [];

  return {
    decisions,
    overdue,
    submitted: own,
    needsResponse,
    recent: own.slice(0, 5),
    deliveryFailures,
    approvedUnused,
    executionUnknown,
    executionFailed,
    executionExceptions,
  };
}

/** Human-readable progress, explicitly separating decision from execution. */
export function requesterProgress(row: RequestRow): string {
  if (row.state === 'AWAITING' || row.state === 'HELD') {
    if (row.collaboration_state === 'INFO_REQUESTED') return 'Information requested';
    if (row.collaboration_state === 'CHANGES_REQUESTED') return 'Changes requested';
  }
  if (row.state === 'EXPIRED' && row.collaboration_state === 'CHANGES_REQUESTED') {
    return 'Changes requested · submit a revised request';
  }
  if (row.state === 'APPROVED') {
    if (row.execution_state === 'NOT_STARTED') return 'Approved · awaiting execution';
    if (row.execution_state.includes('FAILED')) return 'Approved · execution failed';
    if (row.execution_state.includes('UNKNOWN')) return 'Approved · execution status unknown';
    if (row.execution_state.includes('SUCCEEDED')) return 'Approved · execution completed';
    return 'Approved · execution pending verification';
  }
  if (row.state === 'HELD') return 'On hold';
  if (row.state === 'AWAITING') return 'Waiting on approvers';
  if (row.state === 'DENIED') return 'Denied';
  if (row.state === 'EXPIRED') return 'Expired';
  if (row.state === 'CANCELLED') return 'Cancelled';
  return row.state;
}
