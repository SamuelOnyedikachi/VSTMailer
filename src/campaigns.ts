import type pg from 'pg';
import { transaction } from './db.js';
import { AppError } from './errors.js';
import { acceptMail } from './mail.js';
export async function queueCampaign(pool: pg.Pool, orgId: string, id: string): Promise<void> {
    await transaction(pool, async (c) => {
        const campaign = (await c.query('SELECT * FROM campaigns WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, orgId])).rows[0];
        if (!campaign)
            throw new AppError(404, 'Campaign not found.');
        if (!['draft', 'quota_exhausted'].includes(campaign.status))
            return;
        if (campaign.status === 'draft') {
            const r = await c.query('INSERT INTO campaign_recipients(campaign_id,ordinal,email) SELECT $1,row_number() OVER(ORDER BY id),email FROM contacts WHERE org_id=$2 AND consent=true', [id, orgId]);
            if (!r.rowCount)
                throw new AppError(400, 'Add contacts with recorded consent first.');
        }
        await c.query("UPDATE campaigns SET status='queued',last_error=NULL WHERE id=$1", [id]);
    });
}
export async function prepareCampaignBatch(pool: pg.Pool): Promise<boolean> {
    const job = await transaction(pool, async (c) => {
        const campaign = (await c.query("SELECT * FROM campaigns WHERE status='queued' OR (status='preparing' AND lease_at<now()-interval '5 minutes') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
        if (!campaign)
            return null;
        const batch = await c.query('SELECT ordinal,email FROM campaign_recipients WHERE campaign_id=$1 AND ordinal>$2 ORDER BY ordinal LIMIT 100', [campaign.id, campaign.batch_cursor]);
        if (!batch.rowCount) {
            await c.query("UPDATE campaigns SET status='accepted' WHERE id=$1", [campaign.id]);
            return { complete: true };
        }
        await c.query("UPDATE campaigns SET status='preparing',lease_at=now() WHERE id=$1", [campaign.id]);
        return { complete: false, campaign, batch: batch.rows };
    });
    if (!job)
        return false;
    if (job.complete)
        return true;
    const { campaign: c, batch } = job as {
        campaign: any;
        batch: {
            email: string;
            ordinal: number;
        }[];
    };
    try {
        await acceptMail(pool, c.org_id, { identityId: c.identity_id, to: batch.map(r => r.email), subject: c.subject, text: c.text_body, html: c.html, kind: 'marketing', campaignId: c.id }, `campaign:${c.id}:after:${c.batch_cursor}`);
        await pool.query("UPDATE campaigns SET batch_cursor=GREATEST(batch_cursor,$2),status='queued',lease_at=NULL WHERE id=$1", [c.id, batch.at(-1)!.ordinal]);
    }
    catch (e) {
        await pool.query("UPDATE campaigns SET status=$2,last_error=$3,lease_at=NULL WHERE id=$1", [c.id, e instanceof AppError && e.statusCode === 402 ? 'quota_exhausted' : 'blocked', (e as Error).message.slice(0, 500)]);
    }
    return true;
}
