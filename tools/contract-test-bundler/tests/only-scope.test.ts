/**
 * Regression test for `.only`'s scoping: real rstest scopes `.only` to
 * the FILE it's used in, not globally across a whole run — confirmed
 * empirically (a sibling file's unmarked test is unaffected; a SEPARATE
 * top-level `describe` in the SAME file is affected). Since this
 * bundler's own suite tree spans every file `require.context` discovers,
 * a single global flag would incorrectly leak `.only` across files —
 * `harness.ts`'s `registerFile` fixes that per-file scoping; this test
 * proves it through the REAL bundler, not just by reading the code.
 *
 * Fixtures: fixtures/only-scope/tests/{fileA,fileB}.test.ts, bundled
 * together via fixtures/only-scope/entry.ts (which mirrors the real
 * entry.ts's require.context + registerFile loop — the single-file
 * `import './tests/x'` pattern the other fixtures use wouldn't exercise
 * cross-file scoping at all).
 */
import { beforeAll, describe, expect, test } from '@rstest/core';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { buildContractBundle } from '../shared/buildContractBundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '..', 'fixtures', 'only-scope');
const harnessPath = path.join(__dirname, '..', 'shared', 'src', 'harness.ts');
const outDir = path.join(__dirname, 'tmp-only-scope');

interface Counts {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  total: number;
}

let realCounts: Counts;

// Real rstest ground truth gathered FIRST, before anything touches
// rsbuild/rspack in this process — see boundary.test.ts's comment for
// why that ordering matters (an rsbuild build earlier in the same
// process was found to leak something into process.env that confuses a
// later execFileSync('npx', ['rstest', ...]) child).
beforeAll(() => {
  const output = execFileSync(
    'npx',
    ['rstest', 'run', 'tests/fileA.test.ts', 'tests/fileB.test.ts', '--reporter', 'json'],
    { cwd: fixtureDir, encoding: 'utf8' },
  );
  const jsonStart = output.indexOf('{');
  if (jsonStart === -1) throw new Error(`no JSON object found in rstest output:\n${output}`);
  const summary = JSON.parse(output.slice(jsonStart)).summary;
  realCounts = {
    passed: summary.passedTests,
    failed: summary.failedTests,
    skipped: summary.skippedTests,
    todo: summary.todoTests,
    total: summary.tests,
  };
});

test('ground truth: one file\'s .only does not leak into a sibling file', () => {
  // 4 tests total: fileA's marked-only test passes, its two unmarked
  // tests (one in the SAME describe, one in a SEPARATE top-level
  // describe in the SAME file) are skipped, fileB's test passes
  // untouched. If this assertion itself ever fails, the FIXTURE's
  // expectations are wrong, not the harness — fix the fixture first.
  expect(realCounts).toEqual({ passed: 2, failed: 0, skipped: 2, todo: 0, total: 4 });
});

describe('harness matches real rstest', () => {
  test('bundled through the real entry.ts-style require.context + registerFile pattern', async () => {
    await buildContractBundle({
      entry: path.join(fixtureDir, 'entry.ts'),
      outDir,
      filename: 'only-scope.bundle.cjs',
      harnessPath,
      shebang: false,
    });
    const stdout = execFileSync('node', [path.join(outDir, 'only-scope.bundle.cjs')], {
      encoding: 'utf8',
    });
    const match = stdout.match(/(\d+) passed, (\d+) failed, (\d+) skipped, (\d+) todo, (\d+) total/);
    if (!match) throw new Error(`could not find a summary line in bundle output:\n${stdout}`);
    const [, passed, failed, skipped, todo, total] = match.map(Number);
    expect({ passed, failed, skipped, todo, total }).toEqual(realCounts);

    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
