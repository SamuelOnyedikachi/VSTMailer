import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { register, verifyEmail } from './auth.js';
import { loadConfig } from './config.js';
export async function ensureDemo(pool: pg.Pool) {
    if (loadConfig().mode !== 'local')
        throw new Error('Demo seeding is local-only.');
    if ((await pool.query("SELECT id FROM users WHERE email='demo@vstmailer.test'")).rowCount)
        return;
    const user = await register(pool, { name: 'Velion team', organization: 'Velion Smart Technologies', email: 'demo@vstmailer.test', password: process.env.DEMO_PASSWORD || 'VSTMailer-local-2026!' });
    await verifyEmail(pool, user.verificationToken);
    await pool.query("INSERT INTO templates(id,org_id,name,subject,text_body) VALUES($1,$2,'Welcome email','Welcome to our community','Thanks for joining us. We are happy you are here.')", [randomUUID(), user.orgId]);
    await pool.query("INSERT INTO contacts(id,org_id,email,name,consent,consent_source) VALUES($1,$2,'reader@example.com','Sample reader',true,'Local sample contact; no external delivery')", [randomUUID(), user.orgId]);
}
