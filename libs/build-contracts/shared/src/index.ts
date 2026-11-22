/**
 * The public "build tool" surface of this lib — what a consuming app's
 * own entry files (its one unavoidable `require.context` call; see this
 * package's README) and its real contract test files import by name.
 *
 * Deliberately separate from `harness.ts`'s OWN exports (`describe`,
 * `test`, `expect`, hooks): those are consumed a different way entirely
 * — aliased in place of `@rstest/core` via a bundler `resolve.alias`
 * pointing at harness.ts's file path, never imported by package name.
 * Mixing the two into one surface would blur which consumption mode a
 * given name is for.
 */
export { registerFile, run, runAndCollect } from './harness';
export type { CaseResult } from './harness';
export { getTestEnv, setTestEnv } from './testEnv';
