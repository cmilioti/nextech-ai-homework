import axios from "axios";
import { TestCase, ExecutionResult } from "./types";
import { decideExecutionStrategy } from "./llm";
import { runFunctional, runPerformance, runSecurity } from "./executor";
import { runFixture, runFixtureObject } from "./playwrightRunner";
import { detectChanges } from "./changeDetector";
import fs from 'fs';
import { enqueueResult, startBackgroundFlusher, flushQueue } from './resultQueue';

const BASE = process.env.TEST_API_URL || "http://localhost:8000";
// SIMULATE_TMS_OFFLINE behavior: set SIMULATE_TMS_OFFLINE=1 to simulate offline.
// Optionally set SIMULATE_TMS_OFFLINE_TIMEOUT (seconds) to have the simulation expire.
const SIMULATE_OFFLINE_FLAG = process.env.SIMULATE_TMS_OFFLINE === '1';
const SIMULATE_OFFLINE_TIMEOUT = parseInt(process.env.SIMULATE_TMS_OFFLINE_TIMEOUT || '0', 10);
const SIMULATE_OFFLINE_UNTIL = SIMULATE_OFFLINE_FLAG ? (SIMULATE_OFFLINE_TIMEOUT > 0 ? Date.now() + SIMULATE_OFFLINE_TIMEOUT * 1000 : Infinity) : 0;
const VERBOSE = process.env.VERBOSE_AGENT === '1';

function isSimulatedOffline() {
  if (!SIMULATE_OFFLINE_FLAG) return false;
  if (SIMULATE_OFFLINE_UNTIL === Infinity) return true;
  const now = Date.now();
  const still = now < SIMULATE_OFFLINE_UNTIL;
  if (!still) console.log('[simulate] SIMULATE_TMS_OFFLINE timeout expired');
  return still;
}

function logTmsAppearsOffline(reason?: string) {
  const msg = reason ? `${reason}` : 'no reason provided';
  console.warn(`[tms] appears offline — ${msg}`);
}

async function fetchTests(): Promise<TestCase[]> {
  // [Requirement] Retrieve test cases from the Test Management System (TMS).
  // This function is the single place where the agent fetches available test
  // definitions and metadata from the remote test management platform.
  if (isSimulatedOffline()) {
    throw new Error('Simulated TMS offline');
  }
  try {
    const r = await axios.get(`${BASE}/tests`, { timeout: 5000 });
    return r.data as TestCase[];
  } catch (e) {
    const msg = (e as any)?.message || e;
    logTmsAppearsOffline(String(msg));
    throw new Error('Failed to fetch tests from TMS: ' + msg);
  }
}

async function publishResult(res: ExecutionResult) {
  // Simple PUT to update test with a result field
  const payload = { status: res.passed ? "passed" : "failed", lastRun: { passed: res.passed, logs: res.logs } };
  try {
    if (isSimulatedOffline()) {
      console.warn('SIMULATE_TMS_OFFLINE active — enqueueing publish for', res.testId);
      enqueueResult(res);
      return;
    }
    // [Requirement] Publish results back to the Test Management System (TMS).
    // Successful PUT updates the test item with the latest status and logs.
    await axios.put(`${BASE}/tests/${res.testId}`, payload, { timeout: 5000 });
  } catch (e) {
    const msg = (e as any)?.message || e;
    logTmsAppearsOffline(String(msg));
    // [Requirement] Handle failures gracefully: when publishing to the TMS
    // fails (network error, offline, etc.), enqueue the result locally for
    // retry by the background flusher so no test result is lost.
    console.error("Failed to publish result — enqueueing for retry", msg);
    try { enqueueResult(res); } catch (err) { console.error('Failed to enqueue result', err); }
  }
}

