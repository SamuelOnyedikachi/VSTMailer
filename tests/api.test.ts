import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, reset, account } from './helpers.js';
import { register, verifyEmail, login } from '../src/auth.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
beforeEach(reset);
after(() => pool.end());
async function cookie(name = 'alice') { const a = await register(pool, account(name)); await verifyEmail(pool, a.verificationToken); const r = await login(pool, account(name)); return `vst_session=${r.token}`; }
test('customer data requires authentication; sessions cannot read another workspace', async () => {
    const app = await buildApp(pool);
    const a = await cookie();
    const b = await cookie('bob');
    assert.equal((await app.inject({ url: '/messages' })).statusCode, 401);
    const identity = (await pool.query("SELECT i.id FROM identities i JOIN users u ON u.org_id=i.org_id WHERE u.email='alice@example.com'")).rows[0];
    const sent = await app.inject({ method: 'POST', url: '/emails', headers: { cookie: a, 'idempotency-key': 'api-1' }, payload: { identityId: identity.id, to: ['reader@example.com'], subject: 'Hello', text: 'Private message' } });
    assert.equal(sent.statusCode, 202);
    const id = sent.json().ids[0];
    assert.equal((await app.inject({ url: `/messages/${id}`, headers: { cookie: b } })).statusCode, 404);
    const list = await app.inject({ url: '/messages', headers: { cookie: b } });
    assert.equal(list.json().items.length, 0);
    await app.close();
});
test('API keys can send but cannot create more credentials or change plans', async () => {
    const app = await buildApp(pool);
    const c = await cookie();
    const key = await app.inject({ method: 'POST', url: '/keys', headers: { cookie: c }, payload: { name: 'Production app' } });
    assert.equal(key.statusCode, 201);
    assert.match(key.json().token, /^vst_/);
    const authorization = `Bearer ${key.json().token}`;
    assert.equal((await app.inject({ method: 'POST', url: '/keys', headers: { authorization }, payload: { name: 'stolen' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/local/plan', headers: { authorization }, payload: { plan: 'scale' } })).statusCode, 403);
    await app.close();
});
test('foreign browser origins cannot mutate cookie-authenticated accounts', async () => {
    const app = await buildApp(pool);
    const c = await cookie();
    assert.equal((await app.inject({ method: 'POST', url: '/keys', headers: { cookie: c, origin: 'https://attacker.example' }, payload: { name: 'stolen' } })).statusCode, 403);
    await app.close();
});
test('production disables local demo, test inbox and subscription simulator', async () => {
    const config = { ...loadConfig(), mode: 'production' as const };
    const app = await buildApp(pool, config);
    assert.equal((await app.inject({ method: 'POST', url: '/auth/demo' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/local/inbox' })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/local/plan', payload: { plan: 'scale' } })).statusCode, 404);
    await app.close();
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /APP_MODE/);
});
test('authenticated duplicate delivery events consume once and late deferrals cannot regress a bounce', async () => {
    const config = { ...loadConfig(), ingressToken: 'local-test-ingress-token' };
    const app = await buildApp(pool, config);
    const c = await cookie();
    const identity = (await pool.query('SELECT id FROM identities')).rows[0];
    const accepted = await app.inject({ method: 'POST', url: '/emails', headers: { cookie: c, 'idempotency-key': 'events-test' }, payload: { identityId: identity.id, to: ['reader@example.com'], subject: 'Event ordering', text: 'Hello' } });
    const id = accepted.json().ids[0];
    const body = { eventId: 'node-1:delivery-1', messageId: id, kind: 'delivered_to_server' };
    assert.equal((await app.inject({ method: 'POST', url: '/internal/delivery-events', payload: body })).statusCode, 401);
    const headers = { 'x-vst-ingress-token': config.ingressToken };
    assert.equal((await app.inject({ method: 'POST', url: '/internal/delivery-events', headers, payload: body })).statusCode, 200);
    await app.inject({ method: 'POST', url: '/internal/delivery-events', headers, payload: body });
    await app.inject({ method: 'POST', url: '/internal/delivery-events', headers, payload: { ...body, eventId: 'node-1:bounce-1', kind: 'bounced' } });
    await app.inject({ method: 'POST', url: '/internal/delivery-events', headers, payload: { ...body, eventId: 'node-1:delay-1', kind: 'deferred' } });
    assert.equal((await pool.query('SELECT status FROM messages')).rows[0].status, 'bounced');
    assert.deepEqual((await pool.query('SELECT reserved,consumed FROM cycles')).rows[0], { reserved: 0, consumed: 1 });
    assert.equal(Number((await pool.query("SELECT count(*) FROM events WHERE external_id='node-1:delivery-1'")).rows[0].count), 1);
    await app.close();
});
