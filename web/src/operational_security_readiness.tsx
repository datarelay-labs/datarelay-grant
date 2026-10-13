import {
  Alert, AuditForwardingPanel, Card, DataRetentionPolicyReviewPanel,
  RecoveryReadinessPanel, SecretLifecyclePanel,
} from '@datarelay-labs/foundation';

export type OperationalSecurityReadiness = {
  schema_version: 1;
  scope: 'stored_grant_facts_only';
  allows_execution: false;
  audit_forwarding: { state: 'disabled' };
  backup_recovery: {
    registered_evidence: 'unavailable';
    restore_drill: 'not_verified';
    recovery_paused: boolean | null;
    restore_authorized: false;
  };
  retention: { policy: 'not_configured'; approval_record_deletion_enabled: false };
  secret_lifecycle: {
    rotation_policy: 'not_configured';
    active_integration_tokens: number;
    revoked_integration_tokens: number;
    material_exposed: false;
    rotation_authorized: false;
  };
  management_ingress: {
    web_allowlist: 'not_configured';
    host_ssh_enforcement: 'not_verified';
    access_rule_change_authorized: false;
  };
};

function exactRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validOperationalSecurityReadiness(value: unknown): value is OperationalSecurityReadiness {
  if (!exactRecord(value) || value.schema_version !== 1 ||
      value.scope !== 'stored_grant_facts_only' || value.allows_execution !== false) return false;
  const audit = value.audit_forwarding;
  const backup = value.backup_recovery;
  const retention = value.retention;
  const secret = value.secret_lifecycle;
  const ingress = value.management_ingress;
  return exactRecord(audit) && audit.state === 'disabled' &&
    exactRecord(backup) && backup.registered_evidence === 'unavailable' &&
    backup.restore_drill === 'not_verified' &&
    (backup.recovery_paused === null || typeof backup.recovery_paused === 'boolean') &&
    backup.restore_authorized === false &&
    exactRecord(retention) && retention.policy === 'not_configured' &&
    retention.approval_record_deletion_enabled === false && exactRecord(secret) &&
    secret.rotation_policy === 'not_configured' &&
    typeof secret.active_integration_tokens === 'number' &&
    Number.isSafeInteger(secret.active_integration_tokens) &&
    secret.active_integration_tokens >= 0 &&
    typeof secret.revoked_integration_tokens === 'number' &&
    Number.isSafeInteger(secret.revoked_integration_tokens) &&
    secret.revoked_integration_tokens >= 0 && secret.material_exposed === false &&
    secret.rotation_authorized === false && exactRecord(ingress) &&
    ingress.web_allowlist === 'not_configured' &&
    ingress.host_ssh_enforcement === 'not_verified' &&
    ingress.access_rule_change_authorized === false;
}

/** Render real Grant-record facts, never infer installed PF Python enforcement. */
export function OperationalSecurityReadinessReadout({ status }: {
  status: OperationalSecurityReadiness | null;
}) {
  if (!validOperationalSecurityReadiness(status)) {
    return <Alert tone="warning" title="Security readiness unavailable">
      The current administrator-only operational evidence could not be verified.
      No secure configuration, backup proof, forwarding, rotation or recovery readiness is assumed.
    </Alert>;
  }
  return <div className="grant-stack" aria-label="Operational security readiness">
    <Card title="Grant operating safeguards"
      description="Read-only, currently persisted Grant facts. Missing shared security policy is not a healthy default.">
      <Alert tone="warning" title="Product security policies not installed">
        Grant does not currently manage host SSH/firewall allowlists, data deletion,
        credential rotation, encrypted backup evidence or independently verified restore drills.
        These operations require separate installation policies and authority.
      </Alert>
      <dl className="grant-facts">
        <dt>Recovery pause</dt><dd>{status.backup_recovery.recovery_paused === null
          ? 'Unavailable' : status.backup_recovery.recovery_paused ? 'Active' : 'Not active'}</dd>
        <dt>Grant integration token records</dt>
        <dd>{status.secret_lifecycle.active_integration_tokens} enabled / {' '}
          {status.secret_lifecycle.revoked_integration_tokens} revoked</dd>
        <dt>Credential rotation policy</dt><dd>Not configured</dd>
        <dt>Host SSH allowlist</dt><dd>Not verified</dd>
        <dt>Web management CIDR allowlist</dt><dd>Not configured</dd>
        <dt>Approval and audit record retention</dt><dd>Not configured</dd>
      </dl>
      <p>Enabled tokens do not imply healthy key rotation. HTTP transport acceptance,
        a private CLI backup and this status view cannot authorize a recovery or business effect.</p>
    </Card>
    <AuditForwardingPanel projection={status.audit_forwarding} testAvailability="unavailable" />
    <RecoveryReadinessPanel backups={[]} />
    <SecretLifecyclePanel secrets={[]} reviewAvailability="unavailable" />
    <DataRetentionPolicyReviewPanel reviewAvailability="unavailable" />
  </div>;
}
