// Importing this at all should fail the BUILD (not run and fail at
// runtime) — see tests/unsupported.test.ts and the package README.
import './tests/unsupported.test';
import { run } from '../../shared/src/harness';

run().then((code) => {
  process.exitCode = code;
});
