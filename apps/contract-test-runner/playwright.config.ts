import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    // Builds + serves the already-built app — `rsbuild dev` would also
    // work but is noisier and slower to settle for a short-lived test run.
    command: 'npm run build && npm run preview',
    url: 'http://localhost:3300',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:3300',
  },
});
