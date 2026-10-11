import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, useTask, when } from './common';
import type { ApproverGroup } from './types';
import {
  ApproverGroupAccountCoverage,assessSavedGroupAccountCoverage,createApproverDirectoryReadScope,
  readCurrentApproverDirectory,type GroupAccountProjection,
} from './approver_group_directory_truth';
import {
  ApproverGroupSaveConfirmation,
  createApproverGroupSaveGuard,
  isCurrentApproverGroupReview,
  moveApproverGroupMember,
  prepareApproverGroupReview,
  submitReviewedApproverGroupSave,
  verifyApproverGroupSaveReceipt,
  type ApproverGroupSaveReview,
} from './approver_group_review';

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

export type ApproverGroupView = 'all' | 'enabled' | 'disabled' | 'attention' | 'unverified';

/** A client-only facet over the exact already-authorized saved group/accounts
 * GET, not a new policy, query, or decision-eligibility source. Member
 * issues, unchecked account status and disabled saved groups remain distinct.
 */
export function filterApproverGroups(
  rows: readonly ApproverGroup[], search: string,
  view: ApproverGroupView = 'all',
  accounts: readonly GroupAccountProjection[] | null = null,
): ApproverGroup[] {
  const q = search.trim().toLocaleLowerCase();
  return rows.filter(group => {
    if (!group.name.toLocaleLowerCase().includes(q)) return false;
    if (view === 'all') return true;
    if (view === 'enabled') return group.enabled === true;
    if (view === 'disabled') return group.enabled === false;
    return assessSavedGroupAccountCoverage(group, accounts).status === view;
  }).sort((left, right) => left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id));
}

