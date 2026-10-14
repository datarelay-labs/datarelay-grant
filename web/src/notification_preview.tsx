import {designSignature} from './email_design';
import { useState } from 'react';
import { Button } from '@datarelay-labs/foundation';
import type { NotificationTemplateSet } from './types';

export type TemplateDraft = Pick<NotificationTemplateSet, 'name' | 'enabled' | 'templates' | 'design'>;

/**
 * Compare the complete persisted content, not the selected event or updated_at.
 * Sorted events avoid false dirty indicators from backend JSON key ordering.
 */
export function templateDraftSignature(draft: TemplateDraft): string {
  return JSON.stringify([
    draft.name,
    draft.enabled,
    designSignature(draft.design),
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
  testAttempted = false,
  onPreview,
  onTestSend,
}: {
  saved: boolean;
  dirty: boolean;
  busy: boolean;
  testAttempted?: boolean;
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
          disabled={!saved || dirty || busy || testAttempted}
          onClick={onTestSend}
        >
          Review: Send test to me
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


/** No scripts, forms, origin credentials, external resources or top navigation. */
export function NotificationRenderedPreview({rendered}:{rendered:{subject:string;body:string;html?:string}}) {
  const [mode,setMode]=useState<'html'|'text'|'source'>('html');
  const [width,setWidth]=useState('600');
  const policy="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'";
  const document=(rendered.html??'').replace(/<head>/i,
    '<head><meta http-equiv="Content-Security-Policy" content="'+policy+'">');
  return <section aria-label="Rendered email preview">
    <div className="grant-actions" role="group" aria-label="Preview format">
      {(['html','text','source'] as const).map(item=><Button key={item} variant="secondary"
        aria-pressed={mode===item} onClick={()=>setMode(item)}>{item==='html'?'HTML preview':item==='text'?'Plain text':'HTML source'}</Button>)}
    </div>
    <label>Preview width <select value={width} onChange={e=>setWidth(e.target.value)}>
      <option value="600">Desktop · 600px</option><option value="390">Mobile · 390px</option>
      <option value="375">Mobile · 375px</option><option value="320">Mobile · 320px</option>
    </select></label>
    {mode==='html'&&rendered.html?<iframe title="Inert approval email preview" sandbox=""
      referrerPolicy="no-referrer" srcDoc={document}
      style={{width:width+'px',maxWidth:'100%',height:'700px',border:0}}/>:
      <pre className="grant-mono" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{mode==='source'?rendered.html??'HTML unavailable':rendered.body}</pre>}
    <p>Sample links and PIN are inert. This preview does not prove inbox delivery or mail-client compatibility.</p>
  </section>;
}
