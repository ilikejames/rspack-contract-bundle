/**
 * Drop-in replacement for the `@rstest/core` exports our contract tests use.
 * This is what gets bundled in place of the real test framework so the
 * output has zero npm dependencies *to install*.
 *
 * `expect` is NOT hand-rolled. A first pass did reimplement a handful of
 * matchers (toBe, toEqual, ...) and ran into the obvious problem: that's a
 * bottomless catch-up game against whatever matchers rstest/vitest ship
 * next, with no warning when a test uses one we hadn't gotten to — just a
 * runtime crash in the bundle. Fixed by depending on the real `@vitest/expect`
 * (the same Jest-compatible matcher library `@rstest/core` itself is built
 * on) at BUILD time and letting the bundler inline it.
 *
 * `describe`/`test`/hooks/`run` ARE hand-rolled, extended here from the
 * bare minimum to cover: nested `describe`, `beforeAll`/`afterAll`/
 * `beforeEach`/`afterEach` (with standard outer->inner / inner->outer
 * ordering), `test.skip`, `test.todo`, `test.each` (array-of-tuples form
 * only — not the object-row or tagged-template forms), and a per-test /
 * per-hook timeout.
 *
 * The timeout exists because of a real gap found while testing the network
 * timeout path: the real rstest enforces a `testTimeout` (default 5000ms)
 * at the FRAMEWORK level, independent of whatever the test body does. Our
 * first pass didn't — `run()` just `await`ed the test fn with no outer
 * guard, so a test whose own code never resolves (no self-timeout, a
 * `send` that never gets a reply with nothing to time it out, etc.) would
 * hang the whole bundle forever, with nothing to kill it. `withTimeout`
 * below closes that: every test and every hook races against a timer and
 * loses cleanly with a timeout error if it doesn't settle in time.
 *
 * Deliberately NOT implemented, and NOT planned to be via this approach:
 * `rs`/`rstest` (mocking, spies, fake timers) and especially `rs.mock()`
 * module mocking. The latter isn't just unimplemented — rstest's `rs.mock()`
 * depends on a compiler-level hoisting transform (it rewrites the call to
 * run before the file's own imports, so the mocked module is already in
 * place when those imports evaluate). A plain `resolve.alias` swap, which is
 * this whole harness's mechanism, cannot replicate that: there is no bundler
 * alias that rewrites *call order* inside a file. Supporting it for real
 * would mean shipping an actual rstest/vitest-compatible transform, not
 * swapping a few exports. See tests/boundary.test.ts.
 */
import * as chai from 'chai';
import { JestAsymmetricMatchers, JestChaiExpect, JestExtend } from '@vitest/expect';

chai.use(JestExtend);
chai.use(JestChaiExpect);
chai.use(JestAsymmetricMatchers);

export const expect = chai.expect;

/**
 * Matches real rstest's `TestContext`: `signal` is aborted the moment this
 * attempt times out, so test bodies that hand it to a cancelable operation
 * (an abortable fetch/socket/etc.) can clean that operation up immediately
 * instead of leaving it running in the background after the harness has
 * already moved on. Without this, a timed-out test whose own async work has
 * no way to be told to stop just keeps running — if that work holds open a
 * resource (a socket, its own long internal timer), the whole PROCESS can
 * hang past the point `run()` finished and printed results, until that
 * abandoned work finally settles on its own. Found exactly this way: a test
 * using a deliberately long internal timeout (to force OUR timeout to be
 * the one that fires, not the operation's own) kept the process alive for
 * the length of that internal timeout even after every result had printed.
 */
interface TestContext {
  signal: AbortSignal;
}

type TestFn = (ctx: TestContext) => unknown | Promise<unknown>;
type HookFn = (ctx: TestContext) => unknown | Promise<unknown>;
type TestMode = 'run' | 'skip' | 'todo';

// Matches rstest's own defaults (RstestConfig.testTimeout / .hookTimeout),
// so a test/hook that doesn't specify its own `timeoutMs` behaves the same
// as it would under the real runner.
const DEFAULT_TEST_TIMEOUT_MS = 5_000;
const DEFAULT_HOOK_TIMEOUT_MS = 10_000;

class TestTimeoutError extends Error {}

/**
 * Races `fn(ctx)` against a timer; always clears the timer either way.
 * Aborts `ctx.signal` when the timer wins, so `fn` has a chance to cancel
 * whatever it was waiting on instead of leaving it running unattended.
 */
function withTimeout<T>(
  fn: (ctx: TestContext) => T | Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new TestTimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);
    Promise.resolve()
      .then(() => fn({ signal: controller.signal }))
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

