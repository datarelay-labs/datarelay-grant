import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import '../../src/email-template-editor.css';
import {EmailPublicationPanel} from '../../src/email_publication_review';
import {createEmailDesign} from '../../src/email_design';
import type {NotificationTemplateSet} from '../../src/types';
const initial:NotificationTemplateSet={id:'synthetic',name:'Synthetic publication',enabled:true,design:createEmailDesign(),templates:{} as NotificationTemplateSet['templates'],created_at:1,updated_at:1,published_revision:1,draft_revision:2};
function Harness(){
 const [template,setTemplate]=useState(initial),[dirty,setDirty]=useState(false),[current,setCurrent]=useState(true);
 return <main style={{maxWidth:1200,margin:'auto',padding:16}}><h1>Publication — synthetic component test</h1>
  <label><input type="checkbox" checked={dirty} onChange={e=>setDirty(e.target.checked)}/>Unsaved change</label>
  <label><input type="checkbox" checked={current} onChange={e=>setCurrent(e.target.checked)}/>Current preview</label>
  <EmailPublicationPanel template={template} draftSignature={JSON.stringify([template.updated_at,dirty])} dirty={dirty} previewCurrent={current} disabled={false} onPublished={setTemplate}/>
  <output aria-label="Observed publication revision">{template.published_revision}</output>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
