import { useState } from 'react';
import { Alert, Button, Card } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask, when } from './common';
import type { RequestRow, User } from './types';

type CommentKind = NonNullable<RequestRow['comments']>[number]['kind'];
export type CollaborationReview = {
  requestId: string;
  revision: number;
  actorId: string;
  kind: CommentKind;
  body: string;
};

/** The server remains authoritative: these are only the locally visible
 * options, never a grant of access or authorization to send a decision.
 */
export function allowedCollaborationPurposes(
  row: RequestRow, user: User, nowSeconds: number,
): CommentKind[] {
  const purposes: CommentKind[] = ['COMMENT', 'QUESTION'];
  const isPending = ['AWAITING', 'HELD'].includes(row.state)
    && row.deadline > nowSeconds && !row.execution_id;
  const reviewerSeatMatches = row.approver_id === user.id
    || row.approval_plan?.members.includes(user.id) === true
    || Boolean(row.viewer_delegated_for);
  const mayAsk = isPending && row.viewer_can_decide === true
    && reviewerSeatMatches && row.requester_id !== user.id
    && row.collaboration_state !== 'CHANGES_REQUESTED';
  if (mayAsk && row.requester_id) purposes.push('REQUEST_INFO');
  if (mayAsk) purposes.push('REQUEST_CHANGES');
  if (isPending && row.requester_id === user.id
      && row.collaboration_state === 'INFO_REQUESTED') {
    purposes.push('INFO_RESPONSE');
  }
  return purposes;
}

/** Reviewing is pure and read-only: no API request until a separate Confirm. */
export function prepareCollaborationReview(
  row: RequestRow, user: User, kind: CommentKind, body: string, nowSeconds: number,
): CollaborationReview | null {
  if (!allowedCollaborationPurposes(row, user, nowSeconds).includes(kind)
      || !body.trim() || body.length > 2000) return null;
  return { requestId: row.id, revision: row.revision, actorId: user.id, kind, body };
}

export function isCurrentCollaborationReview(
  reviewed: CollaborationReview | null,
  row: RequestRow, user: User, kind: CommentKind, body: string, nowSeconds: number,
): boolean {
  if (!reviewed) return false;
  const current = prepareCollaborationReview(row, user, kind, body, nowSeconds);
  return current !== null
    && reviewed.requestId === current.requestId
    && reviewed.revision === current.revision
    && reviewed.actorId === current.actorId
    && reviewed.kind === current.kind
    && reviewed.body === current.body;
}

export function RequestCollaboration({
  row, user, onReload,
}: { row: RequestRow; user: User; onReload: () => Promise<void> }) {
  const task = useTask();
  const [kind, setKind] = useState<CommentKind>('COMMENT');
  const [body, setBody] = useState('');
  const [reviewed, setReviewed] = useState<CollaborationReview | null>(null);
  const [reviewError, setReviewError] = useState('');
  const allowed = allowedCollaborationPurposes(row, user, Date.now() / 1000);
  // A refreshed request can invalidate a formerly selected approver purpose.
  // Never keep an invisible select value or an old reviewed intent actionable.
  const selectedKind = allowed.includes(kind) ? kind : 'COMMENT';
  const reviewReady = isCurrentCollaborationReview(
    reviewed, row, user, selectedKind, body, Date.now() / 1000,
  );
  const mayAsk = allowed.includes('REQUEST_CHANGES');
  const mayRequestInfo = allowed.includes('REQUEST_INFO');
  const mayRespond = allowed.includes('INFO_RESPONSE');

  function reviewMessage() {
    const next = prepareCollaborationReview(
      row, user, selectedKind, body, Date.now() / 1000,
    );
    setReviewed(next);
    task.setNotice('');
    setReviewError(next ? '' : 'Choose a currently allowed purpose and enter up to 2000 characters.');
  }

  async function submit() {
    // Verify again immediately before the only POST, including current role,
    // revision, request identity and contents. Backend revision/RBAC remains final.
    if (!reviewed || !isCurrentCollaborationReview(
      reviewed, row, user, selectedKind, body, Date.now() / 1000,
    )) {
      setReviewed(null);
      setReviewError('The request, reviewer or message changed. Review the current message before confirming.');
      return;
    }
    await api('/requests/' + encodeURIComponent(reviewed.requestId) + '/comments', 'POST', {
      kind: reviewed.kind, body: reviewed.body, expected_revision: reviewed.revision,
    });
    setBody('');
    setKind('COMMENT');
    setReviewed(null);
    setReviewError('');
    await onReload();
    task.setNotice('Message recorded in the request history. No approval or execution occurred.');
  }

  const caption: Record<CommentKind, string> = {
    COMMENT: 'Comment',
    QUESTION: 'Question',
    REQUEST_INFO: 'Request more information',
    REQUEST_CHANGES: 'Request action changes',
    INFO_RESPONSE: 'Provide requested information',
  };

  return <Card title="Request collaboration" description="An immutable discussion around the exact requested action. Questions and comments are not approvals.">
    {task.feedback}
    {row.collaboration_state === 'INFO_REQUESTED' && <Alert tone="warning" title="Waiting for requester information">
      Approval is paused until the original requester provides a response.</Alert>}
    {row.collaboration_state === 'CHANGES_REQUESTED' && <Alert tone="warning" title="Action changes requested">
      Approval is blocked. The requester must cancel this request and submit a linked replacement for a fresh decision.</Alert>}
    <div className="grant-stack">
      {(row.comments ?? []).map((message) => <div key={message.id} className="grant-timeline">
        <strong>{caption[message.kind]}</strong>
        <small>{when(message.created_at)} · User {message.author_id === user.id ? 'you' : message.author_id}</small>
        <p>{message.body}</p>
      </div>)}
      {!row.comments?.length && <p>No comments yet. Participants can ask questions or supply safe context.</p>}
    </div>
    <Form label="Review message" busy={task.busy} onSubmit={reviewMessage}>
      <Select label="Message purpose" value={selectedKind} onChange={(value) => {
        setKind(value as CommentKind); setReviewed(null); setReviewError(''); task.setNotice('');
      }}>
        <option value="COMMENT">Comment (does not pause approval)</option>
        <option value="QUESTION">Question (does not pause approval)</option>
        {mayRequestInfo && <option value="REQUEST_INFO">Request information (pauses approval)</option>}
        {mayAsk && <option value="REQUEST_CHANGES">Request changes (requires a new request)</option>}
        {mayRespond && <option value="INFO_RESPONSE">Respond to information request (resumes approval)</option>}
      </Select>
      <TextArea label="Message (up to 2000 characters; no credentials)" value={body}
        onChange={(value) => { setBody(value); setReviewed(null); setReviewError(''); task.setNotice(''); }} required />
      {body.length > 2000 && <p role="alert">Message exceeds 2000 characters. Shorten it before review.</p>}
    </Form>
    {reviewError && <Alert tone="warning" title="Review required">{reviewError}</Alert>}
    {reviewReady && reviewed && <Alert tone="warning" title="Confirm message">
      <p>{caption[reviewed.kind]}: {reviewed.body}</p>
      <p>Request revision {reviewed.revision}. Request action and execution authority remain unchanged. This message will be retained in the audit trail.</p>
      <Button disabled={task.busy} onClick={() => void task.run(submit)}>Confirm message</Button>
      <Button variant="ghost" disabled={task.busy} onClick={() => setReviewed(null)}>Edit before confirming</Button>
    </Alert>}
  </Card>;
}
