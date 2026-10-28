import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { createPool, migrate } from '../src/db.js';
import { register, verifyEmail } from '../src/auth.js';
import { acceptMail } from '../src/mail.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || process.env.APP_MODE !== 'local')
    throw new Error('Acceptance load test requires local mode and a dedicated _test database.');
const total = Number(process.argv[2] || 1000);
if (!Number.isSafeInteger(total) || total < 100 || total > 100000 || total % 100)
    throw new Error('Recipient count must be a multiple of 100 between 100 and 100000.');
const pool = createPool(url);
try {
    await migrate(pool);
    const suffix = randomUUID();
    const account = await register(pool, { name: 'Acceptance benchmark', organization: 'Acceptance benchmark', email: `benchmark-${suffix}@example.com`, password: randomUUID() });
    await verifyEmail(pool, account.verificationToken);
    await pool.query('UPDATE cycles SET allowance=$2 WHERE org_id=$1', [account.orgId, total]);
    const identity = (await pool.query('SELECT id FROM identities WHERE org_id=$1', [account.orgId])).rows[0];
    const started = performance.now();
    let next = 0;
    await Promise.all(Array.from({ length: 10 }, async () => { while (next < total / 100) {
        const batch = next++;
        await acceptMail(pool, account.orgId, { identityId: identity.id, to: Array.from({ length: 100 }, (_, i) => `recipient-${batch * 100 + i}@example.com`), subject: 'Synthetic acceptance benchmark', text: 'Local capacity test. This message is never dispatched.' }, `benchmark-${batch}`);
    } }));
    const seconds = (performance.now() - started) / 1000;
    const count = Number((await pool.query('SELECT count(*) FROM messages WHERE org_id=$1', [account.orgId])).rows[0].count);
    const cycle = (await pool.query('SELECT reserved,consumed FROM cycles WHERE org_id=$1', [account.orgId])).rows[0];
    if (count !== total || cycle.reserved !== total || cycle.consumed !== 0)
        throw new Error('Benchmark accounting mismatch');
    console.log(JSON.stringify({ test: 'Synthetic durable acceptance, not Internet delivery', recipients: count, seconds: Number(seconds.toFixed(3)), recipientsPerSecond: Number((total / seconds).toFixed(2)), concurrentClients: 10, batchSize: 100, node: process.version, externalEmailsSent: 0, credits: cycle }, null, 2));
}
finally {
    await pool.end();
}
