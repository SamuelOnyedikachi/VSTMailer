import {transaction} from '../db.js';
import {loadConfig} from '../config.js';
import {domainSetupRoutes} from './domain-setup.js';
import { diagnoseDomain } from '../domain-diagnostics.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { z } from 'zod';
import { sessionOnly, idOf } from './customer.js';
import { secret } from '../auth.js';
import { AppError } from '../errors.js';
export async function domainRoutes(app: FastifyInstance, pool: pg.Pool) {
    await domainSetupRoutes(app,pool);
    app.get('/identities', async (req) => ({ items: (await pool.query('SELECT * FROM identities WHERE org_id=$1 AND deleted_at IS NULL ORDER BY created_at', [req.principal.orgId])).rows }));
    app.post('/identities/hosted',async(req,reply)=>{sessionOnly(req);const d=z.object({localPart:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),label:z.string().trim().min(1).max(100)}).parse(req.body);const config=loadConfig();const org=(await pool.query('SELECT slug FROM organizations WHERE id=$1',[req.principal.orgId])).rows[0];const email=z.email().parse(`${d.localPart}@${org.slug}.${config.hostedDomain}`);const r=await pool.query("INSERT INTO identities(id,org_id,email,label,kind,status) VALUES($1,$2,$3,$4,'hosted',$5) RETURNING *",[randomUUID(),req.principal.orgId,email,d.label,config.mode==='local'?'active':'pending']);return reply.code(201).send(r.rows[0]);});
    app.delete('/identities/:id',async req=>{sessionOnly(req);await transaction(pool,async c=>{await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[req.principal.orgId]);const r=await c.query('UPDATE identities SET deleted_at=now() WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL RETURNING id',[idOf(req),req.principal.orgId]);if(!r.rowCount)throw new AppError(404,'Sending identity not found.');await c.query("INSERT INTO audit_log(id,org_id,action,detail) VALUES($1,$2,'identity_deleted',$3)",[randomUUID(),req.principal.orgId,idOf(req)]);});return {message:'Sender removed. New sending is disabled; queued messages will be suppressed and their reserved credits released by the worker. Mail already claimed or in flight may still complete and cannot be recalled. History is retained.'};});
    app.get('/domains', async (req) => ({ items: (await pool.query('SELECT * FROM domains WHERE org_id=$1 ORDER BY created_at DESC', [req.principal.orgId])).rows }));
    app.post('/domains', async (req, reply) => { sessionOnly(req); const { name } = z.object({ name: z.string().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/) }).parse(req.body); if (['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'live.com'].includes(name))
        throw new AppError(400, 'Use a domain you own. Personal provider domains cannot be verified.'); const r = await pool.query('INSERT INTO domains(id,org_id,name,verification_token) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(), req.principal.orgId, name, secret()]); return reply.code(201).send(r.rows[0]); });
    app.get('/domains/:id/diagnostics',async req=>{sessionOnly(req);const domain=(await pool.query('SELECT * FROM domains WHERE id=$1 AND org_id=$2',[idOf(req),req.principal.orgId])).rows[0];if(!domain)throw new AppError(404,'Domain not found.');return diagnoseDomain(domain);});
    app.post('/domains/:id/verify', async (req) => { sessionOnly(req); const d = (await pool.query('SELECT * FROM domains WHERE id=$1 AND org_id=$2', [idOf(req), req.principal.orgId])).rows[0]; if (!d)
        throw new AppError(404, 'Domain not found.'); let txt: string[][]; try {
        txt = await resolveTxt(`_vstmailer.${d.name}`);
    }
    catch {
        throw new AppError(400, 'Verification TXT record not found yet. Check DNS and retry.');
    } if (!txt.some(v => v.join('') === `vstmailer-verification=${d.verification_token}`))
        throw new AppError(400, 'Verification TXT value does not match.'); await pool.query("UPDATE domains SET status='ownership_verified' WHERE id=$1 AND status='pending'", [d.id]); return { message: 'Ownership verified. Operator DKIM and Postal provisioning is required before live sending.' }; });
    app.post('/senders',async(req,reply)=>{sessionOnly(req);const d=z.object({email:z.email().transform(v=>v.toLowerCase()),label:z.string().trim().min(1).max(100)}).parse(req.body);const [local,name]=d.email.split('@');if(['gmail.com','outlook.com','hotmail.com','yahoo.com','live.com'].includes(name))throw new AppError(400,'Personal provider addresses cannot be authenticated here. Use a hosted VST sender with your personal Reply-To.');let domain=(await pool.query('SELECT * FROM domains WHERE org_id=$1 AND name=$2',[req.principal.orgId,name])).rows[0];if(!domain)domain=(await pool.query('INSERT INTO domains(id,org_id,name,verification_token) VALUES($1,$2,$3,$4) RETURNING *',[randomUUID(),req.principal.orgId,name,secret()])).rows[0];const identity=(await pool.query("INSERT INTO identities(id,org_id,email,label,kind,status,domain_id) VALUES($1,$2,$3,$4,'custom','pending',$5) RETURNING *",[randomUUID(),req.principal.orgId,d.email,d.label,domain.id])).rows[0];return reply.code(201).send({identity,domain,message:'Sender added. Publish the domain verification record below, then complete VST signing provisioning. Existing mailbox hosting stays unchanged.'});});
    app.post('/identities', async (req, reply) => { sessionOnly(req); const b = z.object({ domainId: z.uuid(), localPart: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/), label: z.string().min(1).max(100) }).parse(req.body); if(b.localPart.endsWith('.')||b.localPart.includes('..'))throw new AppError(400,'Address names cannot end with a dot or contain consecutive dots.'); const d = (await pool.query('SELECT * FROM domains WHERE id=$1 AND org_id=$2', [b.domainId, req.principal.orgId])).rows[0]; if (!d)
        throw new AppError(404, 'Domain not found.'); const r = await pool.query("INSERT INTO identities(id,org_id,email,label,kind,status,domain_id) VALUES($1,$2,$3,$4,'custom','pending',$5) RETURNING *", [randomUUID(), req.principal.orgId, `${b.localPart}@${d.name}`, b.label, d.id]); return reply.code(201).send(r.rows[0]); });
}
