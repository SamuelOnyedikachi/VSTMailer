import { enforceSource } from './security.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type pg from 'pg';
import { ZodError } from 'zod';
import { loadConfig, type Config } from './config.js';
import { AppError } from './errors.js';
import { authenticate, authenticateKey, type Principal } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { customerRoutes } from './routes/customer.js';
import { publicRoutes } from './routes/public.js';
declare module 'fastify' {
    interface FastifyRequest {
        principal: Principal;
    }
}
export async function buildApp(pool: pg.Pool, config: Config = loadConfig()) {
    const app = Fastify({ trustProxy:process.env.TRUSTED_PROXY_CIDRS?.split(',').filter(Boolean)||false, bodyLimit: 6 * 1024 * 1024, logger: { level: 'warn', redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.token'] } });
    await app.register(cookie);
    await app.register(helmet);
    await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
    app.setErrorHandler((error, req, reply) => {
        if (error instanceof ZodError)
            return reply.code(400).send({ error: error.issues.map(i => `${i.path.join('.') || 'Request'}: ${i.message}`).join('; ') });
        if (error instanceof AppError)
            return reply.code(error.statusCode).send({ error: error.message, code: error.code });
        const e = error as {
            statusCode?: number;
            code?: string;
        };
        if (e.code === '23505')
            return reply.code(409).send({ error: 'This record already exists.' });
        if (e.code === '22P02')
            return reply.code(400).send({ error: 'Invalid record identifier.' });
        if (e.statusCode && e.statusCode < 500)
            return reply.code(e.statusCode).send({ error: (error as Error).message });
        req.log.error(error);
        return reply.code(500).send({ error: 'The request could not be completed. Please try again.' });
    });
    app.addHook('onRequest', async (req) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method))
            return;
        if (req.headers.origin && req.headers.origin !== new URL(config.appUrl).origin)
            throw new AppError(403, 'Request origin is not allowed.');
        if (config.mode === 'production' && req.cookies.vst_session && !req.headers.origin && !req.headers.authorization)
            throw new AppError(403, 'Browser requests must include an allowed origin.');
    });
    app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', product: 'VSTMailer', mode: config.mode }; });
    app.get('/config', async () => ({ mode: config.mode, transport: config.transport, hostedDomain: config.hostedDomain }));
    await authRoutes(app, pool, config);
    await publicRoutes(app, pool, config);
    await app.register(async (protectedApp) => {
        protectedApp.addHook('preHandler', async (req) => {
            const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
            const principal = bearer ? await authenticateKey(pool, bearer) : await authenticate(pool, req.cookies.vst_session || '');
            if (!principal)
                throw new AppError(401, 'Sign in to continue.');
            if(principal.kind==='api') await enforceSource(pool,principal.orgId,'api',req.ip);
            req.principal = principal;
        });
        await customerRoutes(protectedApp, pool, config);
    });
    return app;
}
