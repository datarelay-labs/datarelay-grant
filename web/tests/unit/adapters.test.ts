import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {verifyAuthAdapter,verifyCapabilityProjection} from '@datarelay-labs/testkit';
import {api,ApiError,setCsrf} from '../../src/api';
import {authAdapter,productConfig} from '../../src/foundation.config';
import type {User} from '../../src/types';
const user:User={id:'actor',username:'test-user',email:'test@example.invalid',role:'member',mfa_enabled:false};
const fetchMock=vi.fn();
beforeEach(()=>{setCsrf('');vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
function respond(data:unknown,status=200){fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));}

describe('Grant HTTP adapter',()=>{
 it('uses same-origin session and no mutation retry',async()=>{
  setCsrf('session-csrf');respond({error:{code:'STALE_OR_FINAL_DECISION'}},409);
  await expect(api('/requests/r/decision','POST',{expected_revision:2,decision:'APPROVED'})).rejects.toMatchObject({status:409,code:'STALE_OR_FINAL_DECISION'});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url,options]=fetchMock.mock.calls[0]!;expect(url).toBe('/api/v1/requests/r/decision');
  expect(options.credentials).toBe('same-origin');expect(options.redirect).toBe('error');expect(options.headers['X-CSRF-Token']).toBe('session-csrf');
 });
 it('never turns a read into a decision',async()=>{
  respond({state:'AWAITING'});await api('/requests/r');
  expect(fetchMock.mock.calls[0]![1].method).toBe('GET');expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty('X-CSRF-Token');
 });
 it.each(['https://unrelated.invalid','//unrelated.invalid','/../admin','/a\\b'])('rejects non-product path %s',async(path)=>{
  await expect(api(path)).rejects.toBeInstanceOf(ApiError);expect(fetchMock).not.toHaveBeenCalled();
 });
 it('does not echo arbitrary server response bodies',async()=>{
  fetchMock.mockResolvedValueOnce(new Response('<secret>do not display</secret>',{status:500}));
  await expect(api('/requests')).rejects.toMatchObject({message:'REQUEST_FAILED'});
 });
 it('leaves an ambiguous network mutation unresolved',async()=>{
  fetchMock.mockRejectedValueOnce(new TypeError('connection lost'));
  await expect(api('/requests/r/consume','POST',{})).rejects.toThrow('connection lost');expect(fetchMock).toHaveBeenCalledTimes(1);
 });
});
describe('Foundation consumer contracts',()=>{
 it('the real auth adapter conforms for authenticated login',async()=>{
  respond({state:'authenticated',csrf:'a'});respond({state:'authenticated',csrf:'a',user});
  const result=await verifyAuthAdapter(authAdapter,{username:user.username,password:'only-test-input'});
  expect(result.ok).toBe(true);
 });
 it('the real auth adapter conforms for MFA challenge',async()=>{
  respond({state:'mfa_required',csrf:'a'});
  const result=await verifyAuthAdapter(authAdapter,{username:user.username,password:'only-test-input'});
  expect(result.ok).toBe(true);
 });
 it('unavailable admin/lifecycle controls are not made interactive',()=>{
  const config=productConfig(user);expect(config.capabilities['grant.integrations.manage']).toBe(false);
  expect(config.capabilities['backup.disaster_recovery.restore']).toBe('unavailable');
  const result=verifyCapabilityProjection([{id:'backup.disaster_recovery.restore',label:'Restore',availability:'unavailable'}],[{id:'backup.disaster_recovery.restore',visible:false,interactive:false}]);
  expect(result.ok).toBe(true);
 });
 it('admin navigation exposes approval policy and notification management',()=>{
  const admin={...user,role:'admin' as const};const config=productConfig(admin);
  expect(config.navigation.map(item=>item.path)).toEqual(expect.arrayContaining(['/profiles','/notifications']));
  expect(config.navigation.find(item=>item.path==='/profiles')?.label).toBe('Approval policies');
  expect(config.navigation.find(item=>item.path==='/notifications')?.label).toBe('Notifications');
  expect(config.navigation.find(item=>item.path==='/email-templates')).toBeUndefined();
 });
});
