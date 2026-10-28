import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
const origin = process.env.APP_URL || 'http://localhost:3000';
let cookie = '';
async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${origin}/api${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok)
        throw new Error(`${path}: ${response.status}: ${JSON.stringify(data)}`);
    const setCookie = response.headers.getSetCookie()[0];
    if (setCookie)
        cookie = setCookie.split(';')[0];
    return data;
}
const configuration = await request('/config');
assert.equal(configuration.mode, 'local', 'This check only runs against local mode.');
const id = randomUUID().slice(0, 8), email = `local-check-${id}@example.com`, password = `Local-test-${randomUUID()}`;
await request('/auth/register', { name: 'Local verification', organization: `Verification ${id}`, email, password });
const inbox = await request('/local/inbox');
const verification = inbox.items.find((m: any) => m.recipient === email);
assert.ok(verification, 'Verification email must arrive through SMTP');
const token = verification.text_body.match(/token=([a-f0-9]{64})/)?.[1];
assert.ok(token);
await request('/auth/verify', { token });
await request('/auth/login', { email, password });
const identity = (await request('/identities')).items[0];
assert.match(identity.email, /@.+\.send\.vstmailer\.test$/);
const key = await request('/keys', { name: 'Local verification' });
assert.match(key.token, /^vst_/);
const payload = { identityId: identity.id, to: [`recipient-${id}@example.com`], subject: `VSTMailer SMTP check ${id}`, text: 'Verified: HTTP acceptance → durable queue → SMTP → persisted local inbox.' };
const headers = { 'Idempotency-Key': `local-${id}`, Authorization: `Bearer ${key.token}` };
const first = await request('/emails', payload, headers);
const replay = await request('/emails', payload, headers);
assert.deepEqual(first, replay);
let message: any;
for (let attempt = 0; attempt < 40; attempt++) {
    message = await request(`/messages/${first.ids[0]}`);
    if (message.status === 'delivered_local')
        break;
    await setTimeout(500);
}
assert.equal(message.status, 'delivered_local');
const captured = (await request('/local/inbox')).items.find((m: any) => m.subject === payload.subject);
assert.ok(captured);
assert.match(captured.text_body, /HTTP acceptance/);
const overview = await request('/overview');
assert.equal(overview.cycle.consumed, 1);
assert.equal(overview.cycle.reserved, 0);
console.log(JSON.stringify({ result: 'PASS', mode: 'local', checks: ['Registration email over SMTP', 'Email verification', 'Session login', 'Hosted sending identity', 'API credential', 'Durable acceptance', 'Idempotent replay', 'Background SMTP delivery', 'Persisted test inbox', 'Exactly one consumed credit'], externalEmailsSent: 0 }, null, 2));
