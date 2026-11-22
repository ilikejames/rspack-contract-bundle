/**
 * Generalized config for contract tests, replacing an earlier bespoke
 * `getEchoUrl`/`setEchoUrl` pair that only ever handled one hardcoded
 * value. Any real contract test file might need more than a single URL
 * (an API key, a feature flag, a second endpoint, ...) — this is a plain
 * key/value store any test file can read from, and any consuming app can
 * write to before a run, with no fixed shape baked in on either side.
 *
 * Seeded from `process.env` where that exists (a Node CLI run), so
 * `ECHO_URL=... node contract.bundle.cjs` keeps working exactly like
 * before — a browser has no `process`, so there `setTestEnv(...)` (called
 * from the app's own UI, e.g. a URL textbox) is the only way in.
 */
let testEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' ? { ...process.env } : {};

/** Merges `vars` into the current test environment (does not clear it). */
export function setTestEnv(vars: Record<string, string | undefined>): void {
  testEnv = { ...testEnv, ...vars };
}

/** Reads one value, or `undefined` if it was never set. */
export function getTestEnv(key: string): string | undefined {
  return testEnv[key];
}
