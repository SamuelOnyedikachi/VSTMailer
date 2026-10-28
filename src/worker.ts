import { setTimeout } from 'node:timers/promises';
import { createPool } from './db.js';
import { dispatchOne } from './worker-service.js';
import { createTransport } from './transports.js';
import { prepareCampaignBatch } from './campaigns.js';
const pool = createPool();
const transport = createTransport();
let running = true;
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => { running = false; });
console.log('VSTMailer delivery worker running.');
while (running) {
    try {
        const prepared = await prepareCampaignBatch(pool);
        const sent = await dispatchOne(pool, transport);
        if (!prepared && !sent)
            await setTimeout(750);
    }
    catch (e) {
        console.error('Worker failed:', (e as Error).message);
        await setTimeout(2000);
    }
}
await pool.end();
