import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, reset, account } from './helpers.js';
import { register, verifyEmail } from '../src/auth.js';
import { acceptMail, type MailInput } from '../src/mail.js';
beforeEach(reset);
after(() => pool.end());
async function setup(name = 'alice') {
    const a = await register(pool, account(name));
    await verifyEmail(pool, a.verificationToken);
    const identity = (await pool.query('SELECT id FROM identities WHERE org_id=$1', [a.orgId])).rows[0];
    return { orgId: a.orgId, input: { identityId: identity.id, to: ['reader@example.com'], subject: 'Welcome', text: 'Hello from VSTMailer.' } satisfies MailInput };
}
test('40 competing accepts cannot exceed ten available recipient credits', async () => {
    const { orgId, input } = await setup();
    await pool.query('UPDATE cycles SET allowance=10 WHERE org_id=$1', [orgId]);
    const results = await Promise.allSettled(Array.from({ length: 40 }, (_, i) => acceptMail(pool, orgId, input, `concurrent-${i}`)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 10);
    const cycle = (await pool.query('SELECT reserved,consumed FROM cycles')).rows[0];
    assert.equal(cycle.reserved, 10);
    assert.equal(cycle.consumed, 0);
    assert.equal(Number((await pool.query('SELECT count(*) FROM outbox')).rows[0].count), 10);
});
test('idempotent retries reserve once and changed payload under same key conflicts', async () => {
    const { orgId, input } = await setup();
    const a = await acceptMail(pool, orgId, input, 'welcome-1');
    const b = await acceptMail(pool, orgId, input, 'welcome-1');
    assert.deepEqual(a, b);
    await assert.rejects(() => acceptMail(pool, orgId, { ...input, subject: 'changed' }, 'welcome-1'), /different|conflict/i);
    assert.equal((await pool.query('SELECT reserved FROM cycles')).rows[0].reserved, 1);
});
test('another customer cannot use an identity and known suppressed recipients consume no quota', async () => {
    const a = await setup();
    const b = await setup('bob');
    await assert.rejects(() => acceptMail(pool, b.orgId, a.input, 'stolen'), /sender|identity/i);
    await pool.query("INSERT INTO suppressions(org_id,email,reason) VALUES($1,'reader@example.com','unsubscribed')", [a.orgId]);
    const result = await acceptMail(pool, a.orgId, a.input, 'suppressed');
    assert.deepEqual(result.ids, []);
    assert.deepEqual(result.suppressed, ['reader@example.com']);
    assert.equal((await pool.query('SELECT reserved FROM cycles WHERE org_id=$1', [a.orgId])).rows[0].reserved, 0);
});
test('marketing requires recorded permission and invalid recipient batches reserve nothing', async () => {
    const { orgId, input } = await setup();
    await assert.rejects(() => acceptMail(pool, orgId, { ...input, kind: 'marketing' }, 'no-consent'), /consent|permission/i);
    await assert.rejects(() => acceptMail(pool, orgId, { ...input, to: ['good@example.com', 'invalid'] }, 'bad-batch'));
    assert.equal((await pool.query('SELECT reserved FROM cycles')).rows[0].reserved, 0);
});
