import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { harnessResolveConfig } from '@pack-exp/build-contracts/build';

// '@pack-exp/build-contracts/build' is the only exported subpath that
// points inside shared/ — harness.ts itself isn't part of this package's
// public `exports` map, so its path is derived relative to the one
// export that is, rather than resolved directly (same approach as
// scripts/build-contracts.mjs).
const sharedDir = path.dirname(fileURLToPath(import.meta.resolve('@pack-exp/build-contracts/build')));
const harnessPath = path.join(sharedDir, 'src', 'harness.ts');

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: { index: './src/index.tsx' },
  },
  output: {
    // `build:contracts` (scripts/build-contracts.mjs) writes
    // dist/contract.bundle.cjs into this SAME ./dist — cleaning it here
    // would wipe that file (or vice versa, depending on run order).
    cleanDistPath: false,
  },
  server: {
    port: 3300,
  },
  tools: {
    rspack: {
      // Same resolve config @pack-exp/build-contracts's own
      // buildContractBundle.mjs uses for its builds — shared, not
      // hand-copied, so it can't drift between the two (it did, briefly).
      resolve: harnessResolveConfig(harnessPath),
    },
  },
});
