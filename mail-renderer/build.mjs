/** Build trusted shells only. User content never enters MJML or Node. */
import mjml from 'mjml';
import {writeFileSync, readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

export const options = {validationLevel: 'strict', ignoreIncludes: true,
  useMjmlConfigOptions: false, minify: false, beautify: false, fonts: {}};
export async function compile(source) {
  assert(!/<mj-include|<mj-image|<mj-font|<mj-style|<mj-raw/i.test(source));
  const result = await mjml(source, options);
  assert.equal(result.errors.length, 0);
  assert(Buffer.byteLength(result.html) <= 32768);
  assert(!/<script|<form|@import|<link\b/i.test(result.html));
  return result.html;
}
export function source(decisions, revision=1) {
  const mark = id => revision >= 3 ? ' css-class="grant-mail-block-'+id+'"' : '';
  const actions = decisions ? ['APPROVE','HOLD','DENY','DETAILS'] : ['DETAILS'];
  return `<mjml><mj-head><mj-title>@@GRANT_SUBJECT@@</mj-title></mj-head>
<mj-body width="600px" background-color="#f3f4f6"><mj-section background-color="#ffffff" padding="23px"><mj-column>
<mj-text${mark("brand")} font-family="Arial, sans-serif" font-size="15px" color="#334155">@@GRANT_BRAND@@</mj-text>
<mj-text${mark("heading")} font-family="Arial, sans-serif" font-size="24px" color="#111827" font-weight="700">@@GRANT_TITLE@@</mj-text>
<mj-text${mark("message")}${revision>=2?' align="right"':''} font-family="Arial, sans-serif" font-size="19px" line-height="1.6" color="#111827">@@GRANT_BODY@@</mj-text>
<mj-text${mark("request_context")} font-family="Arial, sans-serif" font-size="16px" line-height="1.6" color="#111827">@@GRANT_CONTEXT@@</mj-text>
${decisions ? `<mj-text${mark('verification')} font-family="Arial, sans-serif" font-size="16px" line-height="1.6" color="#111827">@@GRANT_GUIDANCE@@</mj-text>` : ''}
${actions.map((a,i)=>`<mj-button${mark("actions")}${revision>=2?' width="100%"':''} font-family="Arial, sans-serif" font-size="17px" font-weight="700" line-height="24px" inner-padding="13px 29px" padding="9px 0" border-radius="7px" background-color="${['#166534','#854d0e','#991b1b','#334155'][decisions?i:3]}" color="#ffffff" href="@@GRANT_${a}_URL@@" target="_blank">@@GRANT_${a}_LABEL@@</mj-button>`).join('')}
${decisions ? `<mj-text${mark('verification')} font-family="Arial, sans-serif" font-size="18px" line-height="1.6" color="#111827">@@GRANT_PIN@@</mj-text>` : ''}
<mj-text${mark("footer")} font-family="Arial, sans-serif" font-size="14px" line-height="1.6" color="#334155">@@GRANT_FOOTER@@</mj-text>
</mj-column></mj-section></mj-body></mjml>`;
}
function slots(html, revision=1) {
  const pairs = {'font-size:19px':'font-size:@@GRANT_FONT_SIZE@@px',
    'font-size:17px':'font-size:@@GRANT_BUTTON_FONT@@px',
    'padding:13px 29px':'padding:@@GRANT_BUTTON_Y@@px @@GRANT_BUTTON_X@@px',
    'padding:9px 0':'padding:@@GRANT_GAP@@px 0',
    'border-radius:7px':'border-radius:@@GRANT_RADIUS@@px',
    '#166534':'@@GRANT_APPROVE_COLOR@@', '#854d0e':'@@GRANT_HOLD_COLOR@@',
    '#991b1b':'@@GRANT_DENY_COLOR@@'};
  for (const [value, slot] of Object.entries(pairs)) html=html.replaceAll(value,slot);
  if(revision>=2) html=html.replaceAll('text-align:right','text-align:@@GRANT_ALIGN@@')
    .replaceAll('display:inline-block;background:','display:block;background:')
    .replaceAll('mso-padding-alt:13px 29px','mso-padding-alt:@@GRANT_BUTTON_Y@@px @@GRANT_BUTTON_X@@px');
  return html.replace(/<html\b/, '<html lang="@@GRANT_LOCALE@@"');
}
for (const revision of [1,2,3]) {
  const layouts = {decision:slots(await compile(source(true,revision)),revision),
    notice:slots(await compile(source(false,revision)),revision)};
  const artifact = {contract_version:1, renderer:'mjml@5.4.1', layout_revision:revision, layouts};
  const output = JSON.stringify(artifact,null,2)+'\n';
  const path = new URL('../grant/email_layout_v'+revision+'.json', import.meta.url);
  if (process.argv.includes('--check') || revision<=2&&existsSync(path)) assert.equal(readFileSync(path,'utf8'), output);
  else writeFileSync(path, output);
  console.log(JSON.stringify({artifact:'grant/email_layout_v'+revision+'.json',bytes:Buffer.byteLength(output),
    sha256:createHash('sha256').update(output).digest('hex')}));
}
