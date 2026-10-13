import type {HomeWorkspace} from './home_pages';
import type {User} from './types';
import './workflow-guidance.css';

/** Role-scoped starting points. Navigation is informational, never a decision. */
export function HomeGettingStarted({
  user, view, navigate, summaryComplete = true,
}: {
  user: User;
  view: HomeWorkspace;
  navigate: (path: string) => void;
  summaryComplete?: boolean;
}) {
  const workCount = (count: number, singular: string) =>
    `${summaryComplete ? '' : 'At least '}${count} ${singular}${count === 1 ? '' : 's'}`;
  const choices = [
    {
      number: '01',symbol: '+',title: 'Create approval request',
      description: 'Choose a policy, name the target, and send it for review.',
      action: 'Start a request',destination: '/requests/new',
      detail: 'No operation runs when you create a request.',
    },
    {
      number: '02',symbol: '✓',title: 'Review assigned work',
      description: view.decisions.length
        ? `${workCount(view.decisions.length,'approval')} need your decision.`
        : 'Open your inbox to review work assigned to you.',
      action: 'Open my approvals',destination: '/approvals',
      detail: 'You will review the exact action before deciding.',
    },
    {
      number: '03',symbol: '↗',title: 'Track my requests',
      description: view.submitted.length
        ? `Follow ${workCount(view.submitted.length,'request')} you submitted.`
        : 'See whether your requests are waiting, approved or denied.',
      action: 'View my requests',destination: '/my-requests',
      detail: 'Human decisions and external results are shown separately.',
    },
  ];
  return <section className="grant-guided-start" aria-labelledby="grant-start-title">
    <div className="grant-guided-heading">
      <div>
        <p className="grant-guided-eyebrow">Start here</p>
        <h3 id="grant-start-title">What would you like to do?</h3>
      </div>
      {user.role === 'admin' &&
        <button type="button" className="grant-guided-admin-link"
          onClick={() => navigate('/profiles')}>
          Administrator? Set up approval policies <span aria-hidden="true">→</span>
        </button>}
    </div>
    <div className="grant-guided-cards">
      {choices.map((choice) =>
        <button type="button" key={choice.number} className="grant-guided-card"
          onClick={() => navigate(choice.destination)}>
          <span className="grant-guided-card-top">
            <span className="grant-guided-step" aria-hidden="true">{choice.number}</span>
            <span className="grant-guided-symbol" aria-hidden="true">{choice.symbol}</span>
          </span>
          <strong>{choice.title}</strong>
          <span className="grant-guided-description">{choice.description}</span>
          <span className="grant-guided-action">{choice.action} <span aria-hidden="true">→</span></span>
          <small>{choice.detail}</small>
        </button>
      )}
    </div>
  </section>;
}
