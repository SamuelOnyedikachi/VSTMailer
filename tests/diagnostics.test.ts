import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseDomain} from '../src/domain-diagnostics.js';
test('DNS diagnostics distinguish lookup failures, record presence and unprovisioned DKIM',async()=>{const result=await diagnoseDomain({name:'example.com',verification_token:'abc',dkim_selector:null,dkim_value:null},async host=>{if(host.startsWith('_vstmailer'))return [['vstmailer-verification=abc']];if(host.startsWith('_dmarc'))throw Object.assign(new Error('timeout'),{code:'ETIMEOUT'});return [['v=spf1 -all']];});assert.equal(result.ownership.status,'present');assert.equal(result.spf.status,'present');assert.equal(result.dmarc.status,'lookup_failed');assert.equal(result.dkim.status,'not_provisioned');});
