/** Exact-current-key read boundary for request creation/replacement.
 * Loading policy A must never populate a different replacement request B.
 * Neither a stale source request nor a GET result authorizes a creation POST.
 */
export type IntakeProjection<P, R> = {
  key: string;
  profiles: P[];
  predecessor: R | null;
};
type IntakeToken = Readonly<{ key: string; generation: number }>;
const keyFor = (predecessorId: string | undefined) => predecessorId ?? '';

export function createRequestIntakeReadGate() {
  let activeKey: string | null = null;
  let generation = 0;
  return {
    selectContext(predecessorId: string | undefined): void {
      const next = keyFor(predecessorId);
      if (activeKey !== next) {
        activeKey = next;
        generation++;
      }
    },
    isActive(predecessorId: string | undefined): boolean {
      return activeKey === keyFor(predecessorId);
    },
    beginRead(predecessorId: string | undefined): IntakeToken | null {
      const key = keyFor(predecessorId);
      if (activeKey !== key) return null;
      return { key, generation: ++generation };
    },
    isCurrent(token: IntakeToken): boolean {
      return activeKey === token.key && generation === token.generation;
    },
  };
}

/** Prevent even the first rerender after route change from displaying
 * a prior request title/action or its loaded approval policies.
 */
export function currentIntakeProjection<P, R>(
  saved: IntakeProjection<P, R> | null, predecessorId: string | undefined,
): IntakeProjection<P, R> | null {
  return saved?.key === keyFor(predecessorId) ? saved : null;
}

/** Only commit the complete policy+predecessor pair if both GETs belong to
 * the active route and latest generation. An invalid replacement never
 * becomes an editable or confirmable request.
 */
export async function readScopedRequestIntake<
  P, R extends { id: string }
>(
  gate: ReturnType<typeof createRequestIntakeReadGate>,
  predecessorId: string | undefined,
  readPolicies: () => Promise<P[]>,
  readPredecessor: () => Promise<R>,
  eligiblePredecessor: (predecessor: R) => boolean,
  present: (value: IntakeProjection<P, R>) => void,
): Promise<boolean> {
  const token = gate.beginRead(predecessorId);
  if (!token) return false;
  try {
    const profiles = await readPolicies();
    if (!gate.isCurrent(token)) return false;
    let predecessor: R | null = null;
    if (predecessorId) {
      predecessor = await readPredecessor();
      if (!gate.isCurrent(token)) return false;
      if (predecessor?.id !== predecessorId) {
        throw new Error('REQUEST_PREDECESSOR_ID_MISMATCH');
      }
      if (!eligiblePredecessor(predecessor)) {
        throw new Error('REQUEST_REPLACEMENT_NOT_ELIGIBLE');
      }
    }
    if (!gate.isCurrent(token)) return false;
    present({ key: token.key, profiles, predecessor });
    return true;
  } catch (error) {
    if (!gate.isCurrent(token)) return false;
    throw error;
  }
}
