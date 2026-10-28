import { createPool } from '../src/db.js';
import { ensureDemo } from '../src/seed.js';
const pool = createPool();
try {
    await ensureDemo(pool);
    console.log('Local demo ready. Open the app and select Open local workspace.');
}
finally {
    await pool.end();
}
