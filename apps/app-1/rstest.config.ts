import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['src/contracts/**/*.contract.test.ts'],
  testEnvironment: 'node',
  // Each contract file talks to a live socket, so give it room but never hang.
  testTimeout: 10_000,
});
