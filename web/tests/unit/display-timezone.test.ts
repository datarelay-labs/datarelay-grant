import { afterEach, describe, expect, it } from 'vitest';
import {
  formatDisplayDate,
  formatDisplayEpoch,
  formatDisplayIso,
  getDisplayTimezone,
  setDisplayTimezone,
} from '../../src/display_timezone';

describe('Grant authenticated display timezone formatter', () => {
  afterEach(() => setDisplayTimezone('UTC'));

  it('formats epoch and ISO timestamps with the effective IANA timezone', () => {
    const date = new Date('2026-10-15T00:00:00Z');
    setDisplayTimezone('Asia/Seoul');
    expect(getDisplayTimezone()).toBe('Asia/Seoul');
    expect(formatDisplayDate(date)).toBe(
      date.toLocaleString(undefined, { timeZone: 'Asia/Seoul' }),
    );
    expect(formatDisplayEpoch(date.getTime() / 1000)).toBe(
      date.toLocaleString(undefined, { timeZone: 'Asia/Seoul' }),
    );
    expect(formatDisplayIso(date.toISOString())).toBe(
      date.toLocaleString(undefined, { timeZone: 'Asia/Seoul' }),
    );
  });

  it('fails closed to UTC for an invalid local timezone value', () => {
    setDisplayTimezone('Not/A_Real_Zone');
    expect(getDisplayTimezone()).toBe('UTC');
    const date = new Date('2026-10-15T00:00:00Z');
    expect(formatDisplayDate(date)).toBe(
      date.toLocaleString(undefined, { timeZone: 'UTC' }),
    );
  });
});
