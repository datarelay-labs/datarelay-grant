import { describe, expect, it } from 'vitest';
import { auditFilterQuery, type AuditFilterValues } from '../../src/audit_filters';

const empty: AuditFilterValues = {
  search: '', action: '', actor: '', request_id: '', since: '', until: '',
};

describe('B5 audit query fail-closed date and exact filter scope', () => {
  it('encodes a bounded exact filter and retains the supplied date bounds', () => {
    const filters = {
      ...empty,
      search: 'approval status',
      action: 'request.approved',
      actor: 'user@corp.example',
      request_id: 'uuid/with?query',
      since: '2026-10-01', until: '2026-10-11',
    };
    const q = auditFilterQuery(filters, 50, 50);
    expect(q).toContain('offset=50&limit=50');
    expect(q).toContain('search=approval%20status');
    expect(q).toContain('action=request.approved');
    expect(q).toContain('request_id=uuid%2Fwith%3Fquery');
    expect(q).toContain('actor=user%40corp.example');
    expect(q).toContain('since=' + Math.floor(new Date('2026-10-01T00:00:00').getTime() / 1000));
    expect(q).toContain('until=' + Math.floor(new Date('2026-10-11T23:59:59').getTime() / 1000));
  });

  it('rejects a syntactically malformed day instead of silently widening the audit search', () => {
    for (const bad of ['2026-1-1', 'never', '2026-10-12Z', '2026-10-12T00:00', '2026-10-12/']) {
      expect(() => auditFilterQuery({ ...empty, since: bad }, 0, 50))
        .toThrow('AUDIT_DATE_INVALID');
    }
  });

  it('rejects impossible calendar dates and accepts valid leap-day', () => {
    for (const bad of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-00-11', '2026-13-01']) {
      expect(() => auditFilterQuery({ ...empty, since: bad }, 0, 50))
        .toThrow('AUDIT_DATE_INVALID');
    }
    expect(auditFilterQuery({ ...empty, since: '2024-02-29' }, 0, 50))
      .toContain('since=');
  });

  it('refuses reversed date bounds instead of silently querying unfiltered events', () => {
    expect(() => auditFilterQuery({
      ...empty, since: '2026-10-11', until: '2026-10-01',
    }, 0, 50)).toThrow('AUDIT_DATE_RANGE_INVALID');
  });

  it('does not accept negative, fractional or excessive paging values', () => {
    for (const [offset, limit] of [[-1, 50], [0, 0], [0, 1001], [1.5, 50], [0, 1.5]]) {
      expect(() => auditFilterQuery(empty, offset, limit))
        .toThrow('AUDIT_PAGE_BUDGET_INVALID');
    }
  });

  it('never injects empty filters or treats the substring of a field as another query parameter', () => {
    expect(auditFilterQuery(empty, 0, 50)).toBe('offset=0&limit=50');
    const q = auditFilterQuery({ ...empty, search: 'a&since=1' }, 0, 50);
    expect(q).toContain('search=a%26since%3D1');
    expect(q).not.toContain('&since=1');
  });
});
