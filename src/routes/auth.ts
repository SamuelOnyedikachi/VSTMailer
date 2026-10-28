import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { register, verifyEmail, login, digest } from '../auth.js';
import type { Config } from '../config.js';
import { createTransport } from '../transports.js';
import { ensureDemo } from '../seed.js';
export async function authRoutes(app: FastifyInstance, pool: pg.Pool, config: Config) {
    const session = (reply: any, token: string) => reply.setCookie('vst_session', token, { httpOnly: true, sameSite: 'lax', secure: config.mode === 'production', path: '/', maxAge: 7 * 24 * 3600 });
    app.post('/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
        const result = await register(pool, req.body as any);
        const url = `${config.appUrl}/verify?token=${result.verificationToken}`;
        try {
            await createTransport(config).send({ id: randomUUID(), orgId: result.orgId, from: config.authFrom, to: result.email, subject: 'Verify your VSTMailer email', text: `Welcome to VSTMailer. Verify your email within 24 hours:\n\n${url}`, html: '', replyTo: config.authFrom, kind: 'transactional', unsubscribeToken: '' });
        }
        catch {
            req.log.error('Verification email transport unavailable; account remains unverified.');
            return reply.code(503).send({ error: 'Account created, but verification email could not be sent. Start the mail transport and request a new link.' });
        }
        return reply.code(201).send({ message: 'Account created. Check your inbox for a verification link.' });
    });
    app.post('/auth/verify', async (req) => { const { token } = z.object({ token: z.string().length(64) }).parse(req.body); await verifyEmail(pool, token); return { message: 'Email verified. You can now sign in.' }; });
    app.post('/auth/login', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (req, reply) => { const result = await login(pool, req.body as any); session(reply, result.token); return { message: 'Signed in.' }; });
    app.post('/auth/logout', async (req, reply) => { await pool.query('DELETE FROM sessions WHERE token_hash=$1', [digest(req.cookies.vst_session || '')]); reply.clearCookie('vst_session', { path: '/' }); return { message: 'Signed out.' }; });
    if (config.mode === 'local')
        app.post('/auth/demo', async (_req, reply) => { await ensureDemo(pool); const result = await login(pool, { email: 'demo@vstmailer.test', password: process.env.DEMO_PASSWORD || 'VSTMailer-local-2026!' }); session(reply, result.token); return { message: 'Local demo workspace opened.' }; });
}
