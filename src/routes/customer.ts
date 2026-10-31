import {isFounder} from './admin.js';
import { controlRoutes } from './controls.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { digest, secret } from '../auth.js';
import { acceptMail } from '../mail.js';
import { AppError } from '../errors.js';
import { transaction } from '../db.js';
import type { Config } from '../config.js';
import { contentRoutes } from './content.js';
import { domainRoutes } from './domains.js';
export const sessionOnly = (req: FastifyRequest) => { if (req.principal.kind !== 'session')
    throw new AppError(403, 'Sign in to manage workspace settings.'); };
export const idOf = (req: FastifyRequest) => z.object({ id: z.uuid() }).parse(req.params).id;
export async function customerRoutes(app: FastifyInstance, pool: pg.Pool, config: Config) {
    await controlRoutes(app,pool);
    app.get('/me', async (req) => ({ ...req.principal, founder:isFounder(req.principal), mode: config.mode, transport: config.transport }));
    app.get('/overview', async (req) => {
        const org = req.principal.orgId;
        const [cycle, stats, daily, recent, senders, contacts] = await Promise.all([
            pool.query('SELECT c.*,p.name AS plan_name FROM cycles c JOIN plans p ON p.slug=c.plan_slug WHERE org_id=$1 ORDER BY starts_at DESC LIMIT 1', [org]),
            pool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status IN ('delivered_local','delivered_to_server'))::int AS delivered,count(*) FILTER(WHERE status IN ('accepted','submitting','deferred','transport_queued'))::int AS queued,count(*) FILTER(WHERE status IN ('bounced','submission_unknown'))::int AS attention FROM messages WHERE org_id=$1`, [org]),
            pool.query("SELECT date_trunc('day',created_at) AS day,count(*)::int AS count FROM messages WHERE org_id=$1 AND created_at>now()-interval '14 days' GROUP BY 1 ORDER BY 1", [org]),
            pool.query('SELECT id,recipient,subject,status,created_at FROM messages WHERE org_id=$1 ORDER BY created_at DESC LIMIT 6', [org]),
            pool.query("SELECT count(*)::int AS count FROM identities WHERE org_id=$1 AND status='active'", [org]), pool.query('SELECT count(*)::int AS count FROM contacts WHERE org_id=$1', [org])
        ]);
        return { cycle: cycle.rows[0], stats: stats.rows[0], daily: daily.rows, recent: recent.rows, senders: senders.rows[0].count, contacts: contacts.rows[0].count };
    });
    app.get('/messages', async (req) => {
        const query = z.object({ q: z.string().max(200).default(''), page: z.coerce.number().int().min(0).max(100000).default(0) }).parse(req.query);
        const rows = await pool.query('SELECT id,recipient,subject,status,kind,created_at FROM messages WHERE org_id=$1 AND (recipient ILIKE $2 OR subject ILIKE $2) ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $3', [req.principal.orgId, `%${query.q}%`, query.page * 50]);
        return { items: rows.rows, page: query.page, hasMore: rows.rowCount === 50 };
    });
    app.get('/messages/:id', async (req) => { const id = idOf(req); const r = await pool.query('SELECT m.*,i.email AS sender FROM messages m JOIN identities i ON i.id=m.identity_id WHERE m.id=$1 AND m.org_id=$2', [id, req.principal.orgId]); if (!r.rowCount)
        throw new AppError(404, 'Message not found.'); const events = await pool.query('SELECT kind,detail,created_at FROM events WHERE message_id=$1 AND org_id=$2 ORDER BY created_at', [id, req.principal.orgId]); return { ...r.rows[0], events: events.rows }; });
    app.post('/emails', async (req, reply) => reply.code(202).send(await acceptMail(pool, req.principal.orgId, req.body as any, z.string().min(1).max(256).parse(req.headers['idempotency-key']))));
    app.get('/keys', async (req) => { sessionOnly(req); return { items: (await pool.query('SELECT id,name,prefix,created_at,revoked_at,expires_at,last_used_at FROM api_keys WHERE org_id=$1 ORDER BY created_at DESC', [req.principal.orgId])).rows }; });
    app.post('/keys', async (req, reply) => { sessionOnly(req); const { name,expiresAt } = z.object({ name: z.string().trim().min(1).max(100),expiresAt:z.iso.datetime({offset:true}).optional() }).parse(req.body); if(expiresAt&&new Date(expiresAt).getTime()<=Date.now())throw new AppError(400,'Expiry must be in the future.'); const token = `vst_${secret()}`; const r = await pool.query('INSERT INTO api_keys(id,org_id,name,token_hash,prefix,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,prefix,expires_at', [randomUUID(), req.principal.orgId, name, digest(token), token.slice(0, 12),expiresAt||null]); return reply.code(201).send({ ...r.rows[0], token }); });
    app.delete('/keys/:id', async (req) => { sessionOnly(req); const r = await pool.query('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND org_id=$2 RETURNING id', [idOf(req), req.principal.orgId]); if (!r.rowCount)
        throw new AppError(404, 'Key not found.'); return { message: 'Key revoked.' }; });
    app.get('/plans', async (req) => { sessionOnly(req); return { items: (await pool.query('SELECT * FROM plans ORDER BY allowance')).rows, billingConfigured: false }; });
    if (config.mode === 'local')
        app.post('/local/plan', async (req) => {
            sessionOnly(req);
            const { plan } = z.object({ plan: z.string() }).parse(req.body);
            const target = (await pool.query('SELECT * FROM plans WHERE slug=$1', [plan])).rows[0];
            if (!target)
                throw new AppError(400, 'Unknown plan.');
            await transaction(pool, async (c) => { await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [req.principal.orgId]); const cycle = (await c.query('SELECT * FROM cycles WHERE org_id=$1 ORDER BY starts_at DESC LIMIT 1 FOR UPDATE', [req.principal.orgId])).rows[0]; if (cycle.reserved + cycle.consumed > target.allowance)
                throw new AppError(409, 'Current usage exceeds that plan allowance.'); await c.query('UPDATE cycles SET plan_slug=$2,allowance=$3 WHERE id=$1', [cycle.id, plan, target.allowance]); await c.query("INSERT INTO audit_log(id,org_id,action,detail) VALUES($1,$2,'local_plan_simulation',$3)", [randomUUID(), req.principal.orgId, plan]); });
            return { message: 'Local test allowance updated. No payment was taken.' };
        });
    await contentRoutes(app, pool);
    await domainRoutes(app, pool);
}
