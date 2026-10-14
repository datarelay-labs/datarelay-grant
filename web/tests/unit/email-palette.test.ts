import {describe,it,expect} from 'vitest';
import {createEmailDesign} from '../../src/email_design';
import {applyEmailPalette,resetEmailPalette,mailPaletteContrast,emailPalettes} from '../../src/email_palette';

describe('U3 bounded outgoing-mail palettes',()=>{
 it('curated foregrounds are readable against their own content backgrounds',()=>{
  for(const palette of Object.values(emailPalettes)){
   expect(mailPaletteContrast(palette.body_text,palette.content_background)).toBeGreaterThanOrEqual(4.5);
   expect(mailPaletteContrast(palette.brand_text,palette.content_background)).toBeGreaterThanOrEqual(4.5);
  }
  expect(mailPaletteContrast('#ffffff','#ffffff')).toBe(1);expect(mailPaletteContrast('invalid','#ffffff')).toBe(0);
 });
 it('palette changes and reset preserve all non-palette content and styles',()=>{
  const initial={...createEmailDesign(),locale:'ko' as const,heading:'Custom',footer:'Custom footer',event_preheaders:{requested:'Custom summary'}};
  const dark=applyEmailPalette(initial,'dark');expect(dark.shared_layout_revision).toBe(5);
  expect(dark.palette).toEqual(emailPalettes.dark);
  for(const key of ['styles','button_suffixes','locale','heading','footer','event_preheaders','blocks'] as const)expect(dark[key]).toEqual(initial[key]);
  const reset=resetEmailPalette(dark);expect(reset.palette).toEqual(emailPalettes.light);expect(reset.event_preheaders).toEqual(initial.event_preheaders);expect(reset.styles).toEqual(initial.styles);
 });
});
