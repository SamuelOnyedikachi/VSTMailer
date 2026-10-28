import { createPool, migrate } from '../src/db.js';
const pool = createPool();
try {
    await migrate(pool);
    console.log('VSTMailer database migrated.');
}
finally {
    await pool.end();
}
