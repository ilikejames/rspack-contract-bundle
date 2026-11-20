import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['tests/**/*.test.ts'],
  testEnvironment: 'node',
  // boundary.test.ts shells out to rstest + builds through rsbuild twice;
  // generous but not unbounded.
  testTimeout: 30_000,
});
