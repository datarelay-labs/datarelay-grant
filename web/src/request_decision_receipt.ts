import type { RequestRow } from './types';

/** One POST is the authoritative human decision. A subsequent read is only
 * presentation refresh; a failed/lagging GET must not turn a committed decision
 * into an apparent failed submit or invite an unsafe duplicate action.
 */
export async function recordDecisionThenRead(
  submitOnce: () => Promise<RequestRow>,
  readOnlyRefresh: () => Promise<RequestRow>,
): Promise<{ row: RequestRow; refreshed: boolean }> {
  // Deliberately never retry or intercept an ambiguous POST failure.
  const receipt = await submitOnce();
  try {
    const current = await readOnlyRefresh();
    if (current.id === receipt.id && current.revision >= receipt.revision) {
      return { row: current, refreshed: true };
    }
  } catch {
    // The server's successful POST response remains usable. A follow-up GET
    // cannot change the authorization or external execution outcome.
  }
  return { row: receipt, refreshed: false };
}
