/**
 * Self-contained demo entry for this package's OWN build/SEA pipeline
 * (rsbuild/build.mjs, sea/build.sh) — proves "bundle a require.context
 * discovered test directory into one zero-dependency file, optionally
 * as a standalone binary" still works, without this package needing to
 * know about any consuming app's real contract tests.
 *
 * A real consumer (see apps/app-1/src/entry.node.ts) writes its own
 * version of this file next to its own tests: require.context's
 * directory argument must be a literal string at the exact call site
 * (see this package's README), so there's no way to parameterize that
 * one line — only to show, here, what it looks like.
 */
import { registerFile, run } from './harness';

// @ts-ignore - require.context is a webpack/rspack build-time API, not a
// real Node/ESM global.
const testContext = require.context('../../fixtures/only-scope/tests', false, /\.test\.ts$/);

for (const key of testContext.keys()) {
  registerFile(() => testContext(key));
}

run().then((code) => {
  process.exitCode = code;
});
