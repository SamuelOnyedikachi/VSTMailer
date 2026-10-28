import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, reset, account } from './helpers.js';
import { register, verifyEmail } from '../src/auth.js';
import { acceptMail } from '../src/mail.js';
import { dispatchOne, UnknownDelivery, TransportRejected, type Transport } from '../src/worker-service.js';
beforeEach(reset);
after(() => pool.end());
async function queued() { const a = await register(pool, account()); await verifyEmail(pool, a.verificationToken); const identity = (await pool.query('SELECT id FROM identities')).rows[0]; const result = await acceptMail(pool, a.orgId, { identityId: identity.id, to: ['reader@example.com'], subject: 'Hello', text: 'Test' }, 'test'); return { orgId: a.orgId, id: result.ids[0] }; }
const success: Transport = { send: async (m) => ({ id: `smtp-${m.id}`, state: 'delivered_local' }) };
test('accepted work survives a new worker and consumes its reservation once', async () => {
    await queued();
    assert.equal(await dispatchOne(pool, success), true);
    assert.equal(await dispatchOne(pool, success), false);
    assert.equal((await pool.query('SELECT status,credit_state FROM messages')).rows[0].status, 'delivered_local');
    assert.deepEqual((await pool.query('SELECT reserved,consumed FROM cycles')).rows[0], { reserved: 0, consumed: 1 });
});
test('suppression after acceptance releases reservation and prevents transport', async () => {
    const a = await queued();
    await pool.query("INSERT INTO suppressions VALUES($1,'reader@example.com','unsubscribed',now())", [a.orgId]);
    await dispatchOne(pool, { send: async () => { throw new Error('Must not reach transport'); } });
    assert.equal((await pool.query('SELECT status FROM messages')).rows[0].status, 'suppressed');
    assert.deepEqual((await pool.query('SELECT reserved,consumed FROM cycles')).rows[0], { reserved: 0, consumed: 0 });
    assert.equal(await dispatchOne(pool, success), false);
});
test('uncertain delivery is held for reconciliation and never blindly resubmitted', async () => {
    await queued();
    await dispatchOne(pool, { send: async () => { throw new UnknownDelivery('Lost response after submission'); } });
    assert.equal((await pool.query('SELECT status FROM messages')).rows[0].status, 'submission_unknown');
    assert.equal(await dispatchOne(pool, success), false);
    assert.equal((await pool.query('SELECT reserved FROM cycles')).rows[0].reserved, 1);
});
test('five definite transport rejections stop retries and release the held credit', async () => {
    await queued();
    for (let i = 0; i < 5; i++) {
        await pool.query('UPDATE outbox SET available_at=now()');
        await dispatchOne(pool, { send: async () => { throw new TransportRejected('Explicit rejection'); } });
    }
    assert.equal((await pool.query('SELECT status FROM messages')).rows[0].status, 'failed');
    assert.deepEqual((await pool.query('SELECT reserved,consumed FROM cycles')).rows[0], { reserved: 0, consumed: 0 });
    assert.equal(await dispatchOne(pool, success), false);
});
test('an early final delivery event is not demoted by a later transport acknowledgement', async () => {
    const a = await queued();
    await dispatchOne(pool, { send: async (m) => { await pool.query("UPDATE messages SET status='delivered_to_server' WHERE id=$1", [m.id]); return { id: 'postal-123', state: 'transport_queued' }; } });
    assert.equal((await pool.query('SELECT status FROM messages WHERE id=$1', [a.id])).rows[0].status, 'delivered_to_server');
});
