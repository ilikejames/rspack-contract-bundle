import './tests/supported.test';
import { run } from '../../shared/src/harness';

run().then((code) => {
  process.exitCode = code;
});
