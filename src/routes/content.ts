import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sessionOnly, idOf } from './customer.js';
import { AppError } from '../errors.js';
import { transaction } from '../db.js';
import { acceptMail } from '../mail.js';
import { queueCampaign } from '../campaigns.js';
export async function contentRoutes(app: FastifyInstance, pool: pg.Pool) {
    app.get('/contacts', async (req) => ({ items: (await pool.query('SELECT * FROM contacts WHERE org_id=$1 ORDER BY created_at DESC LIMIT 1000', [req.principal.orgId])).rows }));
    app.post('/contacts', async (req, reply) => { sessionOnly(req); const d = z.object({ email: z.email().transform(v => v.toLowerCase()), name: z.string().max(100).default(''), consent: z.boolean().default(false), consentSource: z.string().max(500).default('') }).parse(req.body); if (d.consent && !d.consentSource.trim())
        throw new AppError(400, 'Record where this person gave permission.'); const r = await pool.query('INSERT INTO contacts(id,org_id,email,name,consent,consent_source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(org_id,email) DO UPDATE SET name=excluded.name,consent=excluded.consent,consent_source=excluded.consent_source RETURNING *', [randomUUID(), req.principal.orgId, d.email, d.name, d.consent, d.consentSource]); return reply.code(201).send(r.rows[0]); });
    app.delete('/contacts/:id', async (req) => { sessionOnly(req); await pool.query('DELETE FROM contacts WHERE id=$1 AND org_id=$2', [idOf(req), req.principal.orgId]); return { message: 'Contact deleted.' }; });
    app.get('/suppressions', async (req) => ({ items: (await pool.query('SELECT email,reason,created_at FROM suppressions WHERE org_id=$1 ORDER BY created_at DESC LIMIT 1000', [req.principal.orgId])).rows }));
    app.post('/suppressions', async (req) => { sessionOnly(req); const d = z.object({ email: z.email().transform(v => v.toLowerCase()), reason: z.string().min(1).max(200) }).parse(req.body); await transaction(pool, async (c) => { await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [req.principal.orgId]); await c.query('INSERT INTO suppressions(org_id,email,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [req.principal.orgId, d.email, d.reason]); }); return { message: 'Recipient suppressed.' }; });
    app.get('/templates', async (req) => ({ items: (await pool.query('SELECT * FROM templates WHERE org_id=$1 ORDER BY updated_at DESC', [req.principal.orgId])).rows }));
    app.post('/templates', async (req, reply) => { sessionOnly(req); const d = z.object({ name: z.string().min(1).max(100), subject: z.string().min(1).max(998), html: z.string().max(100000).default(''), text: z.string().max(100000).default('') }).parse(req.body); const r = await pool.query('INSERT INTO templates(id,org_id,name,subject,html,text_body) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [randomUUID(), req.principal.orgId, d.name, d.subject, d.html, d.text]); return reply.code(201).send(r.rows[0]); });
    app.delete('/templates/:id', async (req) => { sessionOnly(req); await pool.query('DELETE FROM templates WHERE id=$1 AND org_id=$2', [idOf(req), req.principal.orgId]); return { message: 'Template deleted.' }; });
    app.get('/campaigns', async (req) => ({ items: (await pool.query('SELECT c.*,count(m.id)::int AS recipients FROM campaigns c LEFT JOIN messages m ON m.campaign_id=c.id WHERE c.org_id=$1 GROUP BY c.id ORDER BY c.created_at DESC', [req.principal.orgId])).rows }));
    app.post('/campaigns', async (req, reply) => { sessionOnly(req); const d = z.object({ name: z.string().min(1).max(100), identityId: z.uuid(), subject: z.string().min(1).max(998), text: z.string().max(100000).default(''), html: z.string().max(100000).default('') }).parse(req.body); if (!(await pool.query('SELECT id FROM identities WHERE id=$1 AND org_id=$2', [d.identityId, req.principal.orgId])).rowCount)
        throw new AppError(403, 'Invalid sending identity.'); const r = await pool.query('INSERT INTO campaigns(id,org_id,name,identity_id,subject,text_body,html) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [randomUUID(), req.principal.orgId, d.name, d.identityId, d.subject, d.text, d.html]); return reply.code(201).send(r.rows[0]); });
    app.post('/campaigns/:id/send', async (req, reply) => { sessionOnly(req); await queueCampaign(pool, req.principal.orgId, idOf(req)); return reply.code(202).send({ message: 'Campaign queued for durable batch preparation.' }); });
}
