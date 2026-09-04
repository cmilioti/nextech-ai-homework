import axios from "axios";
import { TestCase, ExecutionResult } from "./types";
import { decideExecutionStrategy } from "./llm";
import { runFunctional, runPerformance, runSecurity } from "./executor";
import { runFixture, runFixtureObject } from "./playwrightRunner";
import { detectChanges } from "./changeDetector";
import fs from 'fs';
import { enqueueResult, startBackgroundFlusher } from './resultQueue';

const BASE = process.env.TEST_API_URL || "http://localhost:8000";

async function fetchTests(): Promise<TestCase[]> {
  if (process.env.SIMULATE_TMS_OFFLINE === '1') {
    throw new Error('Simulated TMS offline');
  }
  try {
    const r = await axios.get(`${BASE}/tests`, { timeout: 5000 });
    return r.data as TestCase[];
  } catch (e) {
    throw new Error('Failed to fetch tests from TMS: ' + ((e as any)?.message || e));
  }
}

async function publishResult(res: ExecutionResult) {
  // Simple PUT to update test with a result field
  const payload = { status: res.passed ? "passed" : "failed", lastRun: { passed: res.passed, logs: res.logs } };
  try {
    if (process.env.SIMULATE_TMS_OFFLINE === '1') {
      console.warn('SIMULATE_TMS_OFFLINE=1 — enqueueing publish for', res.testId);
      enqueueResult(res);
      return;
    }
    await axios.put(`${BASE}/tests/${res.testId}`, payload, { timeout: 5000 });
  } catch (e) {
    console.error("Failed to publish result — enqueueing for retry", (e as any)?.message || e);
    try { enqueueResult(res); } catch (err) { console.error('Failed to enqueue result', err); }
  }
}

async function runAgent() {
  // start background flusher to retry queued results
  const stopFlusher = startBackgroundFlusher(BASE, 30000);

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

      const strategy = await decideExecutionStrategy(`${t.title} ${t.description || ""} ${t.typeOfTest || ""}`);
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
