/**
 * The rstest API surface we deliberately DON'T implement: `rs` (mocking,
 * spies, fake timers) and module mocking via `rs.mock()`. Valid rstest
 * usage — passes fine under the real runner — but bundling this file
 * through rsbuild with @rstest/core aliased to our harness must FAIL AT
 * BUILD TIME (not silently, not at runtime): verify.mjs asserts that.
 *
 * `rs.mock()` (the last describe block) is the one case that isn't just
 * "unimplemented" — it's architecturally out of reach for a plain
 * resolve.alias shim. The real thing depends on a compiler transform that
 * hoists the mock call above the file's own imports, rewriting statement
 * order before anything runs; no bundler alias can do that. See the
 * package README.
 */
import { describe, expect, rs, test } from '@rstest/core';
import { greet } from './fixture';

describe('unsupported: rs.fn / rs.spyOn', () => {
  test('rs.fn tracks calls and return value', () => {
    const mock = rs.fn((x: number) => x * 2);
    expect(mock(21)).toBe(42);
    expect(mock).toHaveBeenCalledWith(21);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test('rs.spyOn wraps a real method and restores it', () => {
    const target = { greet };
    const spy = rs.spyOn(target, 'greet');
    target.greet('world');
    expect(spy).toHaveBeenCalledWith('world');
    spy.mockRestore();
  });
});

describe('unsupported: fake timers', () => {
  test('rs.useFakeTimers + advanceTimersByTime fires a pending timeout', () => {
    rs.useFakeTimers();
    const callback = rs.fn();
    setTimeout(callback, 1_000);
    expect(callback).not.toHaveBeenCalled();
    rs.advanceTimersByTime(1_000);
    expect(callback).toHaveBeenCalledTimes(1);
    rs.useRealTimers();
  });
});

rs.mock('./fixture', () => ({ greet: (name: string) => `MOCKED(${name})` }));

describe('unsupported: rs.mock hoisting', () => {
  test('the import above resolved to the mocked module', () => {
    // rs.mock() calls are hoisted by rstest's compiler plugin to run
    // *before* this file's own imports are evaluated, so `greet` (imported
    // at the top of this file) is already the mocked version here.
    expect(greet('world')).toBe('MOCKED(world)');
  });
});
