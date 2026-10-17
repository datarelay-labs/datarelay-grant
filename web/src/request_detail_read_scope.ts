/** Latest-only read boundary for mounted RequestDetail. Never switch the
 * active request because an older callback asks to read its old route.
 * This boundary cannot authorize a decision, collaboration write or resend.
 */
export type RequestReadToken = Readonly<{ requestId: string; generation: number }>;

export function createRequestDetailReadGate() {
  let requestId: string | null = null;
  let generation = 0;
  return {
    selectRequest(nextId: string): void {
      if (requestId !== nextId) {
        requestId = nextId;
        generation++;
      }
    },
    beginRead(id: string): RequestReadToken | null {
      if (requestId !== id) return null;
      return { requestId: id, generation: ++generation };
    },
    isCurrent(token: RequestReadToken): boolean {
      return requestId === token.requestId && generation === token.generation;
    },
    isActive(id: string): boolean {
      return requestId === id;
    },
    invalidateCurrent(id: string): boolean {
      if (requestId !== id) return false;
      generation++;
      return true;
    },
  };
}

type Gate = ReturnType<typeof createRequestDetailReadGate>;

/** Do not expose stale server data through decision/cancellation affordances
 * during the render between a changed route prop and the next effect.
 */
export function currentRouteRequest<T extends { id: string }>(
  saved: T | null, activeRouteId: string,
): T | null {
  return saved?.id === activeRouteId ? saved : null;
}

/** A GET is accepted ONLY while its exact request ID is active and no
 * newer GET or authoritative local write has invalidated its generation.
 * Superseded errors are not presented as current-task errors.
 */
export async function readScopedRequestDetail<T extends { id: string }>(
  gate: Gate, requestedId: string,
  readOnly: () => Promise<T>,
  present: (row: T) => void,
): Promise<boolean> {
  const token = gate.beginRead(requestedId);
  if (!token) return false;
  try {
    const row = await readOnly();
    if (!gate.isCurrent(token)) return false;
    if (row?.id !== requestedId) throw new Error('REQUEST_READ_ID_MISMATCH');
    present(row);
    return true;
  } catch (error) {
    if (!gate.isCurrent(token)) return false;
    throw error;
  }
}

/** An actual role-scoped POST receipt or collaboration update invalidates
 * older pending GETs. A receipt for a different route is never projected.
 */
export function acceptCurrentRequestMutation<T extends { id: string }>(
  gate: Gate, requestedId: string, row: T, present: (row: T) => void,
): boolean {
  if (!gate.isActive(requestedId)) return false;
  if (row?.id !== requestedId) throw new Error('REQUEST_READ_ID_MISMATCH');
  gate.invalidateCurrent(requestedId);
  present(row);
  return true;
}
