import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { z } from 'zod';
import { sessionOnly, idOf } from './customer.js';
import { secret } from '../auth.js';
import { AppError } from '../errors.js';
export async function domainRoutes(app: FastifyInstance, pool: pg.Pool) {
    app.get('/identities', async (req) => ({ items: (await pool.query('SELECT * FROM identities WHERE org_id=$1 ORDER BY created_at', [req.principal.orgId])).rows }));
    app.get('/domains', async (req) => ({ items: (await pool.query('SELECT * FROM domains WHERE org_id=$1 ORDER BY created_at DESC', [req.principal.orgId])).rows }));
    app.post('/domains', async (req, reply) => { sessionOnly(req); const { name } = z.object({ name: z.string().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/) }).parse(req.body); if (['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'live.com'].includes(name))
        throw new AppError(400, 'Use a domain you own. Personal provider domains cannot be verified.'); const r = await pool.query('INSERT INTO domains(id,org_id,name,verification_token) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(), req.principal.orgId, name, secret()]); return reply.code(201).send(r.rows[0]); });
    app.post('/domains/:id/verify', async (req) => { sessionOnly(req); const d = (await pool.query('SELECT * FROM domains WHERE id=$1 AND org_id=$2', [idOf(req), req.principal.orgId])).rows[0]; if (!d)
        throw new AppError(404, 'Domain not found.'); let txt: string[][]; try {
        txt = await resolveTxt(`_vstmailer.${d.name}`);
    }
    catch {
        throw new AppError(400, 'Verification TXT record not found yet. Check DNS and retry.');
    } if (!txt.some(v => v.join('') === `vstmailer-verification=${d.verification_token}`))
        throw new AppError(400, 'Verification TXT value does not match.'); await pool.query("UPDATE domains SET status='ownership_verified' WHERE id=$1 AND status='pending'", [d.id]); return { message: 'Ownership verified. Operator DKIM and Postal provisioning is required before live sending.' }; });
    app.post('/identities', async (req, reply) => { sessionOnly(req); const b = z.object({ domainId: z.uuid(), localPart: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/), label: z.string().min(1).max(100) }).parse(req.body); const d = (await pool.query('SELECT * FROM domains WHERE id=$1 AND org_id=$2', [b.domainId, req.principal.orgId])).rows[0]; if (!d)
        throw new AppError(404, 'Domain not found.'); const r = await pool.query("INSERT INTO identities(id,org_id,email,label,kind,status,domain_id) VALUES($1,$2,$3,$4,'custom','pending',$5) RETURNING *", [randomUUID(), req.principal.orgId, `${b.localPart}@${d.name}`, b.label, d.id]); return reply.code(201).send(r.rows[0]); });
}
