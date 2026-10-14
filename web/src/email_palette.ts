/** Grant mail-only color model; deliberately separate from Foundation/app themes. */
import type {EmailDesign} from './email_design';
export type EmailPalette={page_background:string;content_background:string;body_text:string;brand_text:string};
export const emailPalettes:Record<'light'|'warm'|'dark',EmailPalette>={
 light:{page_background:'#f3f4f6',content_background:'#ffffff',body_text:'#111827',brand_text:'#334155'},
 warm:{page_background:'#f5f5f4',content_background:'#fafaf9',body_text:'#292524',brand_text:'#57534e'},
 dark:{page_background:'#030712',content_background:'#111827',body_text:'#f9fafb',brand_text:'#cbd5e1'},
};
export function mailPaletteContrast(foreground:string,background:string):number {
 if(!/^#[0-9a-f]{6}$/i.test(foreground)||!/^#[0-9a-f]{6}$/i.test(background))return 0;
 const luminance=(value:string)=>[1,3,5].map(index=>parseInt(value.slice(index,index+2),16)/255)
  .map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4)
  .reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index]!,0);
 const light=luminance(foreground),dark=luminance(background);
 return (Math.max(light,dark)+.05)/(Math.min(light,dark)+.05);
}
export function applyEmailPalette(value:EmailDesign,palette:keyof typeof emailPalettes):EmailDesign {
 return {...structuredClone(value),shared_layout_revision:value.shared_layout_revision>=5?value.shared_layout_revision:5,palette:{...emailPalettes[palette]}};
}
export function resetEmailPalette(value:EmailDesign):EmailDesign{return applyEmailPalette(value,'light');}
