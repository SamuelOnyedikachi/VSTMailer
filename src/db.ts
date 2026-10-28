import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
export const createPool = (url = process.env.DATABASE_URL) => new pg.Pool({ connectionString: url, max: 20 });
export async function migrate(pool: pg.Pool) {
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()) {
        await pool.query(await readFile(new URL(file, directory), 'utf8'));
    }
}
export async function transaction<T>(pool: pg.Pool, action: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await action(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export type DB = pg.Pool | pg.PoolClient;
