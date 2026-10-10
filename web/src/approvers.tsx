import { useEffect, useState } from 'react';
import { Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, useTask } from './common';
import type { ApproverGroup } from './types';

// Every edit sends the server revision the operator actually reviewed.
export function prepareApproverGroupUpdate(
  baseline: ApproverGroup | null,
  name: string,
  members: readonly string[],
): { name: string; member_ids: string[]; expected_updated_at: number } {
  if (!baseline || !Number.isFinite(baseline.updated_at) || baseline.updated_at <= 0) {
    throw new Error('APPROVER_GROUP_VERSION_UNAVAILABLE');
  }
  return { name, member_ids: [...members], expected_updated_at: baseline.updated_at };
}

export function Approvers() {
  const [groups, setGroups] = useState<ApproverGroup[]>([]);
  const [users, setUsers] = useState<AccountProjection[]>([]);
  const [editing, setEditing] = useState('');
  const [editingBaseline, setEditingBaseline] = useState<ApproverGroup | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const task = useTask();

  async function load() {
    const [groupRows, accounts] = await Promise.all([
      api<ApproverGroup[]>('/approver-groups'),
      api<AccountProjection[]>('/admin/users'),
    ]);
    setGroups(groupRows);
    setUsers(accounts.filter((user) => user.status === 'enabled'));
  }

  useEffect(() => { void task.run(load); }, []);

  function edit(group: ApproverGroup) {
    setEditing(group.id);
    setEditingBaseline({ ...group, member_ids: [...group.member_ids] });
    setName(group.name);
    setMembers([...group.member_ids]);
  }

  function reset() {
    setEditing('');
    setEditingBaseline(null);
    setName('');
    setMembers([]);
  }

  async function save() {
    const payload = editing
      ? prepareApproverGroupUpdate(editingBaseline, name, members)
      : { name, member_ids: [...members] };
    await api(editing ? '/approver-groups/' + editing : '/approver-groups',
      editing ? 'PUT' : 'POST', payload);
    reset();
    await load();
    task.setNotice('Approver group saved. Existing requests retain their approval-plan snapshot.');
  }

  async function reloadSavedGroup() {
    if (!editing) return;
    const fresh = await api<ApproverGroup[]>('/approver-groups');
    const current = fresh.find((group) => group.id === editing);
    if (!current) throw new Error('APPROVER_GROUP_NOT_FOUND');
    setGroups(fresh);
    edit(current);
    task.setNotice('Latest saved group loaded. Unsaved edits were discarded.');
  }

  return <div className="grant-stack">
    {task.feedback}
    <Card title="Approver groups" description="Manage reusable groups for any-one, all, quorum and sequential approval policies.">
      <div className="grant-table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Members</th><th>Action</th></tr></thead>
          <tbody>{groups.map((group) => <tr key={group.id}>
            <td>{group.name}</td><td>{group.member_ids.length}</td>
            <td><Button variant="ghost" onClick={() => edit(group)}>Edit</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>
    <Card title={editing ? 'Edit approver group' : 'New approver group'}>
      <Form busy={task.busy} onSubmit={() => void task.run(save)} label={editing ? 'Save group' : 'Create group'}>
        <TextField label="Group name" required value={name} onChange={(event) => setName(event.target.value)} />
        <fieldset>
          <legend>Members</legend>
          {users.map((user) => <label key={user.id}>
            <input type="checkbox" checked={members.includes(user.id)} onChange={(event) => {
              setMembers(event.target.checked ? [...members, user.id] : members.filter((id) => id !== user.id));
            }} />
            {user.displayName} · {user.detail}
          </label>)}
        </fieldset>
        {editing ? <>
          <p>Group membership is security-sensitive. If another administrator changes
            this group, your save is rejected until you review the latest saved version.</p>
          <Button type="button" variant="secondary" disabled={task.busy}
            onClick={() => void task.run(reloadSavedGroup)}>Reload saved group</Button>
          <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>
        </> : null}
      </Form>
    </Card>
  </div>;
}
