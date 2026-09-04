import { flushQueue } from './resultQueue';

async function main() {
  const BASE = process.env.TEST_API_URL || 'http://localhost:8000';
  try {
    console.log(`[flush] attempting to flush queued results to ${BASE}`);
    const n = await flushQueue(BASE);
    console.log(`[flush] completed — ${n} item(s) delivered`);
    process.exit(0);
  } catch (e) {
    console.error('[flush] error during flush:', (e as any)?.message || e);
    process.exit(2);
  }
}

if (require.main === module) main();
