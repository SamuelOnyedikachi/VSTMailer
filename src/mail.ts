import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction } from './db.js';
import { digest, secret } from './auth.js';
import { AppError } from './errors.js';
export type MailInput = {
    identityId: string;
    to: string[];
    subject: string;
    text?: string;
    html?: string;
    kind?: 'transactional' | 'marketing';
    scheduledAt?: string;
    campaignId?: string;
    tags?: string[];
};
export type AcceptResult = {
    ids: string[];
    suppressed: string[];
};
const schema = z.object({ identityId: z.uuid(), to: z.array(z.email().transform(v => v.toLowerCase())).min(1).max(100), subject: z.string().min(1).max(998).refine(s => !/[\r\n]/.test(s)), text: z.string().max(5 * 1024 * 1024).default(''), html: z.string().max(5 * 1024 * 1024).default(''), kind: z.enum(['transactional', 'marketing']).default('transactional'), scheduledAt: z.iso.datetime({ offset: true }).optional(), campaignId: z.uuid().optional(), tags: z.array(z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N}_. -]+$/u)).max(10).optional() }).strict();
export async function acceptMail(pool: pg.Pool, orgId: string, input: MailInput, key: string): Promise<AcceptResult> {
    const data = schema.parse(input);
    z.string().min(1).max(256).parse(key);
    if (!data.text.trim() && !data.html.trim())
        throw new AppError(400, 'Message content is required.');
    if (Buffer.byteLength(data.text) + Buffer.byteLength(data.html) > 5 * 1024 * 1024)
        throw new AppError(413, 'Message content exceeds 5 MiB.');
    const requestHash = digest(JSON.stringify(data));
    return transaction(pool, async (c) => {
        const org = (await c.query('SELECT * FROM organizations WHERE id=$1 FOR UPDATE', [orgId])).rows[0];
        if (!org)
            throw new AppError(404, 'Workspace not found.');
        const previous = (await c.query('SELECT * FROM send_requests WHERE org_id=$1 AND key=$2', [orgId, key])).rows[0];
        if (previous) {
            if (previous.request_hash !== requestHash)
                throw new AppError(409, 'Idempotency key conflicts with a different payload.');
            return previous.result as AcceptResult;
        }
        if (org.status !== 'active')
            throw new AppError(403, 'This workspace is pending approval or suspended.');
        const identity = (await c.query("SELECT * FROM identities WHERE id=$1 AND org_id=$2 AND status='active' AND deleted_at IS NULL", [data.identityId, orgId])).rows[0];
        if (!identity)
            throw new AppError(403, 'Sending identity is not active or does not belong to this workspace.');
        const owner = (await c.query('SELECT email FROM users WHERE org_id=$1 AND verified ORDER BY created_at LIMIT 1', [orgId])).rows[0];
        if (!owner)
            throw new AppError(403, 'A verified account email is required.');
        const cycle = (await c.query('SELECT * FROM cycles WHERE org_id=$1 AND starts_at<=now() AND ends_at>now() ORDER BY starts_at DESC LIMIT 1 FOR UPDATE', [orgId])).rows[0];
        if (!cycle)
            throw new AppError(402, 'No active billing cycle. Renew your subscription.');
        if (data.campaignId && !(await c.query('SELECT id FROM campaigns WHERE id=$1 AND org_id=$2', [data.campaignId, orgId])).rowCount)
            throw new AppError(404, 'Campaign not found.');
        const recipients = [...new Set(data.to)];
        const suppressed = (await c.query('SELECT email FROM suppressions WHERE org_id=$1 AND email=ANY($2::text[])', [orgId, recipients])).rows.map(r => r.email as string);
        const blocks=(await c.query('SELECT domain FROM blocked_domains WHERE org_id=$1',[orgId])).rows.map(r=>r.domain as string);
        for(const email of recipients){const domain=email.split('@')[1];if(blocks.some(b=>domain===b||domain.endsWith('.'+b))&&!suppressed.includes(email))suppressed.push(email);}
        let accepted = recipients.filter(e => !suppressed.includes(e));
        if (data.kind === 'marketing' && accepted.length) {
            const consent = await c.query('SELECT email FROM contacts WHERE org_id=$1 AND consent=true AND email=ANY($2::text[])', [orgId, accepted]);
            if (consent.rowCount !== accepted.length) {
                if (!data.campaignId)
                    throw new AppError(400, 'Marketing recipients must have recorded consent in Contacts.');
                const allowed = new Set(consent.rows.map(r => r.email));
                suppressed.push(...accepted.filter(e => !allowed.has(e)));
                accepted = accepted.filter(e => allowed.has(e));
            }
        }
        const reservation = await c.query('UPDATE cycles SET reserved=reserved+$2 WHERE id=$1 AND reserved+consumed+$2<=allowance RETURNING id', [cycle.id, accepted.length]);
        if (!reservation.rowCount)
            throw new AppError(402, 'Monthly email allowance exceeded. No recipients from this request were queued.', 'QUOTA_EXCEEDED');
        const ids: string[] = [];
        for (const recipient of accepted) {
            const id = randomUUID();
            ids.push(id);
            await c.query(`INSERT INTO messages(id,org_id,cycle_id,identity_id,campaign_id,recipient,subject,html,text_body,reply_to,kind,scheduled_at,unsubscribe_token) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz,now()),$13)`, [id, orgId, cycle.id, identity.id, data.campaignId || null, recipient, data.subject, data.html, data.text, identity.kind === 'custom' ? identity.email : owner.email, data.kind, data.scheduledAt || null, secret()]);
            if(data.tags?.length) await c.query('UPDATE messages SET tags=$2 WHERE id=$1',[id,[...new Set(data.tags)]]);
            await c.query('INSERT INTO outbox(id,message_id,org_id,available_at) VALUES($1,$2,$3,COALESCE($4::timestamptz,now()))', [randomUUID(), id, orgId, data.scheduledAt || null]);
            await c.query("INSERT INTO usage_ledger(id,org_id,cycle_id,message_id,action) VALUES($1,$2,$3,$4,'reserve')", [randomUUID(), orgId, cycle.id, id]);
            await c.query("INSERT INTO events(id,org_id,message_id,kind,detail) VALUES($1,$2,$3,'accepted','Recipient credit reserved')", [randomUUID(), orgId, id]);
        }
        const result = { ids, suppressed };
        await c.query('INSERT INTO send_requests(org_id,key,request_hash,result) VALUES($1,$2,$3,$4)', [orgId, key, requestHash, JSON.stringify(result)]);
        return result;
    });
}
