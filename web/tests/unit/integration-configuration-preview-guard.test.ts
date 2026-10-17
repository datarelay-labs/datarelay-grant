import { describe, expect, it } from 'vitest';
import {
  createConfigurationPreviewReadScope, readCurrentConfigurationPreview,
  readCurrentConfigurationExport, acceptReadOnlyConfigurationPreview,
} from '../../src/integration_configuration_preview_guard';

const safe = {
  schema_version: 1, preview_only: true, can_apply: false,
  summary: { integrations: 2, policies: 1, templates: 0 },
  conflicts: [],
  readiness: { automatic_apply_available: false, manual_review_only: true, required_actions: 1 },
  requirements: [{ kind: 'integration', name: 'Receiver', reason: 'mapping',
    operator_action: 'Select existing destination explicitly' }],
  warnings: ['No automatic import'],
};
function pending<T>() {
  let resolve!:(v:T)=>void, reject!:(e:Error)=>void;
  const promise = new Promise<T>((yes,no)=>{resolve=yes;reject=no});
  return {promise,resolve,reject};
}
describe('P0 configuration migration safe preview selected-source truth',()=>{
  it('ignores stale preview of original manifest after typed source changes', async()=>{
    const scope=createConfigurationPreviewReadScope(),late=pending<typeof safe>(),shown:string[]=[];
    const old=readCurrentConfigurationPreview(scope,()=>late.promise,
      v=>shown.push(String(v.summary.integrations)));
    scope.invalidate();
    late.resolve(safe);
    expect(await old).toBe(false);
    expect(shown).toEqual([]);
    expect(await readCurrentConfigurationPreview(scope,
      async()=>({...safe,summary:{...safe.summary,integrations:3}}),
      v=>shown.push(String(v.summary.integrations)))).toBe(true);
    expect(shown).toEqual(['3']);
  });
  it('blocks earlier same-input GET errors from overriding latest result',async()=>{
    const scope=createConfigurationPreviewReadScope(),slow=pending<typeof safe>();
    const shown:number[]=[];
    const first=readCurrentConfigurationPreview(scope,()=>slow.promise,v=>shown.push(v.summary.policies));
    expect(await readCurrentConfigurationPreview(scope,
      async()=>({...safe,summary:{...safe.summary,policies:7}}),
      v=>shown.push(v.summary.policies))).toBe(true);
    slow.reject(Error('expired status'));
    expect(await first).toBe(false);
    expect(shown).toEqual([7]);
  });
  it('invalidates prior preview when a new role-scoped export starts',async()=>{
    const scope=createConfigurationPreviewReadScope(),slow=pending<typeof safe>();
    const seen:string[]=[];
    const old=readCurrentConfigurationPreview(scope,()=>slow.promise,
      ()=>seen.push('wrong source'));
    expect(await readCurrentConfigurationExport(scope,async()=>({schema_version:1}),
      ()=>seen.push('new manifest'))).toBe(true);
    slow.resolve(safe);
    expect(await old).toBe(false);
    expect(seen).toEqual(['new manifest']);
  });
  it('rejects responses that claim writes/automation or malformed readiness',()=>{
    expect(acceptReadOnlyConfigurationPreview(safe)).toEqual(safe);
    for(const unsafe of [
      {...safe,preview_only:false},{...safe,can_apply:true},
      {...safe,schema_version:2},
      {...safe,readiness:{...safe.readiness,manual_review_only:false}},
      {...safe,readiness:{...safe.readiness,automatic_apply_available:true}},
      {...safe,requirements:[]},{...safe,conflicts:null},
    ]){
      expect(()=>acceptReadOnlyConfigurationPreview(unsafe)).toThrow('CONFIGURATION_PREVIEW_NOT_READ_ONLY');
    }
  });
  it('stale export errors cannot displace edited source',async()=>{
    const scope=createConfigurationPreviewReadScope(),slow=pending<{schema_version:number}>();
    const old=readCurrentConfigurationExport(scope,()=>slow.promise,()=>{throw Error('old applied')});
    scope.invalidate();
    slow.reject(Error('old export denied'));
    expect(await old).toBe(false);
  });
});
