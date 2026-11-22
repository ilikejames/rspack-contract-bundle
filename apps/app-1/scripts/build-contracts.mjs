// The real deliverable: bundles this app's own contract tests (discovered
// via require.context in src/entry.node.ts) into one zero-dependency
// file. Uses @pack-exp/build-contracts's shared rsbuild config rather
// than hand-rolling it here — see that package's README for why only
// `@rstest/core` gets aliased.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildContractBundle } from '@pack-exp/build-contracts/build';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// '@pack-exp/build-contracts/build' is the only exported subpath that
// points inside shared/ — harness.ts itself isn't (and shouldn't be)
// part of this package's public `exports` map, so its path is derived
// relative to the one export that is, rather than resolved directly.
const sharedDir = path.dirname(
  fileURLToPath(import.meta.resolve('@pack-exp/build-contracts/build')),
);
const harnessPath = path.join(sharedDir, 'src', 'harness.ts');

await buildContractBundle({
  entry: path.join(__dirname, '..', 'src', 'entry.node.ts'),
  outDir: path.join(__dirname, '..', 'dist'),
  filename: 'contract.bundle.cjs',
  harnessPath,
  // This app's own `npm run build` writes to the SAME ./dist — cleaning
  // it here would wipe that output (or vice versa, depending on run
  // order). See buildContractBundle.mjs's doc comment on this option.
  cleanDistPath: false,
});
