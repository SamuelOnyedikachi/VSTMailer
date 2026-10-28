import type pg from 'pg';
import { randomUUID, randomBytes, createHash, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { transaction } from './db.js';
import { AppError } from './errors.js';
import { loadConfig } from './config.js';
const scrypt = promisify(derive);
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export type Principal = {
    userId: string;
    orgId: string;
    email: string;
    name: string;
    organization: string;
    status: string;
    kind: 'session' | 'api';
};
const registration = z.object({ email: z.email().max(254).transform(v => v.trim().toLowerCase()), password: z.string().min(12).max(128), name: z.string().trim().min(1).max(100), organization: z.string().trim().min(1).max(100) });
export async function hashPassword(password: string) { const salt = secret(); const key = await scrypt(password, salt, 64) as Buffer; return `${salt}:${key.toString('hex')}`; }
async function passwordMatches(password: string, stored: string) { const [salt, value] = stored.split(':'); const key = await scrypt(password, salt, 64) as Buffer; const actual = Buffer.from(value, 'hex'); return actual.length === key.length && timingSafeEqual(actual, key); }
export async function register(pool: pg.Pool, input: z.input<typeof registration>) {
    const data = registration.parse(input);
    const orgId = randomUUID(), userId = randomUUID(), token = secret();
    const passwordHash = await hashPassword(data.password);
    const config = loadConfig();
    const slug = (data.organization.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'workspace') + '-' + orgId.slice(0, 8);
    try {
        await transaction(pool, async (c) => {
            await c.query('INSERT INTO organizations(id,name,slug,status) VALUES($1,$2,$3,$4)', [orgId, data.organization, slug, config.mode === 'local' ? 'active' : 'pending']);
            await c.query("INSERT INTO users(id,org_id,email,name,password_hash,verification_hash,verification_expires) VALUES($1,$2,$3,$4,$5,$6,now()+interval '1 day')", [userId, orgId, data.email, data.name, passwordHash, digest(token)]);
            await c.query("INSERT INTO identities(id,org_id,email,label,kind,status) VALUES($1,$2,$3,$4,'hosted',$5)", [randomUUID(), orgId, `hello@${slug}.${config.hostedDomain}`, data.organization, config.mode === 'local' ? 'active' : 'pending']);
            await c.query("INSERT INTO cycles(id,org_id,plan_slug,starts_at,ends_at,allowance) SELECT $1,$2,'launch',now(),now()+interval '1 month',allowance FROM plans WHERE slug='launch'", [randomUUID(), orgId]);
        });
    }
    catch (error) {
        if ((error as {
            code?: string;
        }).code === '23505')
            throw new AppError(409, 'An account with that email already exists.');
        throw error;
    }
    return { orgId, userId, verificationToken: token, email: data.email };
}
export async function verifyEmail(pool: pg.Pool, token: string) {
    const r = await pool.query('UPDATE users SET verified=true,verification_hash=NULL,verification_expires=NULL WHERE verification_hash=$1 AND verification_expires>now() RETURNING id', [digest(token)]);
    if (!r.rowCount)
        throw new AppError(400, 'Verification link is invalid or expired.');
}
export async function login(pool: pg.Pool, input: {
    email: string;
    password: string;
}) {
    const data = z.object({ email: z.email().transform(v => v.toLowerCase()), password: z.string().max(128) }).parse(input);
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [data.email]);
    const user = rows[0];
    if (!user || !await passwordMatches(data.password, user.password_hash))
        throw new AppError(401, 'Invalid email or password credentials.');
    if (!user.verified)
        throw new AppError(403, 'Please verify your email before signing in.');
    const token = secret();
    await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [digest(token), user.id]);
    return { token };
}
export async function authenticate(pool: pg.Pool, token: string): Promise<Principal | null> {
    if (!token)
        return null;
    const r = await pool.query(`SELECT u.id AS "userId",o.id AS "orgId",u.email,u.name,o.name AS organization,o.status FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=u.org_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.verified`, [digest(token)]);
    return r.rows[0] ? { ...r.rows[0], kind: 'session' } : null;
}
export async function authenticateKey(pool: pg.Pool, token: string): Promise<Principal | null> {
    const r = await pool.query(`SELECT o.id AS "orgId",o.name AS organization,o.status FROM api_keys k JOIN organizations o ON o.id=k.org_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL`, [digest(token)]);
    return r.rows[0] ? { ...r.rows[0], userId: '', email: '', name: 'API', kind: 'api' } : null;
}
