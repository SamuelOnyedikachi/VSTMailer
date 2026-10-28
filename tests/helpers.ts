import { createPool, migrate } from '../src/db.js';
export const pool = createPool(process.env.TEST_DATABASE_URL);
export async function reset() {
    if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test'))
        throw new Error('Tests require a dedicated database ending in _test');
    await migrate(pool);
    await pool.query('TRUNCATE organizations, local_inbox CASCADE');
}
export const account = (name = 'alice') => ({ name, organization: `${name} studio`, email: `${name}@example.com`, password: 'Correct-horse-2026!' });
