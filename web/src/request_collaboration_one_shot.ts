/**
 * A reviewed collaboration message is a human POST, not a React render action.
 * React's busy state is asynchronous: two Confirm clicks in one render must
 * not send two comments, questions or requested-change commands.
 *
 * A successful POST carries the server's current projected request; callers
 * must validate and accept that projection before unlocking. A rejected
 * projection or ambiguous POST requires a new role-scoped read. This guard
 * has no permission, vote or external execution authority.
 */
export function createCollaborationSubmissionGuard() {
  let inFlight = false;
  let requiresFreshRead = false;
  return {
    async submitOnce<T>(
      sendOnce: () => Promise<T>,
      acceptProjection: (current: T) => void,
    ): Promise<boolean> {
      if (inFlight || requiresFreshRead) return false;
      // Set synchronously before awaiting the first network operation.
      inFlight = true;
      requiresFreshRead = true;
      try {
        const current = await sendOnce();
        acceptProjection(current);
        requiresFreshRead = false;
        return true;
      } finally {
        // A failed/ambiguous POST or failed projection stays latched.
        inFlight = false;
      }
    },
    /** Only call after a successful role-scoped read of this same request. */
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
