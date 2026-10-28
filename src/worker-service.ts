import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { transaction, type DB } from './db.js';
export type Envelope = {
    id: string;
    orgId: string;
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo: string;
    kind: string;
    unsubscribeToken: string;
};
export type Transport = {
    send: (message: Envelope) => Promise<{
        id: string;
        state: 'delivered_local' | 'transport_queued';
    }>;
};
export class UnknownDelivery extends Error {
}
export class TransportRejected extends Error {
}
export async function lockDelivery(c: DB, id: string) {
    const queue = (await c.query('SELECT * FROM outbox WHERE message_id=$1 FOR UPDATE', [id])).rows[0];
    const initial = (await c.query('SELECT org_id FROM messages WHERE id=$1', [id])).rows[0];
    if (!initial)
        return null;
    await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [initial.org_id]);
    const message = (await c.query('SELECT * FROM messages WHERE id=$1 FOR UPDATE', [id])).rows[0];
    return { queue, message };
}
export async function creditTransition(c: DB, message: {
    id: string;
    org_id: string;
    cycle_id: string;
}, action: 'consume' | 'release') {
    const changed = await c.query("UPDATE messages SET credit_state=$2 WHERE id=$1 AND credit_state='reserved' RETURNING id", [message.id, action === 'consume' ? 'consumed' : 'released']);
    if (changed.rowCount) {
        await c.query(`UPDATE cycles SET reserved=reserved-1,consumed=consumed+$2 WHERE id=$1`, [message.cycle_id, action === 'consume' ? 1 : 0]);
        await c.query('INSERT INTO usage_ledger(id,org_id,cycle_id,message_id,action) VALUES($1,$2,$3,$4,$5)', [randomUUID(), message.org_id, message.cycle_id, message.id, action]);
    }
}
export async function dispatchOne(pool: pg.Pool, transport: Transport): Promise<boolean> {
    const job = await transaction(pool, async (c) => {
        // A crashed handoff is ambiguous. Holding it is safer than automatic resubmission.
        const stale = await c.query("UPDATE outbox SET state='unknown' WHERE state='claimed' AND claimed_at<now()-interval '5 minutes' RETURNING message_id");
        if (stale.rowCount)
            await c.query("UPDATE messages SET status='submission_unknown',updated_at=now() WHERE id=ANY($1::uuid[])", [stale.rows.map(r => r.message_id)]);
        const q = (await c.query(`SELECT q.id,q.message_id,q.attempts,q.org_id FROM outbox q JOIN organizations o ON o.id=q.org_id WHERE q.state='pending' AND q.available_at<=now() AND o.status='active' ORDER BY q.available_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1`)).rows[0];
        if (!q)
            return null;
        const org = (await c.query('SELECT status FROM organizations WHERE id=$1 FOR UPDATE', [q.org_id])).rows[0];
        if (org.status !== 'active')
            return null;
        const m = (await c.query('SELECT m.*,i.email AS sender FROM messages m JOIN identities i ON i.id=m.identity_id WHERE m.id=$1 FOR UPDATE OF m', [q.message_id])).rows[0];
        const suppression = await c.query('SELECT email FROM suppressions WHERE org_id=$1 AND email=$2', [m.org_id, m.recipient]);
        const consent = m.kind === 'marketing' ? await c.query('SELECT id FROM contacts WHERE org_id=$1 AND email=$2 AND consent=true', [m.org_id, m.recipient]) : null;
        if (suppression.rowCount || (consent && consent.rowCount === 0)) {
            await c.query("UPDATE messages SET status='suppressed',updated_at=now() WHERE id=$1", [m.id]);
            await creditTransition(c, m, 'release');
            await c.query("UPDATE outbox SET state='done' WHERE id=$1", [q.id]);
            return { skipped: true };
        }
        await c.query("UPDATE outbox SET state='claimed',claimed_at=now(),attempts=attempts+1 WHERE id=$1", [q.id]);
        await c.query("UPDATE messages SET status='submitting',updated_at=now() WHERE id=$1", [m.id]);
        return { skipped: false, q, m };
    });
    if (!job)
        return false;
    if (job.skipped)
        return true;
    const { m, q } = job as {
        m: any;
        q: {
            id: string;
            attempts: number;
        };
    };
    try {
        const result = await transport.send({ id: m.id, orgId: m.org_id, from: m.sender, to: m.recipient, subject: m.subject, text: m.text_body, html: m.html, replyTo: m.reply_to, kind: m.kind, unsubscribeToken: m.unsubscribe_token });
        await transaction(pool, async (c) => {
            await lockDelivery(c, m.id);
            await creditTransition(c, m, 'consume');
            await c.query("UPDATE messages SET status=CASE WHEN status IN ('delivered_to_server','bounced','suppressed','cancelled') THEN status ELSE $2 END,transport_id=$3,updated_at=now() WHERE id=$1", [m.id, result.state, result.id]);
            await c.query("UPDATE outbox SET state='done' WHERE id=$1", [q.id]);
            await c.query('INSERT INTO events(id,org_id,message_id,kind,detail) VALUES($1,$2,$3,$4,$5)', [randomUUID(), m.org_id, m.id, result.state, result.state === 'delivered_local' ? 'Accepted by the local SMTP test inbox' : 'Accepted by the self-hosted delivery engine']);
        });
    }
    catch (error) {
        await transaction(pool, async (c) => {
            const current = await lockDelivery(c, m.id);
            if (['delivered_to_server', 'bounced'].includes(current?.message.status)) {
                await c.query("UPDATE outbox SET state='done' WHERE id=$1", [q.id]);
                return;
            }
            // Only explicit transport rejection proves that retrying cannot duplicate an accepted message.
            const retry = error instanceof TransportRejected;
            const exhausted = retry && q.attempts + 1 >= 5;
            if (exhausted)
                await creditTransition(c, m, 'release');
            const state = exhausted ? 'failed' : retry ? 'deferred' : 'submission_unknown';
            await c.query('UPDATE outbox SET state=$2,available_at=now()+interval \'1 minute\' WHERE id=$1', [q.id, exhausted ? 'done' : retry ? 'pending' : 'unknown']);
            await c.query('UPDATE messages SET status=$2,updated_at=now() WHERE id=$1', [m.id, state]);
            await c.query('INSERT INTO events(id,org_id,message_id,kind,detail) VALUES($1,$2,$3,$4,$5)', [randomUUID(), m.org_id, m.id, state, (error as Error).message.slice(0, 500)]);
        });
    }
    return true;
}
