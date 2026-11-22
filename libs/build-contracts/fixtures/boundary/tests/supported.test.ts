/**
 * The harness API surface we DO implement (see shared/src/harness.ts):
 * nested describe, hooks, test.skip/.todo/.each. Verified two ways by
 * verify.mjs:
 *  1. against the REAL rstest runner (ground truth — confirms this is
 *     legitimate rstest usage, not a strawman)
 *  2. bundled through rsbuild with @rstest/core aliased to our harness
 * ...then the two result counts are compared.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from '@rstest/core';

describe('supported: hooks, nesting, skip/todo/each', () => {
  // A primitive counter, not an array/object asserted via toEqual — an
  // earlier version mutated a shared array in beforeEach and asserted on
  // it with toEqual, which trips a real upstream bug in rstest 0.12.6
  // (`TypeError: Invalid value used as weak map key`; bisected to exactly
  // that pattern). Confirmed independent of our harness — a bug in the
  // real tool, not something we introduced. Avoided here with toBe.
  let hookRuns = 0;

  beforeAll(() => {
    hookRuns += 100; // distinguishable from beforeEach's +1
  });
  afterAll(() => {});
  beforeEach(() => {
    hookRuns += 1;
  });
  afterEach(() => {});

  test('hooks ran before this test', () => {
    expect(hookRuns).toBe(101); // beforeAll once + beforeEach once
  });

  describe('nested suite', () => {
    test('still inherits the outer hooks', () => {
      expect(hookRuns).toBe(102); // beforeAll + 2x beforeEach across both tests
    });
  });

  test.skip('this one should never run', () => {
    throw new Error('test.skip did not skip');
  });

  test.todo('fill this in later');

  test.each([
    [1, 1, 2],
    [2, 3, 5],
    [10, -1, 9],
  ])('table: %i + %i = %i', (a, b, expected) => {
    expect(a + b).toBe(expected);
  });
});

describe.each([
  [1, 1, 2],
  [2, 3, 5],
])('supported: describe.each sum(%i, %i) = %i', (a, b, expected) => {
  test('adds correctly', () => {
    expect(a + b).toBe(expected);
  });
});

// `.only` isn't exercised here deliberately: it's scoped per FILE (see
// harness.ts's `registerFile`), so marking anything `.only` in THIS file
// would also skip every other test above — that cross-file-vs-same-file
// distinction is exactly what's worth testing in isolation, not mixed in
// here. See tests/only-scope.test.ts + fixtures/boundary/tests/only-scope/.
let skippedSuiteSetupRan = false;

describe.skip('supported: describe.skip skips everything, including hooks', () => {
  beforeAll(() => {
    skippedSuiteSetupRan = true;
  });

  test('this test should never run', () => {
    throw new Error('describe.skip did not skip this test');
  });

  describe('nested inside the skipped suite', () => {
    test('this nested test should never run either', () => {
      throw new Error('describe.skip did not skip a nested suite');
    });
  });
});

describe('supported: confirms the describe.skip above skipped its own hooks too', () => {
  test('beforeAll inside the skipped suite above never ran', () => {
    // Real jest/vitest semantics: .skip means skip ENTIRELY, not "run
    // setup then skip the tests" — if this were ever true, that proves
    // `describe.skip` incorrectly still ran its beforeAll hook.
    expect(skippedSuiteSetupRan).toBe(false);
  });
});
