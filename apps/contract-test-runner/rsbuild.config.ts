import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
      resolve: {
        // Same two settings contract-test-bundler's own
        // buildContractBundle.mjs needs, and for the same reasons: our
        // source uses explicit `.js`-suffixed relative imports under
        // `verbatimModuleSyntax`, and `@rstest/core` is deliberately
        // aliased to the harness rather than the real package (which only
        // works inside a real rstest worker — see harness.ts's own
        // top comment).
        extensionAlias: {
          '.js': ['.ts', '.js'],
        },
        alias: {
          '@rstest/core': path.join(bundlerShared, 'harness.ts'),
        },
      },
    },
  },
});
