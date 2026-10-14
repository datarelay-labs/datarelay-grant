import {Button,TextField} from '@datarelay-labs/foundation';
import type {EmailDesign} from './email_design';
import {emailPalettes,applyEmailPalette,resetEmailPalette,mailPaletteContrast,type EmailPalette} from './email_palette';
const labels:Record<keyof EmailPalette,string>={page_background:'Mail page background',content_background:'Mail content background',body_text:'Mail body text color',brand_text:'Mail brand text color'};
export function EmailPaletteControls({design,disabled,onChange}:{design:EmailDesign;disabled:boolean;onChange:(design:EmailDesign)=>void}){
 const palette=design.palette??emailPalettes.light;
 const bodyContrast=mailPaletteContrast(palette.body_text,palette.content_background),brandContrast=mailPaletteContrast(palette.brand_text,palette.content_background);
 return <section aria-label="Mail color palette">
  <h4>Mail colors</h4><p>All events in this template set. This does not change the application theme or published mail.</p>
  <div className="grant-actions" role="group" aria-label="Curated mail colors">{(['light','warm','dark'] as const).map(key=>{
   const example=emailPalettes[key],label=key.charAt(0).toUpperCase()+key.slice(1);
   const selected=Object.entries(example).every(([field,value])=>palette[field as keyof EmailPalette]===value);
   return <Button type="button" key={key} variant="secondary" disabled={disabled} aria-pressed={selected} aria-label={'Use '+label+' mail palette'} onClick={()=>onChange(applyEmailPalette(design,key))}>
    <span aria-hidden="true" style={{display:'inline-block',background:example.content_background,color:example.body_text,border:'3px solid '+example.page_background,borderRadius:4,padding:'4px 9px',marginRight:6}}>Aa</span>{label}
   </Button>;
  })}</div>
  <p role="status" aria-label="Mail color contrast">Body {bodyContrast.toFixed(2)}:1 · Brand {brandContrast.toFixed(2)}:1. Minimum 4.5:1 against the content background.</p>
  {(bodyContrast<4.5||brandContrast<4.5)&&<p role="alert">These mail colors are not readable enough. Choose a curated palette or correct the custom text/background colors.</p>}
  <details><summary>Custom mail colors</summary>{(Object.keys(labels) as (keyof EmailPalette)[]).map(key=><TextField key={key} label={labels[key]} maxLength={7} value={palette[key]} disabled={disabled}
   onChange={event=>onChange({...design,shared_layout_revision:5,palette:{...palette,[key]:event.target.value}})}/>)}</details>
  <Button type="button" variant="secondary" disabled={disabled} onClick={()=>onChange(resetEmailPalette(design))}>Reset mail colors</Button>
 </section>;
}
