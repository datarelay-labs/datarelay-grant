import {useState} from 'react';
import {Alert,Button,TextField} from '@datarelay-labs/foundation';
import {api,errorText} from './api';
import type {EmailDesign} from './email_design';

type UploadedLogo={id:string;media_type:'image/png';width:number;height:number;bytes:number;immutable:true};
const MAX_LOGO_BYTES=32*1024;
function trustedUpload(value:unknown):value is UploadedLogo{
 if(!value||typeof value!=='object')return false;
 const item=value as Partial<UploadedLogo>;
 return typeof item.id==='string'&&/^[0-9a-f]{64}$/.test(item.id)&&item.media_type==='image/png'
  &&Number.isInteger(item.width)&&Number.isInteger(item.height)&&(item.width??0)>=1&&(item.width??0)<=512&&(item.height??0)>=1&&(item.height??0)<=512
  &&Number.isInteger(item.bytes)&&(item.bytes??0)>=1&&(item.bytes??0)<=MAX_LOGO_BYTES&&item.immutable===true;
}
function bytesToBase64(buffer:ArrayBuffer):string{
 const bytes=new Uint8Array(buffer);let out='';
 for(let offset=0;offset<bytes.length;offset+=8192)out+=String.fromCharCode(...bytes.subarray(offset,Math.min(bytes.length,offset+8192)));
 return btoa(out);
}
export function EmailLogoControls({design,disabled,onChange}:{design:EmailDesign;disabled:boolean;onChange:(value:EmailDesign)=>void}){
 const [uploading,setUploading]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [asset,setAsset]=useState<UploadedLogo|null>(null);
 async function upload(file:File){
  setNotice('');setError('');
  if(!file.size||file.size>MAX_LOGO_BYTES){setError('Choose a PNG or JPEG no larger than 32 KiB.');return;}
  if(file.type&&!['image/png','image/jpeg'].includes(file.type)){setError('Only PNG or JPEG raster images are accepted. SVG and remote image URLs are not supported.');return;}
  setUploading(true);
  try{
   const value=await api<unknown>('/notification-assets','POST',{data_base64:bytesToBase64(await file.arrayBuffer())});
   if(!trustedUpload(value))throw Error('INVALID_LOGO_UPLOAD_RESPONSE');
   setAsset(value);
   const revision:EmailDesign['shared_layout_revision']=design.shared_layout_revision<6?6:design.shared_layout_revision;
   onChange({...design,shared_layout_revision:revision,logo_asset_id:value.id,logo_width:design.logo_width??160});
   setNotice('Logo normalized and stored as an immutable local asset. Saving this draft does not publish it.');
  }catch(reason){setError(reason instanceof Error&&reason.message==='INVALID_LOGO_UPLOAD_RESPONSE'?'The logo upload response was invalid. No draft change was applied.':errorText(reason));}
  finally{setUploading(false);}
 }
 const current=design.logo_asset_id;
 return <section aria-label="Email logo controls" className="grant-email-logo-controls">
  <p>Optional logo. Upload a local PNG or JPEG up to 32 KiB and 512 × 512 pixels. The server normalizes it to a content-addressed PNG; remote URLs and SVG are never fetched.</p>
  <label>Logo image upload <input aria-label="Logo image upload" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={disabled||uploading}
   onChange={event=>{const input=event.currentTarget,file=input.files?.[0];if(file)void upload(file).finally(()=>{input.value='';});}}/></label>
  {current&&<>
   <p>Current immutable asset <code>{current.slice(0,12)}…</code>{asset?.id===current?` · ${asset.width} × ${asset.height}px · ${asset.bytes.toLocaleString()} bytes`:''}</p>
   <TextField label="Rendered logo width (px)" type="number" min={64} max={256} value={String(design.logo_width??160)} disabled={disabled||uploading}
    onChange={event=>{const value=Number(event.target.value);if(Number.isInteger(value)&&value>=64&&value<=256)onChange({...design,logo_width:value});}}/>
   <Button type="button" variant="secondary" disabled={disabled||uploading} onClick={()=>{setAsset(null);setNotice('Logo removed from this draft. The immutable uploaded asset is retained for historical references.');onChange({...design,logo_asset_id:null});}}>Remove logo from draft</Button>
  </>}
  <p>The text brand remains in every message and is the fallback when images are blocked.</p>
  {uploading&&<p role="status">Validating and normalizing logo…</p>}
  {notice&&<Alert tone="success" title={notice}/>} {error&&<Alert tone="critical" title={error}/>}
 </section>;
}
