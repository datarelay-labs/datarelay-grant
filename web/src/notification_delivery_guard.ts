/** Grant Delivery Health has two independent correctness boundaries:
 * stale read-only filter/page responses and possibly committed email resends.
 * Synchronous per-mount claims protect the React same-render double-click
 * window; server administrator RBAC still controls actual transport effects.
 */
export function createDeliveryHealthGuard() {
  let generation = 0;
  let inFlight = false;
  const attempted = new Set<string>();
  return {
    beginRead(): number { return ++generation; },
    readCurrent(token: number): boolean { return token === generation; },
    invalidateRead(): void { generation++; },
    claimResend(deliveryId: string): boolean {
      if (!deliveryId || inFlight || attempted.has(deliveryId)) return false;
      // Previously queued GETs must not overwrite post-attempt evidence.
      generation++;
      inFlight = true;
      attempted.add(deliveryId);
      return true;
    },
    settledResend(): void {
      inFlight = false;
    },
    blocked(deliveryId: string): boolean {
      return inFlight || attempted.has(deliveryId);
    },
    readSucceeded(): boolean {
      // Only an explicitly requested, successful current read may unlock.
      if (inFlight) return false;
      attempted.clear();
      return true;
    },
  };
}
