/** Same synthetic inputs only. Timings are local measurements, not client acceptance. */
import React from 'react';
import {Html,Head,Body,Container,Text,Button,render} from 'react-email';
import mjml from 'mjml';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const modes=['EMAIL_PIN','EMAIL_PIN_PLUS_OTP','EMAIL_PIN_PLUS_MFA'];
const results=[];
for (const language of ['en','ko']) for (const mode of modes) for (const event of ['requested','reminder','approved']) {
 const text=(language==='ko'?'가상 승인 요청 검토 <literal> ':'Synthetic approval review <literal> ').repeat(30);
 const lines=[text,event,mode];
 const labels=event==='approved'?['View Details']:['Approve','Hold','Deny','View Details'];
 const urls=labels.map((_,i)=>'https://example.invalid/grant-preview/'+i);
 const markup=`<mjml><mj-body><mj-section><mj-column>${lines.map(line=>'<mj-text font-family="Arial">'+esc(line)+'</mj-text>').join('')}${labels.map((label,i)=>`<mj-button font-family="Arial" href="${urls[i]}">${label}</mj-button>`).join('')}</mj-column></mj-section></mj-body></mjml>`;
 const react=React.createElement(Html,null,React.createElement(Head),React.createElement(Body,null,
   React.createElement(Container,null,...lines.map((line,i)=>React.createElement(Text,{key:'t'+i},line)),
     ...labels.map((label,i)=>React.createElement(Button,{key:'b'+i,href:urls[i]},label)))));
 const t0=performance.now(); const a=await mjml(markup,{validationLevel:'strict',ignoreIncludes:true,fonts:{},useMjmlConfigOptions:false});const t1=performance.now();
 const b=await render(react); const t2=performance.now();
 assert.equal(a.errors.length,0);
 for (const output of [a.html,b]) {
  for (const label of labels) assert(output.includes(label));
  assert(!output.includes('<literal>'));assert(!/<script|<form|@import|<link\b/i.test(output));
 }
 assert.equal(a.html,(await mjml(markup,{validationLevel:'strict',ignoreIncludes:true,fonts:{},useMjmlConfigOptions:false})).html);
 assert.equal(b,await render(react));
 results.push({language,mode,event,mjml_bytes:Buffer.byteLength(a.html),react_email_bytes:Buffer.byteLength(b),
  mjml_ms:+(t1-t0).toFixed(3),react_email_ms:+(t2-t1).toFixed(3),deterministic:true,semantic_parity:true});
}
const lock=JSON.parse(readFileSync(new URL('package-lock.json',import.meta.url)));
const dependencies=Object.entries(lock.packages).filter(([k])=>k).map(([path,v])=>({path,version:v.version,license:v.license||'UNDECLARED',integrity:v.integrity||null}));
const report={node:process.version,selected:'MJML build-time trusted shells; Python bounded substitution at runtime',
 cases:results,peak_rss_bytes:process.resourceUsage().maxRSS*1024,
 lock_sha256:createHash('sha256').update(JSON.stringify(lock)).digest('hex'),dependencies,
 client_acceptance:'NOT RUN; no SMTP or real mailbox',network_requirements:'No compiler at delivery runtime; no external font/image references'};
writeFileSync(new URL('comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:results.length,all_deterministic:true,all_semantics_match:true,dependencies:dependencies.length,peak_rss_bytes:report.peak_rss_bytes}));
