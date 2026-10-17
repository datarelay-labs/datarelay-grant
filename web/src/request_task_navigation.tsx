import { Button } from '@datarelay-labs/foundation';
import type { RequestRow, User } from './types';

type CurrentWork = Pick<RequestRow,
  'requester_id' | 'viewer_assigned' | 'viewer_delegated_for'>;

/** Role- and request-context navigation only: this never widens the
 * server-scoped work queue or creates a permission to decide.
 */
export function requestDetailReturnTarget(
  row: CurrentWork | null,
  user: Pick<User, 'id' | 'role'>,
): { path: string; label: string } {
  if (row?.requester_id === user.id) {
    return { path: '/my-requests', label: 'Back to my requests' };
  }
  if (row?.viewer_assigned === true) {
    return { path: '/approvals', label: 'Back to my approvals' };
  }
  return { path: '/requests', label: 'Back to requests' };
}

export function RequestTaskBackLink({
  row, user, navigate,
}: {
  row: CurrentWork | null;
  user: Pick<User, 'id' | 'role'>;
  navigate: (path: string) => void;
}) {
  const target = requestDetailReturnTarget(row, user);
  return (
    <Button variant="secondary" onClick={() => navigate(target.path)}>
      {target.label}
    </Button>
  );
}