interface TestCase {
  name: string;
  fn?: TestFn;
  mode: TestMode;
  timeoutMs?: number;
}

interface SuiteNode {
  name: string;
  beforeAllHooks: HookFn[];
  afterAllHooks: HookFn[];
  beforeEachHooks: HookFn[];
  afterEachHooks: HookFn[];
  items: Array<{ kind: 'test'; test: TestCase } | { kind: 'suite'; suite: SuiteNode }>;
}

function makeSuite(name: string): SuiteNode {
  return {
    name,
    beforeAllHooks: [],
    afterAllHooks: [],
    beforeEachHooks: [],
    afterEachHooks: [],
    items: [],
  };
}

const root = makeSuite('(root)');
const suiteStack: SuiteNode[] = [root];
const current = (): SuiteNode => suiteStack[suiteStack.length - 1]!;

export function describe(name: string, fn: () => void): void {
  const node = makeSuite(name);
  current().items.push({ kind: 'suite', suite: node });
  suiteStack.push(node);
  try {
    fn();
  } finally {
    suiteStack.pop();
  }
}

function registerTest(
  name: string,
  fn: TestFn | undefined,
  mode: TestMode,
  timeoutMs?: number,
): void {
  current().items.push({ kind: 'test', test: { name, fn, mode, timeoutMs } });
}

/** Minimal jest/vitest-style %s/%d/%i/%f/%j/%% substitution, positional. */
function formatEachName(name: string, row: unknown[]): string {
  let i = 0;
  return name.replace(/%[sdifjo%]/g, (match) => {
    if (match === '%%') return '%';
    const value = row[i++];
    switch (match) {
      case '%s':
        return String(value);
      case '%d':
      case '%i':
        return String(Math.trunc(Number(value)));
      case '%f':
        return String(Number(value));
      case '%j':
      case '%o':
        return JSON.stringify(value);
      default:
        return match;
    }
  });
}

type TestFnWithArgs = (...args: unknown[]) => unknown | Promise<unknown>;

export const test = Object.assign(
  // Jest/rstest-compatible 3rd-arg shorthand: test(name, fn, timeoutMs?).
  (name: string, fn: TestFn, timeoutMs?: number): void =>
    registerTest(name, fn, 'run', timeoutMs),
  {
    skip(name: string, fn?: TestFn): void {
      registerTest(name, fn, 'skip');
    },
    todo(name: string): void {
      registerTest(name, undefined, 'todo');
    },
    each(table: unknown[][]) {
      return (name: string, fn: TestFnWithArgs, timeoutMs?: number): void => {
        for (const row of table) {
          const rowArgs = Array.isArray(row) ? row : [row];
          registerTest(formatEachName(name, rowArgs), () => fn(...rowArgs), 'run', timeoutMs);
        }
      };
    },
  },
);

export function beforeAll(fn: HookFn): void {
  current().beforeAllHooks.push(fn);
}

export function afterAll(fn: HookFn): void {
  current().afterAllHooks.push(fn);
}

export function beforeEach(fn: HookFn): void {
  current().beforeEachHooks.push(fn);
}

export function afterEach(fn: HookFn): void {
  current().afterEachHooks.push(fn);
}

type CaseStatus = 'pass' | 'fail' | 'skip' | 'todo';

const statusMarks: Record<CaseStatus, string> = {
  pass: '✓',
  fail: '✗',
  skip: '-',
  todo: '~',
};

interface Tally {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  total: number;
}

/**
 * One test's outcome, serializable (error is a message string, not an
 * Error object) so it can cross a postMessage/JSON boundary cleanly — a
 * browser UI renders a list of these, not console text.
 */
export interface CaseResult {
  suite: string;
  name: string;
  status: CaseStatus;
  durationMs: number;
  error?: string;
}

/**
 * Prints one result line the moment a test settles, rather than buffering
 * into an array and printing it all after the whole run finishes — so a
 * slow test (test3's genuine ~2s timeout, say) shows up as a pause before
 * ITS line, not as a pause before every line. Also pushes a `CaseResult`
 * into `results`, for callers (a browser UI) that want structured data
 * instead of/as well as the console output.
 */
function report(
  tally: Tally,
  results: CaseResult[],
  suite: string,
  name: string,
  status: CaseStatus,
  durationMs: number,
  error?: Error,
): void {
  console.log(`  ${statusMarks[status]} ${suite} > ${name} (${durationMs}ms)`);
  if (status === 'fail') {
    console.log(`      ${error?.message}`);
    tally.failed += 1;
  } else if (status === 'skip') {
    tally.skipped += 1;
  } else if (status === 'todo') {
    tally.todo += 1;
  } else {
    tally.passed += 1;
  }
  tally.total += 1;
  results.push({ suite, name, status, durationMs, error: error?.message });
}

