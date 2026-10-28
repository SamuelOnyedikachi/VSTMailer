import { createPool } from './db.js';
import { buildApp } from './app.js';
const pool = createPool();
const app = await buildApp(pool);
await app.listen({ host: process.env.API_HOST || '127.0.0.1', port: Number(process.env.API_PORT || 4010) });
console.log(`VSTMailer API: http://${process.env.API_HOST || '127.0.0.1'}:${process.env.API_PORT || 4010}`);
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => void app.close().then(() => pool.end()).then(() => process.exit(0)));
