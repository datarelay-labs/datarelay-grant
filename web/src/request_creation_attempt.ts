/**
 * NewRequest creation is a reviewed, one-shot human command.
 * React state updates and disabled buttons cannot prevent two same-render
 * Confirm handlers from racing through the fresh-policy GET to two POSTs.
 *
 * An error before the POST is provably safe to re-review; any attempted POST
 * has an ambiguous outcome until the operator reconciles it separately.
 * This guard does not approve or execute anything.
 */
export function createRequestCreationAttemptGuard() {
  let claimed = false;
  let postStarted = false;
  return {
    claim(): boolean {
      if (claimed) return false;
      claimed = true;
      postStarted = false;
      return true;
    },
    markPostStarted(): boolean {
      if (!claimed) return false;
      postStarted = true;
      return true;
    },
    failed(): boolean {
      if (postStarted) return false;
      claimed = false;
      return true;
    },
    blocked(): boolean {
      return claimed;
    },
  };
}
