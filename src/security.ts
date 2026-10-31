import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { transaction } from './db.js';
import { AppError } from './errors.js';
export async function addNetwork(pool:pg.Pool,org:string,network:string,label:string){
 const [ip,mask,...extra]=network.split('/');if(!isIP(ip)||extra.length||(mask!==undefined&&(!/^\d+$/.test(mask)||Number(mask)>(isIP(ip)===4?32:128))))throw new AppError(400,'Enter a valid IP address or CIDR network.');
 return transaction(pool,async c=>{await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[org]);return (await c.query('INSERT INTO authorized_ips(id,org_id,network,label) VALUES($1,$2,network($3::inet)::cidr,$4) RETURNING *',[randomUUID(),org,network,label])).rows[0];});
}
export async function setIpPolicy(pool:pg.Pool,org:string,api:boolean,smtp:boolean){return transaction(pool,async c=>{await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[org]);if((api||smtp)&&!(await c.query('SELECT id FROM authorized_ips WHERE org_id=$1',[org])).rowCount)throw new AppError(400,'Authorize at least one network before enabling restrictions.');await c.query('INSERT INTO delivery_settings(org_id,enforce_api_ips,enforce_smtp_ips) VALUES($1,$2,$3) ON CONFLICT(org_id) DO UPDATE SET enforce_api_ips=$2,enforce_smtp_ips=$3',[org,api,smtp]);});}
export async function enforceSource(pool:pg.Pool,org:string,channel:'api'|'smtp',address:string){
 const policy=(await pool.query('SELECT enforce_api_ips,enforce_smtp_ips FROM delivery_settings WHERE org_id=$1',[org])).rows[0];if(!policy?.[`enforce_${channel}_ips`])return;
 const ip=address.toLowerCase().startsWith('::ffff:')&&isIP(address.slice(7))===4?address.slice(7):address;
 if(!isIP(ip))throw new AppError(403,'Sending source address is not authorized.');
 if((await pool.query('SELECT 1 FROM authorized_ips WHERE org_id=$1 AND $2::inet <<= network',[org,ip])).rowCount)return;
 await pool.query('INSERT INTO denied_ips(org_id,address,channel) VALUES($1,$2,$3) ON CONFLICT(org_id,address,channel) DO UPDATE SET attempts=denied_ips.attempts+1,last_seen=now()',[org,ip,channel]);throw new AppError(403,'Sending source address is not authorized.');
}
