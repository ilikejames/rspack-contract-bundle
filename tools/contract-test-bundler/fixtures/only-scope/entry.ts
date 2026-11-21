/**
 * Mirrors the real entry.ts's require.context + registerFile pattern
 * exactly (not the single-static-import pattern fixtures/boundary's own
 * entry.supported.ts/entry.unsupported.ts use) — this fixture's whole
 * point is testing per-file `.only` scoping, which only matters when
 * MULTIPLE files are discovered and bundled together.
 */
import { registerFile, run } from '../../shared/src/harness';

// @ts-ignore - require.context is a webpack/rspack build-time API.
const testContext = require.context('./tests', false, /\.test\.ts$/);

for (const key of testContext.keys()) {
  registerFile(() => testContext(key));
}

run().then((code) => {
  process.exitCode = code;
});
