// The real deliverable: bundles the contract tests (discovered via
// require.context in shared/src/entry.ts) into one zero-dependency file.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildContractBundle } from '../shared/buildContractBundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shared = path.resolve(__dirname, '..', 'shared', 'src');

await buildContractBundle({
  entry: path.join(shared, 'entry.ts'),
  outDir: path.join(__dirname, 'dist'),
  filename: 'contract.bundle.cjs',
  harnessPath: path.join(shared, 'harness.ts'),
});
