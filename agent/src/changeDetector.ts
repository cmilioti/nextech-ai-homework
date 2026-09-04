import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type ChangeDetectionResult = {
  changedFiles: string[];
  inferredTestTypes: string[];
  repoPath: string;
};

function run(cmd: string, cwd?: string) {
  return execSync(cmd, { cwd, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
}

function inferTypeFromPath(p: string): string | null {
  const s = p.toLowerCase();
  if (s.includes('perf') || s.includes('load') || s.includes('performance')) return 'performance';
  if (s.includes('auth') || s.includes('security') || s.includes('2fa')) return 'security';
  if (s.includes('integration') || s.includes('api')) return 'integration';
  if (s.includes('e2e') || s.includes('playwright') || s.includes('ui') || s.includes('homepage')) return 'functional';
  return null;
}

export async function detectChanges(options: { repoUrl?: string; repoPath?: string; baseRef?: string; headRef?: string; }): Promise<ChangeDetectionResult> {
  const { repoUrl, repoPath, baseRef = 'origin/main', headRef = 'HEAD' } = options;
  let workdir = repoPath || '';
  let shouldCleanup = false;

  if (!workdir) {
    // clone shallow into temp
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    workdir = tmp;
    shouldCleanup = true;
    if (!repoUrl) throw new Error('repoUrl required when repoPath not provided');
    run(`git clone --no-checkout --depth 1 ${repoUrl} ${workdir}`);
    // fetch refs
    try { run(`git -C ${workdir} fetch --all --depth=1`); } catch (e) { /* ignore */ }
  }

  // ensure it's a git repo
  if (!fs.existsSync(path.join(workdir, '.git'))) throw new Error(`${workdir} is not a git repo`);

  // fetch base and head if possible
  try { run(`git -C ${workdir} fetch --all`); } catch (e) { /* ignore */ }

  // get changed files
  let changed: string[] = [];
  try {
    const out = run(`git -C ${workdir} diff --name-only ${baseRef}...${headRef}`);
    changed = out ? out.split('\n').filter(Boolean) : [];
  } catch (e) {
    // fallback: list files in HEAD (useful if clone shallow)
    const out = run(`git -C ${workdir} ls-tree -r --name-only ${headRef}`);
    changed = out ? out.split('\n').filter(Boolean) : [];
  }

  const types = new Set<string>();
  for (const f of changed) {
    const t = inferTypeFromPath(f);
    if (t) types.add(t);
  }

  const result: ChangeDetectionResult = { changedFiles: changed, inferredTestTypes: Array.from(types), repoPath: workdir };

  // don't cleanup here; caller may want to inspect repoPath. If we cloned to temp, note it but keep it.
  return result;
}
