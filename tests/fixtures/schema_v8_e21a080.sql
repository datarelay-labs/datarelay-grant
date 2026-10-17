
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')),
 enabled INTEGER NOT NULL DEFAULT 1, totp_secret TEXT, totp_last_step INTEGER NOT NULL DEFAULT -1,
 recovery_hashes TEXT NOT NULL DEFAULT '[]', created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id),
 created_at REAL NOT NULL, expires_at REAL NOT NULL, last_seen REAL NOT NULL,
 mfa_pending INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS integrations (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1, tenant TEXT NOT NULL DEFAULT '',
 destination TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 integration_id TEXT NOT NULL REFERENCES integrations(id), scopes TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS email_templates (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
 subject_template TEXT NOT NULL, body_template TEXT NOT NULL,
 reminder_subject_template TEXT NOT NULL, reminder_body_template TEXT NOT NULL,
 event_templates TEXT NOT NULL, sender_display_name TEXT NOT NULL DEFAULT 'DataRelay Grant',
 enabled INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, integration_id TEXT NOT NULL REFERENCES integrations(id),
 approver_id TEXT NOT NULL REFERENCES users(id), approval_mode TEXT NOT NULL DEFAULT 'SINGLE', approver_group_id TEXT, approvals_required INTEGER, action_kind TEXT NOT NULL,
 email_template_id TEXT REFERENCES email_templates(id),
 deadline_seconds INTEGER NOT NULL, reminder_seconds INTEGER NOT NULL,
 max_reminders INTEGER NOT NULL, grant_seconds INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS profile_versions (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
 version INTEGER NOT NULL, name TEXT NOT NULL,
 integration_id TEXT NOT NULL REFERENCES integrations(id),
 approver_id TEXT NOT NULL REFERENCES users(id), approval_mode TEXT NOT NULL DEFAULT 'SINGLE', approver_group_id TEXT, approvals_required INTEGER, action_kind TEXT NOT NULL,
 email_template_id TEXT REFERENCES email_templates(id),
 deadline_seconds INTEGER NOT NULL, reminder_seconds INTEGER NOT NULL,
 max_reminders INTEGER NOT NULL, grant_seconds INTEGER NOT NULL,
 tenant_selector TEXT NOT NULL DEFAULT '', environment TEXT NOT NULL DEFAULT '',
 severity TEXT NOT NULL DEFAULT '', risk_level TEXT NOT NULL DEFAULT '',
 lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','TESTING','ACTIVE','DISABLED')),
 created_at REAL NOT NULL, updated_at REAL NOT NULL,
 activated_at REAL, disabled_at REAL,
 UNIQUE(profile_id,version)
);
CREATE INDEX IF NOT EXISTS profile_versions_active
 ON profile_versions(lifecycle,integration_id,action_kind);
CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY, integration_id TEXT NOT NULL REFERENCES integrations(id),
 external_id TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id),
 profile_version_id TEXT REFERENCES profile_versions(id),
 requester_id TEXT REFERENCES users(id), approver_id TEXT NOT NULL REFERENCES users(id), approval_plan TEXT NOT NULL DEFAULT '{}',
 title TEXT NOT NULL, action TEXT NOT NULL, action_hash TEXT NOT NULL, intake_hash TEXT NOT NULL,
 source TEXT NOT NULL, reason TEXT NOT NULL, predecessor_id TEXT REFERENCES requests(id),
 mail_template TEXT NOT NULL, state TEXT NOT NULL,
 collaboration_state TEXT NOT NULL DEFAULT 'OPEN' CHECK(collaboration_state IN ('OPEN','INFO_REQUESTED','CHANGES_REQUESTED')),
 decision TEXT, decision_actor TEXT, decision_at REAL,
 revision INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL, deadline REAL NOT NULL,
 grant_until REAL, grant_seconds INTEGER NOT NULL,
 next_reminder REAL NOT NULL, reminder_seconds INTEGER NOT NULL,
 reminder_count INTEGER NOT NULL DEFAULT 0, max_reminders INTEGER NOT NULL,
 execution_id TEXT, execution_state TEXT NOT NULL DEFAULT 'NOT_STARTED',
 execution_result TEXT, committed_at REAL,
 UNIQUE(integration_id, external_id)
);
CREATE TABLE IF NOT EXISTS audit (
 id TEXT PRIMARY KEY, request_id TEXT, at REAL NOT NULL, actor TEXT NOT NULL,
 action TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_request ON audit(request_id, at);
CREATE TABLE IF NOT EXISTS outbox (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), kind TEXT NOT NULL,
 event_type TEXT NOT NULL DEFAULT 'legacy',
 revision INTEGER NOT NULL, payload TEXT NOT NULL, destination TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
 available_at REAL NOT NULL, lease_token TEXT, lease_until REAL, last_error TEXT,
 delivered_at REAL, created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_ready ON outbox(state, available_at);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, until REAL NOT NULL);
CREATE TABLE IF NOT EXISTS runtime (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO runtime(key,value) VALUES('paused','0');
INSERT OR IGNORE INTO runtime(key,value) VALUES('notification_brand_name','DataRelay Grant');
INSERT OR IGNORE INTO runtime(key,value) VALUES('notification_sender_display_name','DataRelay Grant');
CREATE TABLE IF NOT EXISTS approver_groups (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1,
 created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS approver_group_members (
 group_id TEXT NOT NULL REFERENCES approver_groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), position INTEGER NOT NULL,
 PRIMARY KEY(group_id,user_id), UNIQUE(group_id,position)
);
CREATE TABLE IF NOT EXISTS request_decisions (
 request_id TEXT NOT NULL REFERENCES requests(id), actor_id TEXT NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL CHECK(decision IN ('APPROVED','HELD','DENIED')),
 reason TEXT NOT NULL DEFAULT '', decided_at REAL NOT NULL,
 PRIMARY KEY(request_id,actor_id)
);
CREATE TABLE IF NOT EXISTS request_comments (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id),
 author_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('COMMENT','QUESTION','REQUEST_INFO','REQUEST_CHANGES','INFO_RESPONSE')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS request_comments_by_request
 ON request_comments(request_id,created_at,id);
CREATE TABLE IF NOT EXISTS delegations (
 id TEXT PRIMARY KEY, delegator_id TEXT NOT NULL REFERENCES users(id),
 substitute_id TEXT NOT NULL REFERENCES users(id), starts_at REAL NOT NULL, ends_at REAL NOT NULL,
 created_at REAL NOT NULL, revoked_at REAL
);
CREATE INDEX IF NOT EXISTS delegations_active ON delegations(delegator_id,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS escalations (
 request_id TEXT PRIMARY KEY REFERENCES requests(id),
 target_user_id TEXT REFERENCES users(id),
 target_group_id TEXT REFERENCES approver_groups(id),
 target_members TEXT NOT NULL DEFAULT '[]',
 due_at REAL NOT NULL, fired_at REAL,
 CHECK ((target_user_id IS NOT NULL) != (target_group_id IS NOT NULL))
);
PRAGMA user_version=8;
