import { useState } from 'react';
import { Alert, Button, Card } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask, when } from './common';
import type { RequestRow, User } from './types';

type CommentKind = NonNullable<RequestRow['comments']>[number]['kind'];

export function RequestCollaboration({
  row, user, onReload,
}: { row: RequestRow; user: User; onReload: () => Promise<void> }) {
  const task = useTask();
  const [kind, setKind] = useState<CommentKind>('COMMENT');
  const [body, setBody] = useState('');
  const isPending = ['AWAITING', 'HELD'].includes(row.state) && row.deadline > Date.now() / 1000;
  const mayAsk = isPending && row.viewer_can_decide && row.collaboration_state !== 'CHANGES_REQUESTED';
  const mayRespond = isPending && row.requester_id === user.id && row.collaboration_state === 'INFO_REQUESTED';

  async function submit() {
    await api('/requests/' + encodeURIComponent(row.id) + '/comments', 'POST', {
      kind, body, expected_revision: row.revision,
    });
    setBody('');
    setKind('COMMENT');
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
    <Form label="Review message" busy={task.busy} onSubmit={() => {
      if (body.trim()) task.setNotice('Review your message and confirm below.');
    }}>
      <Select label="Message purpose" value={kind} onChange={(value) => {
        setKind(value as CommentKind); task.setNotice('');
      }}>
        <option value="COMMENT">Comment (does not pause approval)</option>
        <option value="QUESTION">Question (does not pause approval)</option>
        {mayAsk && row.requester_id && <option value="REQUEST_INFO">Request information (pauses approval)</option>}
        {mayAsk && <option value="REQUEST_CHANGES">Request changes (requires a new request)</option>}
        {mayRespond && <option value="INFO_RESPONSE">Respond to information request (resumes approval)</option>}
      </Select>
      <TextArea label="Message (up to 2000 characters; no credentials)" value={body} onChange={setBody} required />
    </Form>
    {body.trim() && <Alert tone="warning" title="Confirm message">
      <p>{caption[kind]}: {body}</p>
      <p>Request action and execution authority remain unchanged. This message will be retained in the audit trail.</p>
      <Button disabled={task.busy || body.length > 2000} onClick={() => void task.run(submit)}>Confirm message</Button>
    </Alert>}
  </Card>;
}
