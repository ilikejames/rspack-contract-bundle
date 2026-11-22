import { defineConfig } from '@rstest/core';

// Ground truth: both files are real, valid rstest usage. Run directly
// against the real runner (verify.mjs shells out to `rstest run`) to get
// the counts our harness's output is compared against.
export default defineConfig({
  include: ['tests/**/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 5_000,
});
