import {describe,expect,it} from 'vitest';
import {isIntegrationRegistrationDraftDirty} from '../../src/integrations';
import type {IntegrationRegistrationDraft} from '../../src/integration_creation_review';

const base:IntegrationRegistrationDraft={
 name:'',kind:'datarelay',tenant:'',callbackUrl:'',headers:'{}',
 hmacSecret:'',decisionMinimum:'',eventFormat:'LEGACY',
};
const dirty=(changed:Partial<IntegrationRegistrationDraft>={},rawTenant='',reviewed=false)=>
 isIntegrationRegistrationDraftDirty({...base,...changed},rawTenant,reviewed);
describe('Grant integration registration unsaved draft guard',()=>{
 it('allows direct navigation from pristine Add connection',()=>{
  expect(dirty()).toBe(false);
 });
 it('guards each human-entered connection, callback and assurance field',()=>{
  expect(dirty({name:'Local only'})).toBe(true);
  expect(dirty({kind:'stellar'})).toBe(true);
  expect(dirty({callbackUrl:'https://example.invalid/cb'})).toBe(true);
  expect(dirty({headers:'{"X-Grant":"test"}'})).toBe(true);
  expect(dirty({hmacSecret:'redacted-test-only-secret'})).toBe(true);
  expect(dirty({decisionMinimum:'EMAIL_PIN'})).toBe(true);
  expect(dirty({eventFormat:'CLOUDEVENTS'})).toBe(true);
 });
 it('retains hidden Stellar tenant even after type switches back to DataRelay',()=>{
  expect(dirty({},'a-tenant')).toBe(true);
 });
 it('guards an unconfirmed reviewed registration before the POST',()=>{
  expect(dirty({},'',true)).toBe(true);
 });
 it('allows exiting once every unsent local input is explicitly discarded',()=>{
  const edited={...base,name:'a',hmacSecret:'opaque',decisionMinimum:'EMAIL_PIN'};
  expect(isIntegrationRegistrationDraftDirty(edited,'',false)).toBe(true);
  expect(isIntegrationRegistrationDraftDirty(base,'',false)).toBe(false);
 });
});
