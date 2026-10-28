import { createPool } from './db.js';
import { loadConfig } from './config.js';
import { createLocalInbox } from './inbox-service.js';
if (loadConfig().mode !== 'local')
    throw new Error('Local inbox is prohibited in production.');
const pool = createPool();
const server = createLocalInbox(pool);
server.listen(Number(process.env.SMTP_PORT || 1025), process.env.SMTP_BIND || '127.0.0.1', () => console.log('VSTMailer local SMTP inbox running. No external email delivery.'));
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.close(() => void pool.end().then(() => process.exit(0))));
