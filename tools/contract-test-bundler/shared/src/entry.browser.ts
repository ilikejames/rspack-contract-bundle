/**
 * Browser entry point: exports a callable `runContractTests(url?)` instead
 * of auto-running on load and setting `process.exitCode` — a page has
 * neither "run once at import and exit" semantics nor a process to exit.
 * Otherwise mirrors `entry.ts` (the Node/CLI version): same `require.context`
 * test discovery, same `@rstest/core` -> `harness.ts` aliasing requirement
 * (the consuming bundler — this app's rsbuild config — must set that up;
 * see apps/contract-test-runner/rsbuild.config.ts).
 *
 * `require.context`'s own constraints (see entry.ts's comment) apply
 * here too: the directory argument below must stay a literal.
 */
import { setEchoUrl } from '@pack-exp/contract';
import { runAndCollect } from './harness';
import type { CaseResult } from './harness';

// @ts-ignore - require.context is a webpack/rspack build-time API, not a
// real Node/ESM global.
const testContext = require.context(
  '../../../../packages/contract/tests',
  false,
  /\.contract\.test\.ts$/,
);

for (const key of testContext.keys()) {
  testContext(key);
}

export type { CaseResult };

export interface RunContractTestsResult {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  total: number;
  results: CaseResult[];
}

/**
 * Runs every discovered contract test against `url` (if given — otherwise
 * whatever `setEchoUrl`/the environment last left it at) and returns
 * structured results for a UI to render. Safe to call more than once
 * (e.g. a "Run" button clicked repeatedly with a different URL each
 * time): registration happened once at module load; this only re-walks
 * the already-built suite tree.
 */
export async function runContractTests(url?: string): Promise<RunContractTestsResult> {
  if (url) setEchoUrl(url);
  const { tally, results } = await runAndCollect();
  return { ...tally, results };
}
