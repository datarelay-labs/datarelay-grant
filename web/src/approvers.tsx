import { useEffect, useState } from 'react';
import { Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, useTask } from './common';
import type { ApproverGroup } from './types';

export function Approvers() {
  const [groups, setGroups] = useState<ApproverGroup[]>([]);
  const [users, setUsers] = useState<AccountProjection[]>([]);
  const [editing, setEditing] = useState('');
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
    setName(group.name);
    setMembers(group.member_ids);
  }

  function reset() {
    setEditing('');
    setName('');
    setMembers([]);
  }

  async function save() {
    await api(editing ? '/approver-groups/' + editing : '/approver-groups', editing ? 'PUT' : 'POST', {
      name,
      member_ids: members,
    });
    reset();
    await load();
    task.setNotice('Approver group saved. Existing requests retain their approval-plan snapshot.');
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
        {editing ? <Button type="button" variant="ghost" onClick={reset}>Cancel</Button> : null}
      </Form>
    </Card>
  </div>;
}
