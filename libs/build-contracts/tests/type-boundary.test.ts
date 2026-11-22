/**
 * Regression test for a different kind of boundary than boundary.test.ts:
 * type-level assertions (expect-type's expectTypeOf(...).toEqualTypeOf<...>())
 * have ZERO runtime footprint, so neither plain execution nor a bundle can
 * ever catch a wrong one — only `tsc` can.
 *
 * Fixtures: fixtures/type-boundary/probe.types.test.ts (valid usage — must
 * PASS tsc --noEmit) and wrong.types.test.ts (deliberately wrong — asserts
 * add() returns string, not number — must FAIL tsc --noEmit, specifically
 * with a "does not satisfy the constraint" error).
 */
import { describe, expect, test } from '@rstest/core';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures', 'type-boundary');

const TSC_ARGS = [
  'tsc',
  '--noEmit',
  '--strict',
  '--target',
  'es2022',
  '--module',
  'esnext',
  '--moduleResolution',
  'bundler',
];

function typecheck(file: string): { passed: boolean; output: string } {
  // Absolute path: npx does not reliably resolve relative positional args
  // against cwd (same quirk hit with postject in sea/build.sh).
  const absolute = path.join(fixturesDir, file);
  try {
    execFileSync('npx', [...TSC_ARGS, absolute], { cwd: fixturesDir, encoding: 'utf8' });
    return { passed: true, output: '' };
  } catch (error) {
    return { passed: false, output: (error as { stdout?: string }).stdout ?? String(error) };
  }
}

describe('type-level assertions need tsc, not a bundle', () => {
  test('valid usage passes tsc', () => {
    const result = typecheck('probe.types.test.ts');
    expect(result.passed).toBe(true);
  });

  test('deliberately wrong usage fails tsc with the expected constraint error', () => {
    const result = typecheck('wrong.types.test.ts');
    expect(result.passed).toBe(false);
    expect(result.output).toContain('does not satisfy the constraint');
  });
});
