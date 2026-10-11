/**
 * RequestDetail's Confirm button is rendered from React state, which is not a
 * synchronous mutex. A second click in the same render must not send another
 * human decision (or cancellation) to the server.
 *
 * A possibly committed POST remains latched until a qualified fresh read.
 * The guard has no network or authorization authority; the backend still
 * validates actor, approval seat, request revision and immutable action.
 */
export function createDecisionAttemptGuard() {
  let inFlight = false;
  let requiresFreshRead = false;
  return {
    claim(): boolean {
      if (inFlight || requiresFreshRead) return false;
      inFlight = true;
      requiresFreshRead = true;
      return true;
    },
    complete(hadQualifiedReadback: boolean): void {
      inFlight = false;
      if (hadQualifiedReadback) requiresFreshRead = false;
    },
    /** Must be called only after a successful role-scoped GET of this request. */
    readSucceeded(): boolean {
      if (inFlight) return false;
      requiresFreshRead = false;
      return true;
    },
    blocked(): boolean {
      return inFlight || requiresFreshRead;
    },
  };
}
