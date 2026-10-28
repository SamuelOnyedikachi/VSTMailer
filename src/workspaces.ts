import type { DB } from './db.js';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';
export async function provisionWorkspace(c:DB,input:{orgId:string;userId:string;email:string;name:string;organization:string;passwordHash:string|null;verified:boolean;verificationHash:string|null}){
 const config=loadConfig();
 const slug=(input.organization.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'workspace')+'-'+input.orgId.slice(0,8);
 await c.query('INSERT INTO organizations(id,name,slug,status) VALUES($1,$2,$3,$4)',[input.orgId,input.organization,slug,config.mode==='local'?'active':'pending']);
 await c.query("INSERT INTO users(id,org_id,email,name,password_hash,verified,verification_hash,verification_expires) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7::text IS NULL THEN NULL ELSE now()+interval '1 day' END)",[input.userId,input.orgId,input.email,input.name,input.passwordHash,input.verified,input.verificationHash]);
 await c.query("INSERT INTO identities(id,org_id,email,label,kind,status) VALUES($1,$2,$3,$4,'hosted',$5)",[randomUUID(),input.orgId,`hello@${slug}.${config.hostedDomain}`,input.organization,config.mode==='local'?'active':'pending']);
 await c.query("INSERT INTO cycles(id,org_id,plan_slug,starts_at,ends_at,allowance) SELECT $1,$2,'launch',now(),now()+interval '1 month',allowance FROM plans WHERE slug='launch'",[randomUUID(),input.orgId]);
}
