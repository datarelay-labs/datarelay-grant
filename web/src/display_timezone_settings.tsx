import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { useTask } from './common';
import {
  type AdminDisplayTimezoneProjection,
  type DisplayTimezoneProjection,
  setDisplayTimezone,
} from './display_timezone';

type PersonalReview = {
  timezone: string | null;
  expected_timezone: string | null;
};

type AdminReview = {
  timezone: string;
  expected_timezone: string;
};

export function PersonalDisplayTimezoneSettings() {
  const [projection, setProjection] = useState<DisplayTimezoneProjection | null>(null);
  const [draft, setDraft] = useState('');
  const [reviewed, setReviewed] = useState<PersonalReview | null>(null);
  const task = useTask();

  async function load() {
    const current = await api<DisplayTimezoneProjection>('/auth/display-timezone');
    setProjection(current);
    setDraft(current.override ?? '');
    setDisplayTimezone(current.effective);
  }

  useEffect(() => {
    void task.run(load);
  }, []);

  function review() {
    if (!projection) return;
    setReviewed({
      timezone: draft.trim() || null,
      expected_timezone: projection.override,
    });
  }

  async function confirm() {
    if (!reviewed) return;
    const saved = await api<DisplayTimezoneProjection>(
      '/auth/display-timezone',
      'PUT',
      reviewed,
    );
    setProjection(saved);
    setDraft(saved.override ?? '');
    setReviewed(null);
    setDisplayTimezone(saved.effective);
    task.setNotice('Display timezone preference saved. Stored Grant timestamps remain UTC.');
  }

  return (
    <Card
      title="Display timezone"
      description="Choose how Grant timestamps are displayed for your account. Stored timestamps remain UTC."
    >
      {task.feedback}
      {projection ? (
        <div className="grant-stack">
          <dl className="grant-facts">
            <dt>Effective timezone</dt><dd>{projection.effective}</dd>
            <dt>Personal override</dt><dd>{projection.override ?? 'Use platform default'}</dd>
            <dt>Platform default</dt><dd>{projection.default}</dd>
            <dt>Stored timestamps</dt><dd>{projection.storage_timezone}</dd>
          </dl>
          <TextField
            label="Personal IANA timezone"
            value={draft}
            maxLength={128}
            placeholder="Asia/Seoul"
            hint="Leave blank to use the platform default."
            disabled={task.busy}
            onChange={(event) => {
              setDraft(event.target.value);
              setReviewed(null);
            }}
          />
          <Button variant="secondary" disabled={task.busy} onClick={review}>
            Review timezone change
          </Button>
          {reviewed ? (
            <Alert tone="warning" title="Review display timezone change">
              Current override: {projection.override ?? 'platform default'}.
              Proposed override: {reviewed.timezone ?? 'platform default'}.
              This changes display only; stored UTC timestamps are not rewritten.
              <div className="grant-actions">
                <Button variant="secondary" disabled={task.busy} onClick={() => setReviewed(null)}>
                  Back
                </Button>
                <Button variant="primary" disabled={task.busy} onClick={() => void task.run(confirm)}>
                  Confirm timezone change
                </Button>
              </div>
            </Alert>
          ) : null}
        </div>
      ) : <p>Loading display timezone…</p>}
    </Card>
  );
}

export function AdminDisplayTimezoneSettings() {
  const [projection, setProjection] = useState<AdminDisplayTimezoneProjection | null>(null);
  const [draft, setDraft] = useState('');
  const [reviewed, setReviewed] = useState<AdminReview | null>(null);
  const task = useTask();

  async function load() {
    const current = await api<AdminDisplayTimezoneProjection>('/admin/display-timezone');
    setProjection(current);
    setDraft(current.default);
  }

  useEffect(() => {
    void task.run(load);
  }, []);

  function review() {
    if (!projection || !draft.trim()) return;
    setReviewed({
      timezone: draft.trim(),
      expected_timezone: projection.default,
    });
  }

  async function confirm() {
    if (!reviewed) return;
    const saved = await api<AdminDisplayTimezoneProjection>(
      '/admin/display-timezone',
      'PUT',
      reviewed,
    );
    const personal = await api<DisplayTimezoneProjection>('/auth/display-timezone');
    setProjection(saved);
    setDraft(saved.default);
    setReviewed(null);
    setDisplayTimezone(personal.effective);
    task.setNotice('Platform display timezone default saved. Stored Grant timestamps remain UTC.');
  }

  return (
    <Card
      title="Platform display timezone"
      description="Set the default display timezone for accounts without a personal override."
    >
      {task.feedback}
      {projection ? (
        <div className="grant-stack">
          <dl className="grant-facts">
            <dt>Current default</dt><dd>{projection.default}</dd>
            <dt>Stored timestamps</dt><dd>{projection.storage_timezone}</dd>
          </dl>
          <TextField
            label="Default IANA timezone"
            value={draft}
            required
            maxLength={128}
            placeholder="Asia/Seoul"
            hint="Use an IANA timezone such as Asia/Seoul, Europe/London or America/New_York."
            disabled={task.busy}
            onChange={(event) => {
              setDraft(event.target.value);
              setReviewed(null);
            }}
          />
          <Button variant="secondary" disabled={task.busy || !draft.trim()} onClick={review}>
            Review default timezone
          </Button>
          {reviewed ? (
            <Alert tone="warning" title="Review platform timezone change">
              Current default: {projection.default}. Proposed default: {reviewed.timezone}.
              Personal overrides remain unchanged and all stored timestamps remain UTC.
              <div className="grant-actions">
                <Button variant="secondary" disabled={task.busy} onClick={() => setReviewed(null)}>
                  Back
                </Button>
                <Button variant="primary" disabled={task.busy} onClick={() => void task.run(confirm)}>
                  Confirm default timezone
                </Button>
              </div>
            </Alert>
          ) : null}
        </div>
      ) : <p>Loading platform timezone…</p>}
    </Card>
  );
}
