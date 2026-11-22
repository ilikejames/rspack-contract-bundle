/**
 * Browser bundle entry point: exports a callable `runContractTests(url?)`
 * instead of auto-running on load and setting `process.exitCode` — a
 * page has neither "run once at import and exit" semantics nor a process
 * to exit. Otherwise mirrors entry.node.ts: same `require.context` test
 * discovery, same `@rstest/core` -> harness aliasing requirement (set up
 * by this app's own rsbuild.config.ts, shared with scripts/build-contracts.mjs
 * via @pack-exp/build-contracts's `harnessResolveConfig`).
 *
 * This is what `<App>` imports to actually run the tests; the display of
 * the results it collects is a separate concern, owned by
 * @pack-exp/build-contracts/components.
 */
import { registerFile, runAndCollect, setTestEnv } from '@pack-exp/build-contracts';
import type { CaseResult } from '@pack-exp/build-contracts';

// @ts-ignore - require.context is a webpack/rspack build-time API, not a
// real Node/ESM global.
const testContext = require.context('./contracts', false, /\.contract\.test\.ts$/);

for (const key of testContext.keys()) {
  registerFile(() => testContext(key));
}

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
 * whatever was last set) and returns structured results. `onResult`, if
 * given, fires the moment each individual test settles, for progressive
 * rendering.
 */
export async function runContractTests(
  url?: string,
  onResult?: (result: CaseResult) => void,
): Promise<RunContractTestsResult> {
  if (url) setTestEnv({ ECHO_URL: url });
  const { tally, results } = await runAndCollect(onResult);
  return { ...tally, results };
}
