import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { harnessResolveConfig } from '../../tools/contract-test-bundler/shared/buildContractBundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlerShared = path.resolve(__dirname, '../../tools/contract-test-bundler/shared/src');

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: { index: './src/index.tsx' },
  },
  server: {
    port: 3300,
  },
  tools: {
    rspack: {
      // Same resolve config contract-test-bundler's own
      // buildContractBundle.mjs uses for its builds — shared, not
      // hand-copied, so it can't drift between the two (it did, briefly).
      resolve: harnessResolveConfig(path.join(bundlerShared, 'harness.ts')),
    },
  },
});
