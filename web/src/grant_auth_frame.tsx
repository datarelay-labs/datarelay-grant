import type { ComponentProps } from 'react';
import { AuthLayout } from '@datarelay-labs/foundation';

const RESOURCES = [
  { title: 'Documentation', description: 'datarelay.run/docs', href: 'https://datarelay.run/docs', external: true },
  { title: 'Quick Start Guide', description: 'datarelay.run/quickstart', href: 'https://datarelay.run/quickstart', external: true },
  { title: 'Release Notes', description: 'datarelay.run/releases', href: 'https://datarelay.run/releases', external: true },
  { title: 'DataRelay Website', description: 'datarelay.run', href: 'https://datarelay.run', external: true },
  { title: 'Support', description: 'support@datarelay.run', href: 'mailto:support@datarelay.run', external: false },
] as const;

/** Keep the sign-in task before secondary resource links on narrow screens.
 * Resources remain available on demand, without altering authentication.
 */
export function GrantAuthFrame({
  children, ...layoutProps
}: Omit<ComponentProps<typeof AuthLayout>, 'resources'>) {
  return (
    <AuthLayout {...layoutProps} resources={[]}>
      {children}
      <details className="grant-auth-help">
        <summary>Help &amp; documentation</summary>
        <nav aria-label="Resources">
          {RESOURCES.map((resource) => (
            <a href={resource.href} key={resource.href}
              {...(resource.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              <strong>{resource.title}</strong>
              <small>{resource.description}</small>
            </a>
          ))}
        </nav>
      </details>
    </AuthLayout>
  );
}
