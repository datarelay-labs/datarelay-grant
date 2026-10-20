import {describe,it,expect} from 'vitest';
import {acceptV2Bundle,acceptV2Preview,reviewV2Identity,canCommitReviewedV2} from '../../src/configuration_portability_v2_guard';
import {createConfigurationPreviewReadScope,readCurrentConfigurationExport} from '../../src/integration_configuration_preview_guard';

const base={schema_version:2,format:'grant.configuration',credential_material_included:false,
 integrations:[{id:'source-i',name:'source',kind:'datarelay'}],
 policies:[{id:'p',source_lifecycle:'DRAFT',config:{name:'policy',approver_id:'user',integration_id:'source-i'}}],
 templates:[{id:'t',name:'template',templates:{}}]};
const asJson=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

describe('v2 imported file rendering safety',()=>{
 it('rejects nested null/missing/invalid members before UI reads them',()=>{
   const bad=[
     {...base,policies:[{}]},{...base,policies:[null]},
     {...base,policies:[{...base.policies[0],config:null}]},
     {...base,policies:[{...base.policies[0],config:{name:'x',approver_id:null,integration_id:'source-i'}}]},
     {...base,integrations:[null]},
     {...base,integrations:[{id:'x',name:'x',kind:'datarelay',tenant:{}}]},
     {...base,templates:[null]},{...base,templates:[{id:'t',name:'t',templates:null}]},
   ];
   for(const value of bad)expect(()=>acceptV2Bundle(value)).toThrow();
 });
 it('supports server defaults and retains the EXACT original complete Profile payload',()=>{
   const extended=asJson(base) as typeof base & {policies:any[]};
   extended.policies[0].config={...extended.policies[0].config, extra_backend_profile_field:{keep:'untouched'},email_template_id:null};
   expect(acceptV2Bundle(extended)).toBe(extended);
   expect(acceptV2Bundle({...extended,policies:[{...extended.policies[0],config:{...extended.policies[0].config,approval_mode:'SINGLE',approver_group_id:null}}]})).toBeTruthy();
   expect(()=>acceptV2Bundle({...extended,policies:[{...extended.policies[0],config:{...extended.policies[0].config,approval_mode:[]}}]})).toThrow();
 });
 it('requires read-only v2 preview and defensively checks actual render fields',()=>{
   const valid={schema_version:2,preview_only:true,will_activate:false,can_import_drafts:true,preview_digest:'a'.repeat(64),summary:{integrations:1,policies:1,templates:0},conflicts:[],warnings:[]};
   expect(acceptV2Preview(valid)).toBe(valid);
   for(const broken of [{...valid,preview_only:false},{...valid,will_activate:true},{...valid,summary:null},{...valid,conflicts:[null]},{...valid,preview_digest:'bad'}]){
     expect(()=>acceptV2Preview(broken)).toThrow();
   }
 });
});
describe('v2 reviewer exact current generation and source identity',()=>{
 it('refuses import when reviewed content, mapping or explicit confirmation differs',()=>{
   const m={integrations:{'source-i':'dest'},approvers:{user:'current'},groups:{}};
   const key=reviewV2Identity(base,m);
   expect(canCommitReviewedV2(key,key,true,'a'.repeat(64),'IMPORT_DRAFTS_ONLY')).toBe(true);
   expect(canCommitReviewedV2(key,reviewV2Identity(base,{...m,approvers:{user:''}}),true,'a'.repeat(64),'IMPORT_DRAFTS_ONLY')).toBe(false);
   expect(canCommitReviewedV2(key,reviewV2Identity({...base,templates:[]},m),true,'a'.repeat(64),'IMPORT_DRAFTS_ONLY')).toBe(false);
   expect(canCommitReviewedV2(key,key,true,'a'.repeat(64),'')).toBe(false);
   expect(canCommitReviewedV2(key,key,true,'invalid','IMPORT_DRAFTS_ONLY')).toBe(false);
   expect(canCommitReviewedV2(key,key,false,'a'.repeat(64),'IMPORT_DRAFTS_ONLY')).toBe(false);
 });
 it('discards delayed preview when mapping/file changes, older error and superseded same-input previews',async()=>{
   const scope=createConfigurationPreviewReadScope();const shown:string[]=[];
   let releaseOld!: (v:string)=>void,failOld!:(e:Error)=>void;
   const old=readCurrentConfigurationExport(scope,()=>new Promise<string>(r=>releaseOld=r),v=>shown.push(v));
   scope.invalidate();const latest=await readCurrentConfigurationExport(scope,async()=>'new-file',v=>shown.push(v));
   releaseOld('old-preview');expect(await old).toBe(false);expect(latest).toBe(true);expect(shown).toEqual(['new-file']);
   const older=readCurrentConfigurationExport(scope,()=>new Promise<string>((_,reject)=>failOld=reject),v=>shown.push(v));
   const newer=readCurrentConfigurationExport(scope,async()=>'newer-same-input',v=>shown.push(v));
   failOld(Error('outdated failure'));expect(await older).toBe(false);expect(await newer).toBe(true);
   scope.invalidate();expect(shown).toEqual(['new-file','newer-same-input']);
 });
});
