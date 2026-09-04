import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ExecutionResult } from './types';

const QUEUE_FILE = path.join(__dirname, '..', 'offline_queue.json');

function loadQueue(): ExecutionResult[] {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    const raw = fs.readFileSync(QUEUE_FILE, 'utf-8');
    const items = JSON.parse(raw) as ExecutionResult[];
    console.log(`[queue] loaded ${items.length} item(s) from ${QUEUE_FILE}`);
    return items;
  } catch (e) {
    console.warn('Failed to load offline queue:', (e as any)?.message || e);
    return [];
  }
}

function saveQueue(items: ExecutionResult[]) {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2), 'utf-8');
    // [Requirement] Produce useful execution logs and status information.
    // Persisting the queue and logging its size gives operators visibility
    // into outstanding results waiting for delivery to the TMS.
    console.log(`[queue] saved ${items.length} item(s) to ${QUEUE_FILE}`);
  } catch (e) {
    console.error('[queue] Failed to save offline queue:', (e as any)?.message || e);
  }
}

export function enqueueResult(res: ExecutionResult) {
  const q = loadQueue();
  const record = { ...res, queuedAt: new Date().toISOString() } as any;
  q.push(record);
  saveQueue(q);
  console.log(`[queue] enqueued result for ${res.testId} (queue size=${q.length})`);
}

export async function flushQueue(baseUrl: string): Promise<number> {
  const q = loadQueue();
  if (q.length === 0) return 0;
  console.log(`[queue] Attempting to flush ${q.length} queued result(s) to ${baseUrl}`);
  let success = 0;
  const remaining: ExecutionResult[] = [];
  for (const item of q) {
    const payload = { status: item.passed ? 'passed' : 'failed', lastRun: { passed: item.passed, logs: item.logs } };
    try {
      await axios.put(`${baseUrl}/tests/${item.testId}`, payload, { timeout: 5000 });
      success += 1;
      console.log(`[queue] flushed result for ${item.testId}`);
    } catch (e) {
      console.warn(`[queue] failed to flush result for ${item.testId}:`, (e as any)?.message || e);
      remaining.push(item);
    }
  }
  saveQueue(remaining as any);
  console.log(`[queue] flush complete: ${success} flushed, ${remaining.length} remaining`);
  return success;
}

export function startBackgroundFlusher(baseUrl: string, intervalMs = 30000) {
  console.log(`[flusher] starting background flusher (interval=${intervalMs}ms)`);
  let stopped = false;
  let backoff = 1;
  let timer: NodeJS.Timeout | null = null;

  const scheduleNext = (delay: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(runAttempt, delay);
    console.log(`[flusher] scheduled next attempt in ${delay}ms`);
  };

  const runAttempt = async () => {
    if (stopped) return;
    console.log(`[flusher] attempt starting (backoff=${backoff})`);
    try {
      const n = await flushQueue(baseUrl);
      if (n > 0) {
        backoff = 1;
      } else {
        backoff = Math.min(backoff * 2, 8);
      }
    } catch (e) {
      console.warn('[flusher] attempt error:', (e as any)?.message || e);
      backoff = Math.min(backoff * 2, 8);
    }
    const next = intervalMs * backoff;
    scheduleNext(next);
  };

  // start shortly after launch
  scheduleNext(1000);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    console.log('[flusher] stopped');
  };
}
