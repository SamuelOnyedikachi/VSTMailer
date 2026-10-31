import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,reset} from './helpers.js';
import {buildApp} from '../src/app.js';
import {authenticate} from '../src/auth.js';
beforeEach(reset);after(()=>pool.end());
test('OAuth routes bind state cookie, issue HttpOnly sessions and redirect without leaking codes',async()=>{
 const oldId=process.env.GOOGLE_CLIENT_ID,oldSecret=process.env.GOOGLE_CLIENT_SECRET,oldFetch=globalThis.fetch;
 process.env.GOOGLE_CLIENT_ID='route-test';process.env.GOOGLE_CLIENT_SECRET='secret';const app=await buildApp(pool);
 try{
  const start=await app.inject({url:'/auth/oauth/google/start'});assert.equal(start.statusCode,302);assert.match(start.headers['set-cookie'] as string,/Path=\/api\/auth\/oauth/);assert.match(start.headers['set-cookie'] as string,/HttpOnly/);assert.match(start.headers['set-cookie'] as string,/SameSite=Lax/);
  const location=new URL(start.headers.location!),state=location.searchParams.get('state')!;
  globalThis.fetch=(async(url:any)=>String(url).endsWith('/token')?Response.json({access_token:'token'}):Response.json({sub:'route-subject',email:'route@example.com',email_verified:true,name:'Route user'})) as typeof fetch;
  const callback=await app.inject({url:`/auth/oauth/google/callback?code=one-time-code&state=${state}`,headers:{cookie:`vst_oauth=${state}`}});assert.equal(callback.statusCode,302);assert.equal(callback.headers.location,'/');const cookies=callback.headers['set-cookie'] as unknown as string[];assert.ok(cookies.some(v=>v.startsWith('vst_oauth=;')));const session=cookies.find(v=>v.startsWith('vst_session='))!;assert.match(session,/HttpOnly/);assert.match(session,/SameSite=Lax/);assert.equal((await authenticate(pool,session.split(';')[0].split('=')[1]))?.email,'route@example.com');
  const replay=await app.inject({url:`/auth/oauth/google/callback?code=one-time-code&state=${state}`,headers:{cookie:`vst_oauth=${state}`}});assert.equal(replay.headers.location,'/?authError=signin_failed');
  const cross=await app.inject({url:'/auth/oauth/google/start',headers:{'sec-fetch-site':'cross-site'}});assert.equal(cross.statusCode,403);
 }finally{globalThis.fetch=oldFetch;if(oldId===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=oldId;if(oldSecret===undefined)delete process.env.GOOGLE_CLIENT_SECRET;else process.env.GOOGLE_CLIENT_SECRET=oldSecret;await app.close();}
});