export function ApproverGroupDirectory({
  groups,accounts=null,loaded=true,error='',search,busy,view='all',
  onSearchChange,onViewChange=()=>undefined,onOpen,onCreate,
}: {
  groups: readonly ApproverGroup[];
  accounts?: readonly GroupAccountProjection[]|null;
  loaded?: boolean;
  error?: string;
  search: string;
  busy: boolean;
  view?: ApproverGroupView;
  onSearchChange: (next: string) => void;
  onViewChange?: (next: ApproverGroupView) => void;
  onOpen: (group: ApproverGroup) => void;
  onCreate: () => void;
}) {
  const matches=loaded?filterApproverGroups(groups,search,view,accounts):[];
  return (
    <Card
      title="Approver groups"
      description="Review group membership before editing. Reusable groups support any-one, all, quorum and sequential approval policies."
      actions={<Button disabled={busy} onClick={onCreate}>Create approver group</Button>}
    >
      <TextField
        label="Search approver groups" value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <Select label="Filter saved groups" value={view}
        onChange={(next)=>onViewChange(next as ApproverGroupView)}>
        <option value="all">All saved groups</option>
        <option value="enabled">Enabled saved groups</option>
        <option value="disabled">Disabled saved groups</option>
        <option value="attention">Member account review required</option>
        <option value="unverified">Account status unverified</option>
      </Select>
      {!loaded&&<p role="status">Loading current saved approver groups and
        account lookup. No missing groups or eligible reviewer claims yet.</p>}
      {error&&<Alert tone="critical" title="Unable to load saved approver groups">
        {error}
      </Alert>}
      {loaded&&<p>{matches.length} of {groups.length} groups.
        Saved membership is not proof of current decision eligibility.</p>}
      {loaded&&<div className="grant-table-scroll">
        <table className="grant-table">
          <thead>
            <tr><th>Group</th><th>Status</th><th>Members</th><th>Updated</th><th>Action</th></tr>
          </thead>
          <tbody>
            {matches.map((group) => (
              <tr key={group.id}>
                <td>{group.name}</td>
                <td>{group.enabled ? 'Enabled' : 'Disabled'}</td>
                <td>{group.member_ids.length} member{group.member_ids.length===1?'':'s'}
                  {' '}saved IDs
                  <ApproverGroupAccountCoverage group={group} accounts={accounts}/>
                </td>
                <td>{when(group.updated_at)}</td>
                <td>
                  <Button variant="secondary" disabled={busy} onClick={() => onOpen(group)}>
                    Review group
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {loaded&&!error&&!matches.length&&(
        <p>{groups.length ? 'No groups match your search.' :
          'No approver groups. Create a group to configure reusable approvers.'}</p>
      )}
    </Card>
  );
}

export function Approvers() {
  const [groups, setGroups] = useState<ApproverGroup[]>([]);
  const [users, setUsers] = useState<AccountProjection[]>([]);
  const [accountInventory,setAccountInventory]=useState<AccountProjection[]|null>(null);
  const [directoryLoaded,setDirectoryLoaded]=useState(false);
  const [directoryError,setDirectoryError]=useState('');
  const directoryRead=useRef(createApproverDirectoryReadScope());
  const [editing, setEditing] = useState('');
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [search, setSearch] = useState('');
  const [groupView, setGroupView] = useState<ApproverGroupView>('all');
  const [editingBaseline, setEditingBaseline] = useState<ApproverGroup | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState<ApproverGroupSaveReview | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [saveOutcomeNeedsReconciliation, setSaveOutcomeNeedsReconciliation] = useState(false);
  const saveGuard = useRef(createApproverGroupSaveGuard());
  const task = useTask();

  async function load():Promise<boolean> {
    setDirectoryLoaded(false);
    setDirectoryError('');
    try{
      return await readCurrentApproverDirectory(directoryRead.current,
        async()=>{
          const [groupRows,accountRows]=await Promise.all([
            api<ApproverGroup[]>('/approver-groups'),
            api<AccountProjection[]>('/admin/users'),
          ]);
          return {groups:groupRows,accounts:accountRows};
        },
        result=>{
          setGroups(result.groups);
          setAccountInventory(result.accounts);
          setUsers(result.accounts.filter(user=>user.status==='enabled'));
          setDirectoryLoaded(true);
        },
      );
    }catch(error){
      setAccountInventory(null);
      setDirectoryLoaded(false);
      setDirectoryError('The current role-scoped group or account list could not be verified.');
      throw error;
    }
  }

  useEffect(() => { void task.run(async()=>{await load();}); }, []);

  function edit(group: ApproverGroup) {
    if (saveGuard.current.blocked()) return;
    setReviewed(null);
    setReviewError('');
    setEditing(group.id);
    setEditingBaseline({ ...group, member_ids: [...group.member_ids] });
    setName(group.name);
    setMembers([...group.member_ids]);
    setView('editor');
  }

  function reset() {
    setReviewed(null);
    setReviewError('');
    setEditing('');
    setEditingBaseline(null);
    setName('');
    setMembers([]);
    setView('list');
  }

  function startCreate() {
    if (saveGuard.current.blocked()) return;
    reset();
    setView('editor');
  }

  function changeMembers(next: string[]) {
    setMembers(next);
    setReviewed(null);
    setReviewError('');
  }

  function reviewGroupChanges() {
    if (saveGuard.current.blocked()) return;
    try {
      setReviewed(prepareApproverGroupReview(editingBaseline, name, members));
      setReviewError('');
    } catch {
      setReviewed(null);
      setReviewError('Provide a group name of at most 100 characters and 1–50 unique members.');
    }
  }

  async function confirmGroupSave() {
    const intent = reviewed;
    if (!isCurrentApproverGroupReview(intent, editingBaseline, name, members)) {
      setReviewed(null);
      setReviewError('The edited group changed. Review its current members and order again.');
      return;
    }
    if (!intent || saveGuard.current.blocked()) return;
    // This exact frozen review controls one versioned POST, even if React
    // cannot mark its busy state before a second click in the same render.
    setReviewed(null);
    let postStarted = false;
    let result: ApproverGroup | null;
    try {
      result = await submitReviewedApproverGroupSave(
        intent,
        saveGuard.current,
        () => api<ApproverGroup[]>('/approver-groups'),
        (frozen) => {
          postStarted = true;
          setSaveOutcomeNeedsReconciliation(true);
          const source = frozen.groupId ? {
            id: frozen.groupId,
            name: frozen.originalName!,
            enabled: frozen.originalEnabled!,
            updated_at: frozen.expectedUpdatedAt!,
            member_ids: frozen.originalMembers,
          } : null;
          const payload = source
            ? prepareApproverGroupUpdate(source, frozen.name, frozen.memberIds)
            : { name: frozen.name, member_ids: [...frozen.memberIds] };
          return api<ApproverGroup>(
            frozen.groupId ? '/approver-groups/' + encodeURIComponent(frozen.groupId)
              : '/approver-groups',
            frozen.groupId ? 'PUT' : 'POST',
            payload,
          );
        },
      );
      if (!result) return;
      verifyApproverGroupSaveReceipt(intent, result);
    } catch (error) {
      if (!postStarted && error instanceof Error
        && error.message === 'APPROVER_GROUP_CHANGED_REVIEW_REQUIRED') {
        setReviewError('Another administrator changed this group. Reload the saved group before reviewing or saving.');
        return;
      }
      // A possibly committed POST remains latched; do not blindly retry.
      throw error;
    }
    setSaveOutcomeNeedsReconciliation(false);
    reset();
    try {
      await load();
      task.setNotice('Group save confirmed by the server. Review the refreshed groups and explicitly refresh before another change. Existing requests retain their approval plans.');
    } catch {
      task.setNotice('Group save was confirmed by the server, but the group list could not be refreshed. Reconcile the current saved group before any new change.');
    }
  }

  async function refreshGroups() {
    const current=await load();
    if(!current)throw new Error('APPROVER_DIRECTORY_NOT_CURRENT');
    if (!saveGuard.current.readSucceeded()) {
      throw new Error('APPROVER_GROUP_SAVE_STILL_IN_FLIGHT');
    }
    setSaveOutcomeNeedsReconciliation(false);
    setReviewError('');
    task.setNotice('Current saved groups reloaded. Open a group and review any new change separately.');
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
    {saveGuard.current.blocked() && (
      <Alert tone="warning" title="Reconcile saved group before another change">
        {saveOutcomeNeedsReconciliation
          ? 'A group save POST may already have succeeded. Do not automatically retry it.'
          : 'A group change was submitted. Inspect the current saved group before starting another change.'}
        {' '}Only an explicit successful Refresh re-enables another group change.
        <Button variant="secondary" disabled={task.busy}
          onClick={() => void task.run(refreshGroups)}>Refresh saved groups</Button>
      </Alert>
    )}
    {view === 'list' ? (
      <ApproverGroupDirectory
        groups={groups} accounts={accountInventory}
        loaded={directoryLoaded} error={directoryError}
        search={search} view={groupView}
        busy={task.busy||saveGuard.current.blocked()||!directoryLoaded}
        onSearchChange={setSearch} onViewChange={setGroupView}
        onOpen={edit} onCreate={startCreate}
      />
    ) : (
      <>
        <div className="grant-actions">
          <Button variant="ghost" disabled={task.busy} onClick={reset}>
            ← Back to approver groups
          </Button>
        </div>
        <Card title={editing ? 'Edit approver group' : 'Create approver group'}
          description="Review current members, then save an explicit group update. Existing requests retain their own approval snapshot.">
          {editing && (
            <p>Saved group membership: {editingBaseline?.member_ids.length ?? 0}
              {' '}member(s). This editor uses the last loaded group revision.</p>
          )}
          <Form busy={task.busy || saveGuard.current.blocked()} onSubmit={reviewGroupChanges}
            label={editing ? 'Review group changes' : 'Review group creation'}>
            <TextField label="Group name" required maxLength={100} value={name}
              onChange={(event) => { setName(event.target.value); setReviewed(null); setReviewError(''); }} />
            <fieldset>
              <legend>Selected members and approval order</legend>
              <p>The order of members affects SEQUENTIAL approval policies.
                Use the buttons to review the exact intended sequence before saving.</p>
              <ol>
                {members.map((id, index) => {
                  const account = users.find((person) => person.id === id);
                  return <li key={id}>
                    <strong>{index + 1}. {account?.displayName ?? 'Unavailable account'}</strong>
                    {' · '}{account?.detail ?? id}
                    <div className="grant-actions">
                      <Button type="button" variant="secondary" disabled={index === 0}
                        onClick={() => changeMembers(moveApproverGroupMember(members, id, -1))}>
                        Move earlier
                      </Button>
                      <Button type="button" variant="secondary" disabled={index === members.length - 1}
                        onClick={() => changeMembers(moveApproverGroupMember(members, id, 1))}>
                        Move later
                      </Button>
                      <Button type="button" variant="ghost"
                        onClick={() => changeMembers(members.filter((member) => member !== id))}>
                        Remove member
                      </Button>
                    </div>
                  </li>;
                })}
              </ol>
              {!members.length && <p>Choose at least one enabled member below.</p>}
            </fieldset>
            <fieldset>
              <legend>Add or remove enabled members</legend>
              {users.map((user) => <label className="grant-checkbox" key={user.id}>
                <input type="checkbox" checked={members.includes(user.id)}
                  onChange={(event) => {
                    changeMembers(event.target.checked
                      ? [...members, user.id]
                      : members.filter((id) => id !== user.id));
                  }} />
                {user.displayName} · {user.detail}
              </label>)}
              {!users.length && <p>No enabled members available in the current account list.</p>}
            </fieldset>
            {editing && (
              <>
                <p>Group membership is security-sensitive. If another administrator
                  changes this group, the server rejects stale saves until you
                  review the latest saved version.</p>
                <Button type="button" variant="secondary" disabled={task.busy}
                  onClick={() => void task.run(reloadSavedGroup)}>
                  Reload saved group
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" disabled={task.busy}
              onClick={reset}>Cancel</Button>
          </Form>
          {reviewError && (
            <Alert tone="warning" title="Group review required">{reviewError}</Alert>
          )}
          <ApproverGroupSaveConfirmation
            reviewed={reviewed}
            valid={isCurrentApproverGroupReview(
              reviewed, editingBaseline, name, members,
            )}
            busy={task.busy || saveGuard.current.blocked()}
            accounts={users}
            onCancel={() => setReviewed(null)}
            onConfirm={() => { void task.run(confirmGroupSave); }}
          />
        </Card>
      </>
    )}
  </div>;
}
