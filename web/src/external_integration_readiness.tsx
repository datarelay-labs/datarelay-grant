import { Alert, Card } from '@datarelay-labs/foundation';

export type ExternalReadiness = {
  schema_version: 1;
  scope: 'pre_live_configuration_only';
  active_policy: boolean;
  separate_producer: boolean;
  separate_executor: boolean | null;
  mixed_credentials: number;
  tenant_bound: boolean | null;
  native_execution_guard: 'not_verified' | 'not_applicable';
  receiver_readback: 'not_verified' | 'not_applicable';
  independent_effect_readback: 'not_verified';
  live_effect_authorized: false;
};

export function ExternalIntegrationReadiness({ status, kind }: {
  status?: ExternalReadiness;
  kind: string;
}) {
  if (!status || status.schema_version !== 1 ||
      status.scope !== 'pre_live_configuration_only' ||
      status.live_effect_authorized !== false) {
    return <Alert tone="warning" title="Readiness unavailable">
      No authenticated saved-configuration projection was supplied for this integration.
      No product execution or receiver verification can be inferred.
    </Alert>;
  }
  const yesNo = (value: boolean) => value ? 'Configured' : 'Not configured';
  const scoped = (value: boolean) => value ? 'Configured separately' : 'Not configured separately';
  const evidence = (value: string) => value === 'not_applicable' ? 'Not applicable' : 'Not verified';
  return <Card title="External integration readiness"
    description="Current Grant configuration only; this is not a Control executor or Stellar receiver proof.">
    <dl className="grant-facts">
      <dt>Active approval policy</dt><dd>{yesNo(status.active_policy)}</dd>
      <dt>Producer credential</dt><dd>{scoped(status.separate_producer)}</dd>
      {status.separate_executor !== null ? <>
        <dt>Executor credential</dt><dd>{scoped(status.separate_executor)}</dd>
      </> : null}
      <dt>Mixed-scope credentials</dt><dd>{status.mixed_credentials}</dd>
      {kind === 'stellar' ? <>
        <dt>Tenant configuration</dt>
        <dd>{status.tenant_bound ? 'Tenant constraint present' : 'Tenant constraint absent'}</dd>
      </> : null}
      <dt>Native execution guard</dt><dd>{evidence(status.native_execution_guard)}</dd>
      <dt>Receiver readback</dt><dd>{evidence(status.receiver_readback)}</dd>
      <dt>Independent effect readback</dt><dd>{evidence(status.independent_effect_readback)}</dd>
    </dl>
    <p>No external execution is authorized by this view. The installed target must
       independently prove its real enforcement, destination effects and receiver records.</p>
  </Card>;
}