async function runAgent() {
  // start background flusher to retry queued results
  const stopFlusher = startBackgroundFlusher(BASE, 30000);

  if (SIMULATE_OFFLINE_FLAG) {
    if (SIMULATE_OFFLINE_TIMEOUT > 0) {
      console.log(`[simulate] SIMULATE_TMS_OFFLINE enabled for ${SIMULATE_OFFLINE_TIMEOUT}s`);
      // Schedule an immediate flush attempt once the offline simulation expires
      setTimeout(async () => {
        try {
          console.log('[simulate] timeout expired — attempting immediate flush of queued results');
          const n = await flushQueue(BASE);
          console.log(`[simulate] immediate flush result: ${n} item(s) delivered`);
        } catch (e) {
          console.warn('[simulate] immediate flush failed:', (e as any)?.message || e);
        }
      }, SIMULATE_OFFLINE_TIMEOUT * 1000);
    } else {
      console.log('[simulate] SIMULATE_TMS_OFFLINE enabled (no timeout)');
    }
  }

  // If REPO_URL or REPO_PATH provided, detect changes and select tests accordingly
  const repoUrl = process.env.REPO_URL;
  const repoPath = process.env.REPO_PATH;
  const baseRef = process.env.BASE_REF || 'origin/main';
  const headRef = process.env.HEAD_REF || 'HEAD';
  let selectedTests: TestCase[] | null = null;
  if (repoUrl || repoPath) {
    console.log('Detecting changes in repo', repoUrl || repoPath);
    const changes = await detectChanges({ repoUrl, repoPath, baseRef, headRef });
    console.log('Changed files:', changes.changedFiles);
    console.log('Inferred test types:', changes.inferredTestTypes);

    // fetch all tests and filter by inferred type
    const all = await fetchTests();
    if (changes.inferredTestTypes.length === 0) {
      console.log('No inferred types; defaulting to all tests');
      selectedTests = all;
    } else {
      selectedTests = all.filter(t => changes.inferredTestTypes.includes((t.typeOfTest || '').toLowerCase()));
    }
    console.log(`Selected ${selectedTests.length} tests based on changes`);
  }

  // If RUN_FIXTURE is set, run that local fixture and publish result
  const fixturePath = process.env.RUN_FIXTURE;
  if (fixturePath) {
    console.log('Running local fixture:', fixturePath);
    const res = await runFixture(fixturePath);
    console.log('Fixture result:', res);
    await publishResult(res);
    return;
  }

  console.log("Fetching tests from", BASE);
  let tests: TestCase[];
  try {
    tests = selectedTests ?? await fetchTests();
  } catch (e) {
    console.error('Unable to retrieve tests from TMS — aborting run:', (e as any)?.message || e);
    return;
  }
  for (const t of tests) {
    try {
      console.log(`Processing ${t.id}: ${t.title}`);
      // If the test includes inline `steps`, run them directly via Playwright
      if (Array.isArray((t as any).steps) && (t as any).steps.length > 0) {
        console.log(`Test ${t.id} contains inline steps — running Playwright`);
        const res = await runFixtureObject({ id: t.id, name: t.title, steps: (t as any).steps });
        console.log(`Result for ${t.id}:`, res.passed ? "PASSED" : "FAILED");
        await publishResult(res);
        continue;
      }

      // Fixture files are no longer auto-detected — inline `steps` are preferred.

      const prompt = `${t.title} ${t.description || ""} ${t.typeOfTest || ""}`.trim();
      if (VERBOSE) console.log('[verbose] strategy prompt ->', prompt);
      const strategy = await decideExecutionStrategy(prompt);
      console.log(`Decided strategy: ${strategy}`);
      let result: ExecutionResult;
      if (strategy.includes("performance")) result = await runPerformance(t.id);
      else if (strategy.includes("security")) result = await runSecurity(t.id);
      else result = await runFunctional(t.id);

      console.log(`Result for ${t.id}:`, result.passed ? "PASSED" : "FAILED");
      await publishResult(result);
    } catch (err) {
      console.error("Error processing test", t.id, (err as any)?.message || err);
      // publish failure status
      await publishResult({ testId: t.id, passed: false, logs: `Agent error: ${(err as any)?.message || err}` });
    }
  }
}

if (require.main === module) {
  runAgent().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
