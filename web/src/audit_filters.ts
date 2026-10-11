export type AuditFilterValues = {
  search: string;
  action: string;
  actor: string;
  request_id: string;
  since: string;
  until: string;
};

/** Strictly validate the date typed by the operator. A silently dropped
 * invalid bound would produce a much broader, misleading audit result.
 * Preserve the existing browser-local date interpretation for valid days.
 */
function dayBound(value: string, endOfDay: boolean): number {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) throw new Error('AUDIT_DATE_INVALID');
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const dt = new Date(year, month - 1, day, endOfDay ? 23 : 0,
    endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  if (!Number.isFinite(dt.getTime())
      || dt.getFullYear() !== year || dt.getMonth() + 1 !== month
      || dt.getDate() !== day) {
    throw new Error('AUDIT_DATE_INVALID');
  }
  return Math.floor(dt.getTime() / 1000);
}

export function encodeAuditValue(value: string | number): string {
  return encodeURIComponent(String(value)).replace(/[!'()*~]/g, (character) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

/** Read-only query for the *exact* audit evidence scope the user selected.
 * Reject impossible dates/budgets before building any GET or export URL.
 */
export function auditFilterQuery(filters: AuditFilterValues, offset: number, limit: number): string {
  if (!Number.isSafeInteger(offset) || offset < 0
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('AUDIT_PAGE_BUDGET_INVALID');
  }
  const since = filters.since ? dayBound(filters.since, false) : null;
  const until = filters.until ? dayBound(filters.until, true) : null;
  if (since !== null && until !== null && since > until) {
    throw new Error('AUDIT_DATE_RANGE_INVALID');
  }
  const params: Record<string, string | number> = { offset, limit };
  for (const key of ['search', 'action', 'actor', 'request_id'] as const) {
    if (filters[key].trim()) params[key] = filters[key];
  }
  if (since !== null) params.since = since;
  if (until !== null) params.until = until;
  return Object.entries(params).map(([key, value]) => key + '=' + encodeAuditValue(value)).join('&');
}
