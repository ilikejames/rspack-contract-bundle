/**
 * Regression test for the claims in the package README about where
 * `shared/src/harness.ts`'s rstest coverage starts and stops. Uses the
 * REAL `@rstest/core` (this file runs under the real rstest runner, same
 * as any other package in the repo) to check our own bundler's behavior
 * from the outside — not something we'd bundle through our own harness.
 *
 * Fixtures: fixtures/boundary/tests/{supported,unsupported}.test.ts, both
 * legitimate rstest usage (that's checked here too, so neither is a
 * strawman).
 *
 *  - supported.test.ts — hooks, nesting, skip/todo/each. Must produce
 *    IDENTICAL pass/fail/skip/todo counts under the real rstest runner
 *    and under our harness (bundled via rsbuild).
 *  - unsupported.test.ts — rs.fn/rs.spyOn/fake timers/rs.mock. Passes
 *    fine under the real runner; bundling it through rsbuild with
 *    @rstest/core aliased to our harness must FAIL AT BUILD TIME, naming
 *    the missing exports. `rs.mock()` specifically depends on a compiler
 *    transform that hoists the mock call above the file's own imports —
 *    architecturally out of reach for a plain resolve.alias shim, not
 *    just unimplemented. See the package README.
 *
 * All real-rstest ground truth is gathered in `beforeAll`, before
 * anything in this file touches rsbuild/rspack. Root cause, since fixed
 * in `buildContractBundle.mjs` itself (not just worked around by this
 * ordering): `rsbuild.build({ mode: 'production' })` sets
 * `process.env.NODE_ENV = 'production'` as a side effect, which a later
 * `execFileSync('npx', ['rstest', ...])` in the same process inherits —
 * and under `NODE_ENV=production`, rstest's own mock-hoisting transform
 * (`rs.mock()`) silently breaks (confirmed by forcing NODE_ENV=production
 * directly against the real CLI, no rsbuild involved: the exact same
 * test that otherwise passes starts failing). `buildContractBundle` now
 * saves and restores `NODE_ENV` around its own build call, so this
 * ordering is no longer load-bearing — kept anyway as the cleaner shape
 * (ground truth first, then the thing being verified against it).
 *
 * `realRstestCounts` forces `--reporter json`, rather than scraping
 * whichever human-readable format rstest's default reporter happens to
 * pick. That default is NOT stable across invocation contexts — it
 * reportedly always failed from one real terminal session (TTY) while
 * passing every time from this non-interactive one, strongly suggesting
 * TTY/env-based reporter auto-selection changes the output shape
 * (markdown-fenced JSON in one case, something else in another). The
 * `json` reporter's output is explicit and stable regardless.
 */
import { afterAll, beforeAll, describe, expect, test } from '@rstest/core';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { buildContractBundle } from '../shared/buildContractBundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures', 'boundary');
const harnessPath = path.join(__dirname, '..', 'shared', 'src', 'harness.ts');
const outDir = path.join(__dirname, 'tmp-boundary');

interface Counts {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  total: number;
}

/** Runs the real rstest CLI on one fixture file and returns its `counts`. */
function realRstestCounts(testFile: string): {
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  todoTests: number;
  tests: number;
} {
  const output = execFileSync('npx', ['rstest', 'run', testFile, '--reporter', 'json'], {
    cwd: fixturesDir,
    encoding: 'utf8',
  });
  // Even with --reporter json, rstest can still print a leading startup
  // banner ("  Rstest vX.Y.Z") to stdout ahead of the actual JSON — seen
  // in an interactive terminal, not reproduced in a non-interactive one,
  // so it's some env/TTY-dependent behavior we don't fully control.
  // Robust fix: parse from wherever the JSON object actually starts,
  // rather than assuming `output` is pure JSON from position 0.
  const jsonStart = output.indexOf('{');
  if (jsonStart === -1) throw new Error(`no JSON object found in rstest output:\n${output}`);
  return JSON.parse(output.slice(jsonStart)).summary;
}

/** Builds `entry` via rsbuild (our harness aliased in) and runs the result. */
async function buildAndRunHarnessBundle(entry: string, filename: string): Promise<Counts> {
  await buildContractBundle({ entry, outDir, filename, harnessPath, shebang: false });
  const bundlePath = path.join(outDir, filename);
  const stdout = execFileSync('node', [bundlePath], { encoding: 'utf8' });
  const match = stdout.match(/(\d+) passed, (\d+) failed, (\d+) skipped, (\d+) todo, (\d+) total/);
  if (!match) throw new Error(`could not find a summary line in bundle output:\n${stdout}`);
  const [, passed, failed, skipped, todo, total] = match.map(Number);
  return { passed, failed, skipped, todo, total } as Counts;
}

let realSupported: Counts;
let realUnsupportedFailedCount: number;
let realUnsupportedTotal: number;

beforeAll(() => {
  const supportedRaw = realRstestCounts('tests/supported.test.ts');
  realSupported = {
    passed: supportedRaw.passedTests,
    failed: supportedRaw.failedTests,
    skipped: supportedRaw.skippedTests,
    todo: supportedRaw.todoTests,
    total: supportedRaw.tests,
  };

  const unsupportedRaw = realRstestCounts('tests/unsupported.test.ts');
  realUnsupportedFailedCount = unsupportedRaw.failedTests;
  realUnsupportedTotal = unsupportedRaw.tests;
});

afterAll(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('supported surface: harness matches real rstest', () => {
  test('pass/fail/skip/todo counts are identical', async () => {
    const harness = await buildAndRunHarnessBundle(
      path.join(fixturesDir, 'entry.supported.ts'),
      'supported.bundle.cjs',
    );
    expect(harness).toEqual(realSupported);
  });
});

describe('unsupported surface: valid usage, fails our build loudly', () => {
  test('is valid rstest usage under the real runner (not a strawman)', () => {
    expect(realUnsupportedFailedCount).toBe(0);
    expect(realUnsupportedTotal).toBeGreaterThan(0);
  });

  test('bundling it through rsbuild fails at build time, naming the missing export', async () => {
    const EXPECTED_MARKERS = [`export 'rs'`, `was not found in '@rstest/core'`];

    // This build is SUPPOSED to fail — that's the assertion. rsbuild
    // prints the (expected) error detail via console.log/console.error,
    // which rstest then dutifully echoes back grouped under this test in
    // its report, making a passing test look alarming. The actual error
    // text is captured separately via buildErrors (see
    // buildContractBundle.mjs's onAfterBuild hook), so console output
    // here is pure noise — silenced for the duration of this one call.
    const originalLog = console.log;
    const originalError = console.error;
    console.log = () => {};
    console.error = () => {};

    let threw = false;
    let buildErrors: string[] = [];
    try {
      await buildContractBundle({
        entry: path.join(fixturesDir, 'entry.unsupported.ts'),
        outDir,
        filename: 'unsupported.bundle.cjs',
        harnessPath,
        shebang: false,
      });
    } catch (error) {
      threw = true;
      buildErrors = (error as { buildErrors?: string[] }).buildErrors ?? [];
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(threw).toBe(true);
    const joined = buildErrors.join('\n');
    for (const marker of EXPECTED_MARKERS) {
      expect(joined).toContain(marker);
    }
  });
});
