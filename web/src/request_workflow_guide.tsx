import type {RequestRow} from './types';
import './workflow-guidance.css';

/** These are form milestones, not permissions or automatic submissions. */
export function RequestIntakeSteps({
  policySelected,detailsEntered,
}: {
  policySelected: boolean; detailsEntered: boolean;
}) {
  const steps = [
    {number:'01',title:'Choose policy',description:'Select what needs approval.',complete:policySelected,now:!policySelected},
    {number:'02',title:'Describe action',description:'Enter title and target.',complete:policySelected && detailsEntered,now:policySelected && !detailsEntered},
    {number:'03',title:'Review before creating',description:'Check everything, then confirm.',complete:false,now:policySelected && detailsEntered},
  ];
  return <nav className="grant-intake-journey" aria-label="Request creation progress">
    <ol>
      {steps.map((step)=>
        <li key={step.number} aria-current={step.now ? 'step' : undefined}
          className={step.complete ? 'is-complete' : step.now ? 'is-current' : ''}>
          <span className="grant-intake-step-number" aria-hidden="true">{step.complete ? '✓' : step.number}</span>
          <span><strong>{step.title}</strong><small>{step.description}</small></span>
        </li>
      )}
    </ol>
  </nav>;
}

function safeLabel(value: string): string {
  return /^[A-Z][A-Z_]{1,64}$/.test(value) ? value.replaceAll('_',' ') : 'UNAVAILABLE';
}

/** Read-only, independent states: no success cascade from approval to effect. */
export function RequestWorkflowGuide({row}: {row: RequestRow}) {
  const stages = [
    {number:'01',title:'Human decision',state:safeLabel(row.state),
      meaning:'Recorded approval state. A decision alone cannot execute an action.',
      tone:row.state==='APPROVED' ? 'good' : ['DENIED','EXPIRED','CANCELLED'].includes(row.state) ? 'blocked' : 'pending'},
    {number:'02',title:'Notification transport',state:safeLabel(row.delivery_state),
      meaning:'Webhook transport status; not proof of mailbox receipt.',
      tone:row.delivery_state==='DELIVERED' ? 'good' : row.delivery_state==='FAILED' ? 'blocked' : 'pending'},
    {number:'03',title:'External result',state:safeLabel(row.execution_state),
      meaning:'Executor-reported status only; not proof of execution by Grant.',
      tone:row.execution_state==='REPORTED_SUCCEEDED' ? 'reported' :
        ['UNKNOWN','REPORTED_FAILED'].includes(row.execution_state) ? 'blocked' : 'pending'},
  ];
  return <section className="grant-request-journey" aria-label="Current request workflow">
    <ol>
      {stages.map(stage=><li key={stage.number} className={'grant-request-stage is-'+stage.tone}>
        <span className="grant-request-stage-top">
          <span className="grant-request-stage-num" aria-hidden="true">{stage.number}</span>
          <strong>{stage.title}</strong>
        </span>
        <span className="grant-request-stage-state">{stage.state}</span>
        <small>{stage.meaning}</small>
      </li>)}
    </ol>
  </section>;
}
