import {EmailCanvasProjection} from './email_canvas_projection';
import type {EmailBlock} from './email_canvas_model';
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


export function inertEmailDocument(html:string):string {
 // Reject active/resource elements before iframe parsing. CSP remains defense
 // in depth; even browser-observable blocked resource attempts are unnecessary.
 if(/<\s*(?:script|img|iframe|frame|object|embed|link|base|form|input|textarea|select|video|audio|source|svg|math)\b/i.test(html)
    || /<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/i.test(html)){
  html='<!doctype html><html><head></head><body><p>Active content is not permitted in an email preview.</p></body></html>';
 }
 const policy="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'";
 const meta='<meta http-equiv="Content-Security-Policy" content="'+policy+'">';
 return /<head>/i.test(html)?html.replace(/<head>/i,'<head>'+meta):'<!doctype html><html><head>'+meta+'</head><body>'+html+'</body></html>';
}

/** No scripts, forms, origin credentials, external resources or top navigation. */
export function NotificationRenderedPreview({rendered,selectedBlock,onSelectBlock}:{rendered:{subject:string;body:string;html?:string};selectedBlock?:EmailBlock;onSelectBlock?:(block:EmailBlock)=>void}) {
  const interactive=!!onSelectBlock;
  const [mode,setMode]=useState<'canvas'|'html'|'text'|'source'>(interactive?'canvas':'html');
  const [width,setWidth]=useState('600');
  const document=inertEmailDocument(rendered.html??'');
  return <section aria-label="Rendered email preview">
    <div className="grant-actions" role="group" aria-label="Preview format">
      {(interactive?(['canvas','html','text','source'] as const):(['html','text','source'] as const)).map(item=><Button key={item} variant="secondary"
        aria-pressed={mode===item} onClick={()=>setMode(item)}>{item==='canvas'?'Edit canvas':item==='html'?'Layout preview':item==='text'?'Plain text':'HTML source'}</Button>)}
    </div>
    <label>Preview width <select value={width} onChange={e=>setWidth(e.target.value)}>
      <option value="600">Desktop · 600px</option><option value="390">Mobile · 390px</option>
      <option value="375">Mobile · 375px</option><option value="320">Mobile · 320px</option>
    </select></label>
    {mode==='canvas'&&interactive&&rendered.html?<div className="grant-email-canvas-size" style={{width:width+'px',maxWidth:'100%'}}><EmailCanvasProjection html={rendered.html} selected={selectedBlock??'message'} onSelect={onSelectBlock!}/></div>:mode==='html'&&rendered.html?<iframe title="Inert approval email preview" sandbox=""
      referrerPolicy="no-referrer" srcDoc={document}
      style={{width:width+'px',maxWidth:'100%',height:'700px',border:0}}/>:
      <pre className="grant-mono" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{mode==='source'?rendered.html??'HTML unavailable':rendered.body}</pre>}
    <p>Sample links and PIN are inert. This preview does not prove inbox delivery or mail-client compatibility.</p>
  </section>;
}
