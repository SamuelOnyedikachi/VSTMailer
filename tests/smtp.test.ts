import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, reset, account } from './helpers.js';
import { register, verifyEmail } from '../src/auth.js';
import { acceptMail } from '../src/mail.js';
import { createTransport } from '../src/transports.js';
import { dispatchOne } from '../src/worker-service.js';
import { createLocalInbox } from '../src/inbox-service.js';
beforeEach(reset);
after(() => pool.end());
test('accepted email traverses a real SMTP socket and persists in the test inbox', async () => {
    const server = createLocalInbox(pool);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = (server as any).server.address();
    const oldPort = process.env.SMTP_PORT;
    process.env.SMTP_PORT = String(address.port);
    try {
        const a = await register(pool, account());
        await verifyEmail(pool, a.verificationToken);
        const identity = (await pool.query('SELECT id FROM identities')).rows[0];
        await acceptMail(pool, a.orgId, { identityId: identity.id, to: ['reader@example.com'], subject: 'Real SMTP delivery', text: 'A durable message.' }, 'socket-test');
        await dispatchOne(pool, createTransport());
        const stored = (await pool.query('SELECT recipient,subject,text_body FROM local_inbox')).rows[0];
        assert.ok(stored);
        assert.equal(stored.recipient, 'reader@example.com');
        assert.equal(stored.subject, 'Real SMTP delivery');
        assert.match(stored.text_body, /A durable message/);
        assert.equal((await pool.query('SELECT consumed FROM cycles')).rows[0].consumed, 1);
    }
    finally {
        process.env.SMTP_PORT = oldPort;
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
