import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { beginOAuth, finishOAuth, providerConfig } from '../oauth.js';
import { authenticate,digest } from '../auth.js';
import type { Config } from '../config.js';
export async function oauthRoutes(app:FastifyInstance,pool:pg.Pool,config:Config){
 const provider=z.enum(['google','github','gitlab']);
 app.get('/auth/providers',async()=>({items:provider.options.map(id=>{try{providerConfig(id);return {id,enabled:true};}catch{return {id,enabled:false};}})}));
 app.get('/auth/oauth/:provider/start',async(req,reply)=>{
  const id=provider.parse((req.params as any).provider),link=(req.query as any).intent==='link';
  if(req.headers['sec-fetch-site']==='cross-site')return reply.code(403).send({error:'Start sign-in from VSTMailer.'});
  const current=link?await authenticate(pool,req.cookies.vst_session||''):null;
  if(link&&!current)return reply.code(401).send({error:'Sign in before linking an account.'});
  const start=await beginOAuth(pool,id,current?.userId||null);
  reply.setCookie('vst_oauth',start.state,{path:'/api/auth/oauth',httpOnly:true,sameSite:'lax',secure:config.mode==='production',maxAge:600});return reply.redirect(start.url);
 });
 app.get('/auth/oauth/:provider/callback',async(req,reply)=>{
  const id=provider.parse((req.params as any).provider),query=req.query as any;
  reply.clearCookie('vst_oauth',{path:'/api/auth/oauth'});
  try{
   if(query.error)throw new Error('Provider authorization was cancelled.');
   const {state,code}=z.object({state:z.string().min(1).max(256),code:z.string().min(1).max(4096)}).parse(query);
   const current=await authenticate(pool,req.cookies.vst_session||'');
   const result=await finishOAuth(pool,{provider:id,state,code,cookieState:req.cookies.vst_oauth||'',currentUserId:current?.userId});
   if(result.token){reply.setCookie('vst_session',result.token,{httpOnly:true,sameSite:'lax',secure:config.mode==='production',path:'/',maxAge:604800});await pool.query('UPDATE sessions SET ip_address=$2,user_agent=$3 WHERE token_hash=$1',[digest(result.token),req.ip,String(req.headers['user-agent']||'').slice(0,512)]);}
   return reply.redirect(result.linked?'/?view=security&linked=1':'/');
  }catch(e){const code=(e as any).statusCode===409?'account_exists':query.error?'cancelled':'signin_failed';return reply.redirect(`/?authError=${code}`);}
 });
}
