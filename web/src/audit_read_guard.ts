/** Only the latest role-scoped read may update Audit Explorer results.
 * A filter/page change invalidates any earlier pending HTTP result before
 * React renders the next page; no permission or audit write is performed.
 */
export function createAuditReadGate() {
  let listGeneration = 0;
  let chainGeneration = 0;
  return {
    beginList(): number { return ++listGeneration; },
    listCurrent(token: number): boolean { return token === listGeneration; },
    invalidateList(): void { listGeneration++; },
    beginChain(): number { return ++chainGeneration; },
    chainCurrent(token: number): boolean { return token === chainGeneration; },
    invalidateChain(): void { chainGeneration++; },
    invalidateAll(): void { listGeneration++; chainGeneration++; },
  };
}

/** A successful GET is still untrusted evidence for a different request.
 * The displayed identity must equal the request clicked in the audit list.
 */
export function verifyAuditChainIdentity<T extends { request: { id: string } }>(
  requestedId: string, result: T,
): T {
  if (!requestedId || !result?.request || result.request.id !== requestedId) {
    throw new Error('AUDIT_CHAIN_REQUEST_MISMATCH');
  }
  return result;
}
