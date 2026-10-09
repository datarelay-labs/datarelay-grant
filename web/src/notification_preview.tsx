import { Button } from '@datarelay-labs/foundation';
import type { NotificationTemplateSet } from './types';

export type TemplateDraft = Pick<NotificationTemplateSet, 'name' | 'enabled' | 'templates'>;

/**
 * Compare the complete persisted content, not the selected event or updated_at.
 * Sorted events avoid false dirty indicators from backend JSON key ordering.
 */
export function templateDraftSignature(draft: TemplateDraft): string {
  return JSON.stringify([
    draft.name,
    draft.enabled,
    ...Object.entries(draft.templates)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([event, value]) => [event, value.subject, value.body]),
  ]);
}

export function hasUnsavedTemplateChanges(
  savedSignature: string | null,
  draft: TemplateDraft,
): boolean {
  return savedSignature !== null && savedSignature !== templateDraftSignature(draft);
}

export function NotificationPreviewActions({
  saved,
  dirty,
  busy,
  onPreview,
  onTestSend,
}: {
  saved: boolean;
  dirty: boolean;
  busy: boolean;
  onPreview: () => void;
  onTestSend: () => void;
}) {
  return (
    <>
      {dirty ? (
        <p role="status">
          Unsaved changes. Save this template set before previewing or sending
          a test, so the result matches the saved version used for delivery.
        </p>
      ) : null}
      <div className="grant-actions">
        <Button
          variant="secondary"
          disabled={!saved || dirty || busy}
          onClick={onPreview}
        >
          Preview rendered message
        </Button>
        <Button
          variant="secondary"
          disabled={!saved || dirty || busy}
          onClick={onTestSend}
        >
          Send test to me
        </Button>
      </div>
    </>
  );
}

export function NotificationRequestLink({ requestId }: { requestId: string }) {
  return (
    <a className="grant-table-link" href={'/requests/' + encodeURIComponent(requestId)}>
      Open request
    </a>
  );
}
