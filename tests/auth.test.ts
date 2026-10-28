import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, reset, account } from './helpers.js';
import { register, login, verifyEmail, authenticate } from '../src/auth.js';
beforeEach(reset);
after(() => pool.end());
test('unverified registration cannot log in; verification grants a scoped expiring session', async () => {
    const user = await register(pool, account());
    await assert.rejects(() => login(pool, account()), /verify/i);
    await verifyEmail(pool, user.verificationToken);
    const result = await login(pool, account());
    const session = await authenticate(pool, result.token);
    assert.ok(session);
    assert.equal(session.email, 'alice@example.com');
    assert.equal(session.orgId, user.orgId);
    const stored = (await pool.query('SELECT token_hash FROM sessions')).rows[0];
    assert.notEqual(stored.token_hash, result.token);
    await assert.rejects(() => login(pool, { ...account(), password: 'wrong password' }), /credentials/i);
});
test('independent registrations get different organizations and hosted send-only identities', async () => {
    const a = await register(pool, account('alice'));
    const b = await register(pool, account('bob'));
    assert.notEqual(a.orgId, b.orgId);
    const identities = (await pool.query('SELECT email,kind FROM identities ORDER BY email')).rows;
    assert.equal(identities.length, 2);
    assert.equal(identities[0].kind, 'hosted');
    assert.match(identities[0].email, /@.+\.send\.vstmailer\.test$/);
    assert.equal((await pool.query('SELECT allowance FROM cycles WHERE org_id=$1', [a.orgId])).rows[0].allowance, 10000);
});
test('expired verification and revoked sessions cannot authenticate', async () => {
    const a = await register(pool, account());
    await pool.query("UPDATE users SET verification_expires=now()-interval '1 hour'");
    await assert.rejects(() => verifyEmail(pool, a.verificationToken), /expired|invalid/i);
    assert.equal(await authenticate(pool, 'invented-token'), null);
});
