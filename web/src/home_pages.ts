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
