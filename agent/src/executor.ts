import { ExecutionResult } from "./types";

// Simulated executors. In a real implementation these would invoke Playwright,
// a performance harness, static security scanners, etc.

export async function runFunctional(testId: string): Promise<ExecutionResult> {
  // Simulate execution
  await sleep(400);
  return { testId, passed: true, logs: "Functional test passed" };
}

export async function runPerformance(testId: string): Promise<ExecutionResult> {
  await sleep(600);
  return { testId, passed: Math.random() > 0.2, logs: "Performance metrics collected" };
}

export async function runSecurity(testId: string): Promise<ExecutionResult> {
  await sleep(500);
  return { testId, passed: Math.random() > 0.3, logs: "Security scan complete" };
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
