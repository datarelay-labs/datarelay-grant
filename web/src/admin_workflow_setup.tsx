import { Button, Card } from '@datarelay-labs/foundation';
import './workflow-guidance.css';

type Navigate = (path: string) => void;

const ADMIN_STEPS = [
  {
    number: '01',
    title: 'Create approver accounts',
    description: 'Create the people who may request or approve work. Email addresses and roles are owned by administrators.',
    action: 'Open user management',
    destination: '/system',
    href: '/system?view=accounts',
  },
  {
    number: '02',
    title: 'Create approver groups',
    description: 'Group enabled accounts for any-one, all, quorum or sequential approval.',
    action: 'Manage approver groups',
    destination: '/approvers',
  },
  {
    number: '03',
    title: 'Register integrations',
    description: 'Define the systems and action families that can create or consume approval-controlled work.',
    action: 'Open integrations',
    destination: '/integrations',
  },
  {
    number: '04',
    title: 'Create notification templates',
    description: 'Create and save your nine-event template set, check the current preview, then Review & publish and Confirm publication. Saved drafts alone cannot pass policy testing. Requesters never choose templates.',
    action: 'Manage notification templates',
    destination: '/notifications',
  },
  {
    number: '05',
    title: 'Create approval policies',
    description: 'Bind request type, approver routing, timing, verification and notification behavior into a Draft policy.',
    action: 'Open approval policies',
    destination: '/profiles',
  },
  {
    number: '06',
    title: 'Test and activate',
    description: 'Preview matching and notifications, then explicitly activate the policy for requester use.',
    action: 'Test and activate policies',
    destination: '/profiles',
  },
  {
    number: '07',
    title: 'Create the first request',
    description: 'Use an active request type. The requester sees the assigned approval plan as read-only.',
    action: 'Open New request',
    destination: '/requests/new',
  },
] as const;

export function AdminWorkflowSetup({ navigate }: { navigate: Navigate }) {
  return <div className="grant-stack">
    <section className="grant-home-intro" aria-labelledby="grant-admin-workflow-title">
      <div>
        <p className="grant-eyebrow">Approval administration</p>
        <h2 id="grant-admin-workflow-title">Configure once, reuse on every request</h2>
        <p>Administrators own approvers, integrations, notification templates and approval
          policies. Requesters consume the active configuration without changing approval
          routing or notification authority.</p>
      </div>
      <Button onClick={() => navigate('/requests/new')}>Preview requester flow</Button>
    </section>

    <Card title="Administrator setup order"
      description="Complete the reusable configuration before asking users to submit requests.">
      <ol className="grant-admin-setup-steps" aria-label="Administrator approval setup order">
        {ADMIN_STEPS.map((step) => <li key={step.number}>
          <span className="grant-admin-setup-num" aria-hidden="true">{step.number}</span>
          <div className="grant-admin-setup-step">
            <strong>{step.title}</strong>
            <small>{step.description}</small>
            {'href' in step ? (
              <a href={step.href}>
                {step.action} <span aria-hidden="true">→</span>
              </a>
            ) : (
              <button type="button" onClick={() => navigate(step.destination)}>
                {step.action} <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </li>)}
      </ol>
    </Card>

    <Card title="What requesters see"
      description="The requester workflow intentionally hides administrator-owned choices.">
      <ol className="grant-admin-setup-steps grant-admin-setup-steps--requester" aria-label="Requester approval workflow">
        <li>
          <span className="grant-admin-setup-num" aria-hidden="true">01</span>
          <div className="grant-admin-setup-step">
            <strong>Choose request type</strong>
            <small>Select an active administrator-published request type.</small>
          </div>
        </li>
        <li>
          <span className="grant-admin-setup-num" aria-hidden="true">02</span>
          <div className="grant-admin-setup-step">
            <strong>Enter request details</strong>
            <small>Provide the target, reason and only the fields required by that request type.</small>
          </div>
        </li>
        <li>
          <span className="grant-admin-setup-num" aria-hidden="true">03</span>
          <div className="grant-admin-setup-step">
            <strong>Review and submit</strong>
            <small>Grant applies the administrator-assigned approver plan, notification template,
              verification requirements and deadline. These are read-only to the requester.</small>
          </div>
        </li>
      </ol>
    </Card>
  </div>;
}
