import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, reset, account } from './helpers.js';
import { register, verifyEmail } from '../src/auth.js';
import { queueCampaign, prepareCampaignBatch } from '../src/campaigns.js';
beforeEach(reset);
after(() => pool.end());
test('a durable 250-contact campaign fans out in bounded batches without duplicate credits', async () => {
    const a = await register(pool, account());
    await verifyEmail(pool, a.verificationToken);
    const identity = (await pool.query('SELECT id FROM identities')).rows[0];
    const id = randomUUID();
    await pool.query("INSERT INTO campaigns(id,org_id,name,identity_id,subject,text_body) VALUES($1,$2,'Launch',$3,'Hello','Permission-based update')", [id, a.orgId, identity.id]);
    for (let i = 0; i < 250; i++)
        await pool.query("INSERT INTO contacts(id,org_id,email,consent,consent_source) VALUES($1,$2,$3,true,'test opt-in')", [randomUUID(), a.orgId, `reader${i}@example.com`]);
    await queueCampaign(pool, a.orgId, id);
    assert.equal(await prepareCampaignBatch(pool), true);
    assert.equal(Number((await pool.query('SELECT count(*) FROM messages')).rows[0].count), 100);
    await prepareCampaignBatch(pool);
    await prepareCampaignBatch(pool);
    await prepareCampaignBatch(pool);
    assert.equal(Number((await pool.query('SELECT count(*) FROM messages')).rows[0].count), 250);
    assert.equal((await pool.query('SELECT reserved FROM cycles')).rows[0].reserved, 250);
    await queueCampaign(pool, a.orgId, id);
    await prepareCampaignBatch(pool);
    assert.equal(Number((await pool.query('SELECT count(*) FROM messages')).rows[0].count), 250);
});
