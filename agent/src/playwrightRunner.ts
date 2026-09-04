import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { ExecutionResult } from './types';

type Fixture = {
  id: string;
  name?: string;
  metadata?: Record<string, any>;
  steps: Array<Record<string, any>>;
};

export async function runFixture(fixturePath: string): Promise<ExecutionResult> {
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }
  const raw = fs.readFileSync(fixturePath, 'utf-8');
  const fixture: Fixture = JSON.parse(raw);
  const testId = fixture.id || path.basename(fixturePath, path.extname(fixturePath));

  // Allow skipping Playwright for quick smoke tests when system browsers are unavailable
  const skip = process.env.SKIP_PLAYWRIGHT === '1';
  let browser: any = null;
  let context: any = null;
  let page: any = null;
  if (!skip) {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
  } else {
    console.log('[playwrightRunner] SKIP_PLAYWRIGHT=1 — simulating steps without browser');
  }

  let passed = true;
  let logs: string[] = [];

  for (const [i, step] of fixture.steps.entries()) {
    const action = step.action;
    try {
      if (action === 'goto') {
        const url = step.url;
        if (!skip) {
          await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        }
        logs.push(`goto ${url}`);
      } else if (action === 'eval') {
        const script = step.script;
        let res: any = null;
        if (!skip) {
          res = await page.evaluate(script);
        } else {
          res = '[simulated eval]';
        }
        logs.push(`eval -> ${String(res)}`);
      } else if (action === 'screenshot') {
        const out = step.path || `artifacts/${testId}-${i}.png`;
        const outDir = path.dirname(out);
        if (outDir && !fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        if (!skip) {
          await page.screenshot({ path: out, fullPage: true });
        } else {
          // create an empty placeholder file
          fs.writeFileSync(out, 'simulated-screenshot');
        }
        logs.push(`screenshot -> ${out}`);
      } else {
        logs.push(`unknown action ${action}`);
      }
    } catch (e) {
      passed = false;
      logs.push(`step ${i} FAILED: ${(e as any)?.message || e}`);
      // stop on first failure
      break;
    }
  }

  if (!skip && browser) await browser.close();

  return { testId, passed, logs: logs.join('\n') };
}

export async function runFixtureObject(fixture: Fixture): Promise<ExecutionResult> {
  const testId = fixture.id || `inline-${Date.now()}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = true;
  let logs: string[] = [];

  for (const [i, step] of fixture.steps.entries()) {
    const action = step.action;
    try {
      if (action === 'goto') {
        const url = step.url;
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        logs.push(`goto ${url}`);
      } else if (action === 'eval') {
        const script = step.script;
        const res = await page.evaluate(script);
        logs.push(`eval -> ${String(res)}`);
      } else if (action === 'screenshot') {
        const out = step.path || `artifacts/${testId}-${i}.png`;
        const outDir = path.dirname(out);
        if (outDir && !fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        await page.screenshot({ path: out, fullPage: true });
        logs.push(`screenshot -> ${out}`);
      } else {
        logs.push(`unknown action ${action}`);
      }
    } catch (e) {
      passed = false;
      logs.push(`step ${i} FAILED: ${(e as any)?.message || e}`);
      break;
    }
  }

  await browser.close();

  return { testId, passed, logs: logs.join('\n') };
}

// CLI
if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: ts-node src/playwrightRunner.ts <fixture.json>');
    process.exit(2);
  }
  runFixture(arg).then((res) => {
    console.log('Result:', res.passed ? 'PASSED' : 'FAILED');
    console.log(res.logs);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
