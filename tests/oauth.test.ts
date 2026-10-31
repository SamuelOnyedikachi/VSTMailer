import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pool,reset,account} from './helpers.js';
import {register,verifyEmail,authenticate} from '../src/auth.js';
import {beginOAuth,finishOAuth,type Provider} from '../src/oauth.js';
beforeEach(reset);after(()=>pool.end());
const env={GOOGLE_CLIENT_ID:'test-google',GOOGLE_CLIENT_SECRET:'secret',GITHUB_CLIENT_ID:'test-github',GITHUB_CLIENT_SECRET:'secret',GITLAB_CLIENT_ID:'test-gitlab',GITLAB_CLIENT_SECRET:'secret',APP_URL:'http://localhost:3000'};
function providerServer(provider:Provider,challenge:string,email='social@example.com',verified=true):typeof fetch{
 return (async(url:any,init:any)=>{
  const address=String(url);
  if(address.endsWith('/token')||address.endsWith('/access_token')){
   const fields=new URLSearchParams(init.body);const actual=createHash('sha256').update(fields.get('code_verifier')||'').digest('base64url');
   return Response.json(actual===challenge?{access_token:'provider-token',token_type:'Bearer'}:{error:'invalid_grant'},{status:actual===challenge?200:400});
  }
  if(init.headers.Authorization!=='Bearer provider-token')return Response.json({error:'unauthorized'},{status:401});
  if(address.includes('/user/emails'))return Response.json([{email,primary:true,verified}]);
  if(provider==='github')return Response.json({id:771,name:'Social customer',login:'social',email:null});
  return Response.json({sub:'subject-771',email,email_verified:verified,name:'Social customer'});
 }) as typeof fetch;
}
for(const provider of ['google','github','gitlab'] as const)test(`${provider} creates a verified account through browser-bound PKCE and issues a session`,async()=>{
 const start=await beginOAuth(pool,provider,null,env);const url=new URL(start.url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 const result=await finishOAuth(pool,{provider,state:start.state,cookieState:start.state,code:'valid-code'},providerServer(provider,url.searchParams.get('code_challenge')!),env);
 assert.equal(result.created,true);assert.ok(result.token);const session=await authenticate(pool,result.token);assert.equal(session?.email,'social@example.com');
 assert.equal((await pool.query('SELECT verified,password_hash FROM users')).rows[0].verified,true);assert.equal((await pool.query('SELECT password_hash FROM users')).rows[0].password_hash,null);
 await assert.rejects(()=>finishOAuth(pool,{provider,state:start.state,cookieState:start.state,code:'valid-code'},providerServer(provider,''),env),/expired|used|invalid/i);
});
test('state mismatch and expired flows cannot establish a social session',async()=>{
 const start=await beginOAuth(pool,'google',null,env);
 await assert.rejects(()=>finishOAuth(pool,{provider:'google',state:start.state,cookieState:'different',code:'code'},providerServer('google',''),env),/state|browser/i);
 await pool.query("UPDATE oauth_flows SET expires_at=now()-interval '1 minute'");
 await assert.rejects(()=>finishOAuth(pool,{provider:'google',state:start.state,cookieState:start.state,code:'code'},providerServer('google',''),env),/expired|invalid/i);
 assert.equal(Number((await pool.query('SELECT count(*) FROM sessions')).rows[0].count),0);
});
test('unverified provider email is rejected and existing email accounts are never silently linked',async()=>{
 let start=await beginOAuth(pool,'github',null,env);
 await assert.rejects(()=>finishOAuth(pool,{provider:'github',state:start.state,cookieState:start.state,code:'code'},providerServer('github',new URL(start.url).searchParams.get('code_challenge')!,'social@example.com',false),env),/verified/i);
 const old=await register(pool,account());await verifyEmail(pool,old.verificationToken);
 start=await beginOAuth(pool,'google',null,env);
 await assert.rejects(()=>finishOAuth(pool,{provider:'google',state:start.state,cookieState:start.state,code:'code'},providerServer('google',new URL(start.url).searchParams.get('code_challenge')!,'alice@example.com'),env),/sign in|link/i);
 assert.equal(Number((await pool.query('SELECT count(*) FROM oauth_identities')).rows[0].count),0);
});
test('explicit account linking requires the same signed-in user at callback',async()=>{
 const old=await register(pool,account());await verifyEmail(pool,old.verificationToken);
 let start=await beginOAuth(pool,'google',old.userId,env);
 await assert.rejects(()=>finishOAuth(pool,{provider:'google',state:start.state,cookieState:start.state,code:'code'},providerServer('google',new URL(start.url).searchParams.get('code_challenge')!),env),/sign|session/i);
 start=await beginOAuth(pool,'google',old.userId,env);
 const result=await finishOAuth(pool,{provider:'google',state:start.state,cookieState:start.state,code:'code',currentUserId:old.userId},providerServer('google',new URL(start.url).searchParams.get('code_challenge')!),env);
 assert.equal(result.linked,true);assert.equal(Number((await pool.query('SELECT count(*) FROM organizations')).rows[0].count),1);
});
test('unconfigured providers cannot start a misleading authentication flow',async()=>{await assert.rejects(()=>beginOAuth(pool,'google',null,{}),/configured|available/i);});
test('GitLab confirms a private verified email through the authenticated user API',async()=>{
 const start=await beginOAuth(pool,'gitlab',null,env),challenge=new URL(start.url).searchParams.get('code_challenge')!;
 const base=providerServer('gitlab',challenge);const fetcher=(async(url:any,init:any)=>String(url).endsWith('/api/v4/user')?Response.json({id:771,email:'private@example.com',confirmed_at:'2026-01-01T00:00:00Z',state:'active'}):String(url).endsWith('/userinfo')?Response.json({sub:'771',name:'Private GitLab user'}):base(url,init)) as typeof fetch;
 const result=await finishOAuth(pool,{provider:'gitlab',state:start.state,cookieState:start.state,code:'valid'},fetcher,env);assert.equal((await authenticate(pool,result.token!))?.email,'private@example.com');
});
