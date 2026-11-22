/**
 * Node/CLI bundle entry point: discovers and runs this app's own real
 * contract tests (src/contracts/*.contract.test.ts), aliasing
 * `@rstest/core` to `@pack-exp/build-contracts`'s harness at build time
 * (see scripts/build-contracts.mjs). Bundled by `npm run build:contracts`
 * into `./dist/contract.bundle.cjs` — a single file a third party can run
 * with nothing but `node` on PATH.
 *
 * Test files are DISCOVERED, not individually hardcoded: `require.context`
 * (webpack's API, which rspack implements too) scans `./contracts` at
 * BUILD time for anything matching `*.contract.test.ts` — the same glob
 * this app's own `rstest.config.ts` uses for its unbundled `npm test`.
 *
 * `require.context`'s directory argument must be a literal string at the
 * exact call site — see @pack-exp/build-contracts's README for why. This
 * file (and entry.browser.ts, its browser counterpart) is the one place
 * in this app that line lives.
 */
import { registerFile, run } from '@pack-exp/build-contracts';

// @ts-ignore - require.context is a webpack/rspack build-time API, not a
// real Node/ESM global.
const testContext = require.context('./contracts', false, /\.contract\.test\.ts$/);

// Each import wrapped in `registerFile` so `.only` scopes to the file
// that uses it, not the whole bundle — see @pack-exp/build-contracts's
// harness.ts for the full story.
for (const key of testContext.keys()) {
  registerFile(() => testContext(key));
}

run().then((code) => {
  process.exitCode = code;
});
