/** Grant-owned preview safety for the single normalized embedded PNG logo. */
const PREFIX='data:image/png;base64,';
export function safeEmbeddedLogo(src:string):boolean {
 if(!src.startsWith(PREFIX)||src.length>PREFIX.length+43692||!/^[A-Za-z0-9+/]+={0,2}$/.test(src.slice(PREFIX.length)))return false;
 try{
  const raw=atob(src.slice(PREFIX.length));
  if(raw.length<33||raw.length>32768||raw.slice(0,8)!=='\x89PNG\r\n\x1a\n'||raw.slice(12,16)!=='IHDR')return false;
  const u32=(offset:number)=>(((raw.charCodeAt(offset)<<24)>>>0)+(raw.charCodeAt(offset+1)<<16)+(raw.charCodeAt(offset+2)<<8)+raw.charCodeAt(offset+3));
  const width=u32(16),height=u32(20);
  return width>=1&&width<=512&&height>=1&&height<=512;
 }catch{return false;}
}
const escaped=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function sanitizeEmbeddedLogos(source:string):string|null {
 let count=0,invalid=false;
 const html=source.replace(/<img\b[\s\S]*?\/?>/gi,tag=>{
  count++;if(count>1){invalid=true;return '';}
  const attrs:Record<string,string>={};let rest=tag.replace(/^<img\b/i,'').replace(/\/?>$/,'');
  rest=rest.replace(/([a-z][\w:-]*)\s*=\s*"([^"]*)"/gi,(_all,name:string,value:string)=>{
   name=name.toLowerCase();if(name in attrs)invalid=true;attrs[name]=value;return '';
  });
  const allowed=new Set(['alt','src','style','width','height']);
  if(rest.trim()||Object.keys(attrs).some(name=>!allowed.has(name))||!safeEmbeddedLogo(attrs.src??'')){invalid=true;return '';}
  const width=Number(attrs.width);
  if(!Number.isInteger(width)||width<64||width>256||attrs.height!=='auto'||/[<>]/.test(attrs.alt??'')){invalid=true;return '';}
  return `<img src="${attrs.src}" alt="${escaped((attrs.alt??'Brand logo').slice(0,200))}" width="${width}" style="display:block;max-width:100%;height:auto;">`;
 });
 return invalid?null:html;
}
