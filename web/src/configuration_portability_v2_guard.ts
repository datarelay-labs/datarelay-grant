/** v2 UI projection guard. Full semantic/security validation remains server-only.
 * Keep the COMPLETE input unchanged, including all Profile extras/defaults.
 */
export type V2Policy = {
  id: string;
  source_lifecycle: string;
  config: {
    name: string;
    approver_id: string;
    integration_id: string;
    approver_group_id?: string | null;
    approval_mode?: string;
    [name: string]: unknown;
  };
};
export type V2Bundle = {
  schema_version: 2;
  format: 'grant.configuration';
  credential_material_included: false;
  integrations: {id: string; name: string; kind: string; tenant?: string; [name: string]: unknown}[];
  policies: V2Policy[];
  templates: {id: string; name: string; templates: Record<string, unknown>; [name: string]: unknown}[];
  [name: string]: unknown;
};
export type V2Mappings = {
  integrations: Record<string,string>;
  approvers: Record<string,string>;
  groups: Record<string,string>;
};
export type V2Preview = {
  schema_version: 2;
  preview_only: true;
  can_import_drafts: boolean;
  will_activate: false;
  preview_digest: string;
  summary: {integrations: number; policies: number; templates: number};
  conflicts: {kind: string; name: string; reason: string}[];
  warnings: string[];
};
const record=(v:unknown):v is Record<string,unknown>=>
  v!==null && typeof v==='object' && !Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
function invalid():never{throw new Error('Invalid or incomplete version-2 configuration bundle.');}
export function acceptV2Bundle(value:unknown):V2Bundle{
  if(!record(value)||value.schema_version!==2||value.format!=='grant.configuration'||
      value.credential_material_included!==false||
      !Array.isArray(value.integrations)||!Array.isArray(value.policies)||
      !Array.isArray(value.templates))invalid();
  if(!value.integrations.every(i=>record(i)&&text(i.id)&&text(i.name)&&text(i.kind)&&
      (i.tenant===undefined||typeof i.tenant==='string')))invalid();
  if(!value.policies.every(p=>record(p)&&text(p.id)&&text(p.source_lifecycle)&&record(p.config)&&
      text(p.config.name)&&text(p.config.approver_id)&&text(p.config.integration_id)&&
      (p.config.approval_mode===undefined||typeof p.config.approval_mode==='string')&&
      (p.config.approver_group_id===undefined||p.config.approver_group_id===null||
       typeof p.config.approver_group_id==='string')))invalid();
  if(!value.templates.every(t=>record(t)&&text(t.id)&&text(t.name)&&record(t.templates)))invalid();
  // Do not normalize, strip unknown fields, or mutate server-authored identities.
  return value as V2Bundle;
}
export function acceptV2Preview(value:unknown):V2Preview{
  if(!record(value)||value.schema_version!==2||value.preview_only!==true||
    value.will_activate!==false||typeof value.can_import_drafts!=='boolean'||
    typeof value.preview_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.preview_digest)||
    !record(value.summary)||!['integrations','policies','templates'].every(k=>
      Number.isSafeInteger((value.summary as Record<string,unknown>)[k])&&
      ((value.summary as Record<string,unknown>)[k] as number)>=0)||
    !Array.isArray(value.conflicts)||!value.conflicts.every(c=>record(c)&&
      typeof c.kind==='string'&&typeof c.name==='string'&&typeof c.reason==='string')||
    !Array.isArray(value.warnings)||!value.warnings.every(w=>typeof w==='string')){
    throw new Error('Configuration preview did not contain a safe v2 review.');
  }
  return value as V2Preview;
}
/** Never accept an old digest for a newly selected source or mapping. */
export function reviewV2Identity(bundle:unknown,mappings:V2Mappings):string{
  return JSON.stringify({bundle,mappings});
}
export function canCommitReviewedV2(
  reviewedIdentity:string,currentIdentity:string,
  canImport:boolean,digest:string,confirmation:string,
):boolean{
  return Boolean(reviewedIdentity&&reviewedIdentity===currentIdentity&&canImport&&
    /^[a-f0-9]{64}$/.test(digest)&&confirmation==='IMPORT_DRAFTS_ONLY');
}
