/**
 * Shared bundle entry point used by every bundler experiment.
 *
 * Test files are DISCOVERED, not individually hardcoded: `require.context`
 * (webpack's API, which rspack implements too) scans the directory and
 * matches the same glob rstest itself uses for this package
 * (`tests/**\/*.contract.test.ts`, see packages/contract/rstest.config.ts)
 * at BUILD time — the file list is resolved by the bundler, not by a
 * separate codegen pre-step, and not by us remembering to add an import
 * every time a new test*.contract.test.ts file shows up.
 *
 * `ctx.keys()` returns the matched module ids; calling `ctx(key)` for each
 * imports it, which registers its suites (describe/test calls run
 * synchronously at import time). We then run everything that got queued.
 *
 * Each import is wrapped in `registerFile` so `.only` is scoped to the
 * file that uses it, matching real rstest — confirmed empirically that
 * one file's `.only` must NOT affect a sibling file's tests. See
 * `harness.ts`'s `registerFile` for the full story.
 *
 * `@rstest/core` is aliased to `./harness.ts` by each bundler's config, so
 * the test files themselves stay untouched.
 */
import { registerFile, run } from './harness';

// ⚠️ PORTING THIS PACKAGE: this path is the one thing you must update.
// `require.context`'s directory argument MUST be a literal string (not a
// variable, not a template, not a package specifier resolved via
// node_modules/exports) — rspack statically pattern-matches the call
// itself at build time to know which files to pull in, and anything else
// either fails the build outright or (worse) builds "successfully" and
// throws at RUNTIME with a confusing "ctx.context is not a function"
// (confirmed empirically — tried a referenced const, tried a package
// specifier + an `exports` subpath wildcard for it; both dead ends, see
// the package README). There is no way around hardcoding this one line.
// @ts-ignore - require.context is a webpack/rspack build-time API, not a
// real Node/ESM global.
const testContext = require.context(
  '../../../../packages/contract/tests',
  false,
  /\.contract\.test\.ts$/,
);

for (const key of testContext.keys()) {
  registerFile(() => testContext(key));
}

run().then((code) => {
  process.exitCode = code;
});
