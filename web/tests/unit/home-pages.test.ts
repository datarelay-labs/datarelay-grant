import { describe, expect, it, vi } from 'vitest';
import { collectVisibleRequestPages } from '../../src/home_pages';

describe('Home action-center page coverage', () => {
  it('includes actionable requests beyond the first server page', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => index);
    const page2 = [100, 101, 102, 103];
    const read = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    const result = await collectVisibleRequestPages(read);
    expect(read.mock.calls).toEqual([[100, 0], [100, 100]]);
    expect(result).toEqual({ rows: [...page1, ...page2], complete: true });
  });

  it('checks if an exactly full page has a successor before declaring complete', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => index))
      .mockResolvedValueOnce([]);
    const result = await collectVisibleRequestPages(read);
    expect(result.rows).toHaveLength(100);
    expect(result.complete).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('bounds reads and marks totals as lower bounds once page budget is reached', async () => {
    const read = vi.fn(async (limit: number, offset: number) =>
      Array.from({ length: limit }, (_, index) => offset + index));
    const result = await collectVisibleRequestPages(read, { pageSize: 100, maxPages: 3 });
    expect(result.rows).toHaveLength(300);
    expect(result.complete).toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid oversized backend pages instead of exaggerating Home totals', async () => {
    const read = vi.fn(async () => Array.from({ length: 101 }, (_, index) => index));
    await expect(collectVisibleRequestPages(read)).rejects.toThrow('REQUEST_PAGE_SIZE_INVALID');
  });
});