async function runSuite(
  node: SuiteNode,
  suitePath: string[],
  inheritedBeforeEach: HookFn[],
  inheritedAfterEach: HookFn[],
  tally: Tally,
  results: CaseResult[],
): Promise<void> {
  const path = node.name === '(root)' ? suitePath : [...suitePath, node.name];
  const suiteLabel = path.join(' > ') || '(root)';

  // A throwing beforeAll used to propagate straight out of runSuite,
  // uncaught — crashing the whole bundle (no result line, no summary,
  // raw stack trace) instead of being reported like any other failure.
  // Caught here and reported under a synthetic name; this suite's own
  // tests are skipped (their precondition didn't hold) but the rest of
  // the tree still runs — one broken suite shouldn't take down the run.
  let beforeAllFailed = false;
  for (const hook of node.beforeAllHooks) {
    try {
      await withTimeout(hook, DEFAULT_HOOK_TIMEOUT_MS, 'beforeAll hook');
    } catch (error) {
      report(
        tally,
        results,
        suiteLabel,
        '(beforeAll hook)',
        'fail',
        0,
        error instanceof Error ? error : new Error(String(error)),
      );
      beforeAllFailed = true;
      break;
    }
  }

  try {
    if (beforeAllFailed) return;

    for (const item of node.items) {
      if (item.kind === 'suite') {
        await runSuite(
          item.suite,
          path,
          [...inheritedBeforeEach, ...node.beforeEachHooks],
          [...node.afterEachHooks, ...inheritedAfterEach],
          tally,
          results,
        );
        continue;
      }

      const { test: testCase } = item;

      if (testCase.mode === 'todo') {
        report(tally, results, suiteLabel, testCase.name, 'todo', 0);
        continue;
      }
      if (testCase.mode === 'skip') {
        report(tally, results, suiteLabel, testCase.name, 'skip', 0);
        continue;
      }

      const startedAt = Date.now();
      try {
        for (const hook of [...inheritedBeforeEach, ...node.beforeEachHooks]) {
          await withTimeout(hook, DEFAULT_HOOK_TIMEOUT_MS, 'beforeEach hook');
        }
        await withTimeout(
          testCase.fn!,
          testCase.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
          `test "${testCase.name}"`,
        );
        report(tally, results, suiteLabel, testCase.name, 'pass', Date.now() - startedAt);
      } catch (error) {
        report(
          tally,
          results,
          suiteLabel,
          testCase.name,
          'fail',
          Date.now() - startedAt,
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        for (const hook of [...node.afterEachHooks, ...inheritedAfterEach]) {
          try {
            await withTimeout(hook, DEFAULT_HOOK_TIMEOUT_MS, 'afterEach hook');
          } catch {
            // afterEach failures are swallowed here, same simplification as
            // most minimal runners; the real rstest reports these separately.
          }
        }
      }
    }
  } finally {
    for (const hook of node.afterAllHooks) {
      try {
        await withTimeout(hook, DEFAULT_HOOK_TIMEOUT_MS, 'afterAll hook');
      } catch (error) {
        report(
          tally,
          results,
          suiteLabel,
          '(afterAll hook)',
          'fail',
          0,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }
}

/**
 * Runs every registered test (respecting suite nesting and hooks),
 * printing each result line live as that test settles (see `report`
 * above). Returns both the tally and the full list of `CaseResult`s —
 * re-runnable: nothing here mutates the suite tree itself, so calling
 * this again (a browser "Run" button clicked more than once) re-executes
 * the same registered tests cleanly.
 */
export async function runAndCollect(): Promise<{ tally: Tally; results: CaseResult[] }> {
  const tally: Tally = { passed: 0, failed: 0, skipped: 0, todo: 0, total: 0 };
  const results: CaseResult[] = [];
  await runSuite(root, [], [], [], tally, results);
  return { tally, results };
}

/**
 * CLI entry point: runs everything, prints the blank-line-wrapped summary
 * line, and returns a process exit code (0 = all passed; skipped/todo
 * tests don't count as failures).
 */
export async function run(): Promise<number> {
  console.log('');
  const { tally } = await runAndCollect();
  console.log('');
  console.log(
    `${tally.passed} passed, ${tally.failed} failed, ${tally.skipped} skipped, ${tally.todo} todo, ${tally.total} total`,
  );
  console.log('');

  return tally.failed > 0 ? 1 : 0;
}
