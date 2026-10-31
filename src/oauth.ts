import type pg from 'pg';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { digest, secret } from './auth.js';
import { transaction } from './db.js';
import { AppError } from './errors.js';
import { provisionWorkspace } from './workspaces.js';
export type Provider = 'google' | 'github' | 'gitlab';
const endpoints = {
 google: {authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',user:'https://openidconnect.googleapis.com/v1/userinfo',scope:'openid email profile'},
 github: {authorize:'https://github.com/login/oauth/authorize',token:'https://github.com/login/oauth/access_token',user:'https://api.github.com/user',scope:'read:user user:email'},
 gitlab: {authorize:'https://gitlab.com/oauth/authorize',token:'https://gitlab.com/oauth/token',user:'https://gitlab.com/oauth/userinfo',scope:'openid email profile read_user'}
};
export function providerConfig(provider:Provider,env:NodeJS.ProcessEnv=process.env){
 const id=env[`${provider.toUpperCase()}_CLIENT_ID`], clientSecret=env[`${provider.toUpperCase()}_CLIENT_SECRET`];
 if(!id||!clientSecret)throw new AppError(503,'This sign-in provider is not configured.');
 return {...endpoints[provider],id,clientSecret,redirect:`${env.APP_URL||'http://localhost:3000'}/api/auth/oauth/${provider}/callback`};
}
export async function beginOAuth(pool:pg.Pool,provider:Provider,linkUserId:string|null=null,env:NodeJS.ProcessEnv=process.env){
 const config=providerConfig(provider,env),state=secret(),verifier=secret();
 await pool.query("INSERT INTO oauth_flows(state_hash,provider,verifier,link_user_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",[digest(state),provider,verifier,linkUserId]);
 const url=new URL(config.authorize);url.search=new URLSearchParams({client_id:config.id,redirect_uri:config.redirect,response_type:'code',scope:config.scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 return {state,url:url.toString()};
}
export async function finishOAuth(pool:pg.Pool,input:{provider:Provider;state:string;cookieState:string;code:string;currentUserId?:string},fetcher:typeof fetch=fetch,env:NodeJS.ProcessEnv=process.env):Promise<{token:string|null;created:boolean;linked:boolean}>{
 if(!input.state||!input.cookieState||!timingSafeEqual(Buffer.from(digest(input.state)),Buffer.from(digest(input.cookieState))))throw new AppError(400,'OAuth browser state is invalid.');
 const config=providerConfig(input.provider,env);
 const flow=(await pool.query('DELETE FROM oauth_flows WHERE state_hash=$1 AND provider=$2 AND expires_at>now() RETURNING *',[digest(input.state),input.provider])).rows[0];
 if(!flow)throw new AppError(400,'Authorization expired or was already used.');
 if(flow.link_user_id&&flow.link_user_id!==input.currentUserId)throw new AppError(401,'Sign in with the same session to link this account.');
 const response=await fetcher(config.token,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.id,client_secret:config.clientSecret,redirect_uri:config.redirect,code:input.code,code_verifier:flow.verifier}).toString()});
 const token=await response.json() as any;
 if(!response.ok||typeof token.access_token!=='string')throw new AppError(400,'Provider authorization failed.');
 async function read(url:string){const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/json'}});if(!r.ok)throw new AppError(400,'Provider identity could not be confirmed.');return r.json() as Promise<any>;}
 const user=await read(config.user);let subject=String(user.sub||user.id||''),email=user.email,verified=user.email_verified===true;
 if(input.provider==='github'){const emails=await read('https://api.github.com/user/emails?per_page=100');const primary=Array.isArray(emails)&&emails.find((e:any)=>e.primary&&e.verified);email=primary?.email;verified=!!primary;}
 if(input.provider==='gitlab'&&!verified){const privateUser=await read('https://gitlab.com/api/v4/user');if(String(privateUser.id)!==subject||!privateUser.confirmed_at||privateUser.state!=='active')throw new AppError(403,'A verified provider email is required.');email=privateUser.email;verified=true;}
 if(!subject||subject.length>255||!verified||!z.email().safeParse(email).success)throw new AppError(403,'A verified provider email is required.');
 email=email.toLowerCase();const name=String(user.name||user.login||email.split('@')[0]).slice(0,100);
 try{return await transaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${input.provider}:${subject}`]);
  const identity=(await c.query('SELECT user_id FROM oauth_identities WHERE provider=$1 AND subject=$2',[input.provider,subject])).rows[0];
  if(flow.link_user_id){if(identity&&identity.user_id!==flow.link_user_id)throw new AppError(409,'Provider account is already linked.');await c.query('INSERT INTO oauth_identities(provider,subject,user_id,email_at_link) VALUES($1,$2,$3,$4) ON CONFLICT(provider,subject) DO NOTHING',[input.provider,subject,flow.link_user_id,email]);return {token:null,created:false,linked:true};}
  let userId=identity?.user_id,created=false;
  if(!userId){if((await c.query('SELECT id FROM users WHERE email=$1',[email])).rowCount)throw new AppError(409,'Sign in to your existing account first, then link this provider in Security.');userId=randomUUID();await provisionWorkspace(c,{orgId:randomUUID(),userId,email,name,organization:`${name}'s workspace`,passwordHash:null,verified:true,verificationHash:null});await c.query('INSERT INTO oauth_identities(provider,subject,user_id,email_at_link) VALUES($1,$2,$3,$4)',[input.provider,subject,userId,email]);created=true;}
  const session=secret();await c.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[digest(session),userId]);return {token:session,created,linked:false};
 });}catch(e){if((e as any).code==='23505')throw new AppError(409,'Sign in first to manage linked accounts.');throw e;}
}
