import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSubmissionServer} from '../src/smtp-submission.js';
test('SMTP fails closed when production runtime lacks an explicit valid production mode',()=>{const node=process.env.NODE_ENV,mode=process.env.APP_MODE;try{process.env.NODE_ENV='production';delete process.env.APP_MODE;assert.throws(()=>makeSubmissionServer({} as any),/APP_MODE|Production/);process.env.APP_MODE='prodution';assert.throws(()=>makeSubmissionServer({} as any),/APP_MODE|mode/i);}finally{if(node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=node;if(mode===undefined)delete process.env.APP_MODE;else process.env.APP_MODE=mode;}});
