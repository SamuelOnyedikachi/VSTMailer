import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { digest } from '../auth.js';
import { AppError } from '../errors.js';
import { transaction } from '../db.js';
import { creditTransition, lockDelivery } from '../worker-service.js';
import type { Config } from '../config.js';
function authorized(actual: unknown, expected: string) { if (!expected || typeof actual !== 'string' || !timingSafeEqual(Buffer.from(digest(actual)), Buffer.from(digest(expected))))
    throw new AppError(401, 'Invalid service credential.'); }
export async function publicRoutes(app: FastifyInstance, pool: pg.Pool, config: Config) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))));
    if (config.mode === 'local')
        app.get('/local/inbox', async () => ({ items: (await pool.query('SELECT id,recipient,sender,subject,text_body,created_at FROM local_inbox ORDER BY created_at DESC LIMIT 100')).rows }));
    app.get('/unsubscribe/:token', async (req) => { const { token } = z.object({ token: z.string().length(64) }).parse(req.params); const m = (await pool.query("SELECT id FROM messages WHERE unsubscribe_token=$1 AND kind='marketing'", [token])).rows[0]; if (!m)
        throw new AppError(404, 'Unsubscribe link not found.'); return { message: 'Confirm to stop marketing emails from this sender.' }; });
    app.post('/unsubscribe/:token', async (req) => {
        const { token } = z.object({ token: z.string().length(64) }).parse(req.params);
        const initial = (await pool.query("SELECT org_id FROM messages WHERE unsubscribe_token=$1 AND kind='marketing'", [token])).rows[0];
        if (!initial)
            throw new AppError(404, 'Unsubscribe link not found.');
        await transaction(pool, async (c) => { await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [initial.org_id]); const m = (await c.query('SELECT * FROM messages WHERE unsubscribe_token=$1', [token])).rows[0]; await c.query("INSERT INTO suppressions(org_id,email,reason) VALUES($1,$2,'unsubscribed') ON CONFLICT DO NOTHING", [m.org_id, m.recipient]); await c.query('UPDATE contacts SET consent=false WHERE org_id=$1 AND email=$2', [m.org_id, m.recipient]); });
        return { message: 'You have been unsubscribed.' };
    });
    // This is an authenticated normalization boundary for a private Postal event gateway,
    // not a claim that arbitrary raw Postal webhooks are authenticated by this application.
    app.post('/internal/delivery-events', async (req) => {
        authorized(req.headers['x-vst-ingress-token'], config.ingressToken);
        const d = z.object({ eventId: z.string().min(1).max(200), messageId: z.uuid(), kind: z.enum(['delivered_to_server', 'deferred', 'bounced', 'complaint']), detail: z.string().max(1000).default('') }).parse(req.body);
        await transaction(pool, async (c) => {
            const locked = await lockDelivery(c, d.messageId);
            const m = locked?.message;
            if (!m)
                throw new AppError(404, 'Message not found.');
            const inserted = await c.query('INSERT INTO events(id,org_id,message_id,kind,detail,external_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(external_id) DO NOTHING RETURNING id', [randomUUID(), m.org_id, m.id, d.kind, d.detail, d.eventId]);
            if (!inserted.rowCount)
                return;
            if (d.kind === 'complaint' || d.kind === 'bounced')
                await c.query('INSERT INTO suppressions(org_id,email,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [m.org_id, m.recipient, d.kind]);
            if (['delivered_to_server', 'bounced'].includes(d.kind)) {
                await creditTransition(c, m, 'consume');
                await c.query('UPDATE messages SET status=$2,updated_at=now() WHERE id=$1 AND status<>\'bounced\'', [m.id, d.kind]);
                await c.query("UPDATE outbox SET state='done' WHERE message_id=$1", [m.id]);
            }
            else if (d.kind === 'deferred')
                await c.query("UPDATE messages SET status='deferred' WHERE id=$1 AND status IN ('transport_queued','deferred')", [m.id]);
        });
        return { message: 'Event recorded.' };
    });
    app.post('/operator/workspaces/:id/approve', async (req) => { authorized(req.headers['x-vst-operator-token'], config.operatorToken); const { id } = z.object({ id: z.uuid() }).parse(req.params); const { confirmProvisioned } = z.object({ confirmProvisioned: z.literal(true) }).parse(req.body); await transaction(pool, async (c) => { const org = await c.query("UPDATE organizations SET status='active' WHERE id=$1 RETURNING id", [id]); if (!org.rowCount)
        throw new AppError(404, 'Workspace not found.'); await c.query("UPDATE identities SET status='active' WHERE org_id=$1 AND kind='hosted' AND deleted_at IS NULL", [id]); await c.query("INSERT INTO audit_log(id,org_id,action,detail) VALUES($1,$2,'operator_approved',$3)", [randomUUID(), id, String(confirmProvisioned)]); }); return { message: 'Provisioned workspace approved.' }; });
    app.post('/operator/workspaces/:id/suspend', async (req) => { authorized(req.headers['x-vst-operator-token'], config.operatorToken); const { id } = z.object({ id: z.uuid() }).parse(req.params); await transaction(pool, async (c) => { await c.query("UPDATE organizations SET status='suspended' WHERE id=$1", [id]); await c.query("INSERT INTO audit_log(id,org_id,action) VALUES($1,$2,'operator_suspended')", [randomUUID(), id]); }); return { message: 'New acceptance and dispatch paused. Already handed-off Postal messages require a transport queue hold.' }; });
    app.post('/operator/messages/:id/resolve', async (req) => { authorized(req.headers['x-vst-operator-token'], config.operatorToken); const { id } = z.object({ id: z.uuid() }).parse(req.params); const d = z.object({ outcome: z.enum(['accepted', 'not_accepted']), evidence: z.string().min(10).max(1000) }).parse(req.body); await transaction(pool, async (c) => { const m = (await c.query("SELECT * FROM messages WHERE id=$1 AND status='submission_unknown' FOR UPDATE", [id])).rows[0]; if (!m)
        throw new AppError(409, 'Message is not awaiting reconciliation.'); if (d.outcome === 'accepted')
        await creditTransition(c, m, 'consume'); await c.query('UPDATE messages SET status=$2 WHERE id=$1', [id, d.outcome === 'accepted' ? 'transport_queued' : 'accepted']); await c.query('UPDATE outbox SET state=$2,available_at=now() WHERE message_id=$1', [id, d.outcome === 'accepted' ? 'done' : 'pending']); await c.query("INSERT INTO audit_log(id,org_id,action,detail) VALUES($1,$2,'operator_reconciled',$3)", [randomUUID(), m.org_id, `${id}: ${d.outcome}: ${d.evidence}`]); }); return { message: 'Reconciliation recorded.' }; });
}
