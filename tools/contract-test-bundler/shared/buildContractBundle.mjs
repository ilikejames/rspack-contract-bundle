// Shared rsbuild config used by every "bundle an entry file with
// @rstest/core aliased to our harness" build in this package: the real
// contract bundle (rsbuild/build.mjs) and the self-test verification
// bundles (tests/boundary.test.ts, tests/only-scope.test.ts).
import { createRsbuild } from '@rsbuild/core';
import path from 'node:path';

/**
 * The @rstest/core aliasing + .js->.ts extensionAlias every rspack-based
 * consumer of this harness needs. Factored out so it's defined exactly
 * once — this package's own build (via `buildContractBundle` below) AND
 * the app's `rsbuild.config.ts` (a SEPARATE bundler instance, compiling
 * entry.browser.ts + the harness it aliases to) both need the identical
 * two settings; this used to be hand-copied in both places.
 *
 * @pack-exp/* workspace packages are deliberately NOT included here:
 * npm workspaces already symlinks them into node_modules/@pack-exp/*,
 * and each one's package.json points its `exports` at its own
 * src/index.ts, so plain Node-style resolution (which rspack follows)
 * finds them on its own. Only @rstest/core is aliased — a deliberate
 * substitution (the real package only works inside a real rstest
 * worker — see harness.ts's own top comment), not something to
 * "discover".
 *
 * @param {string} harnessPath - absolute path to harness.ts
 */
export function harnessResolveConfig(harnessPath) {
  return {
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
    alias: {
      '@rstest/core': harnessPath,
    },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.entry - absolute path to the entry .ts file
 * @param {string} opts.outDir - absolute path to the output directory
 * @param {string} opts.filename - output filename, e.g. 'contract.bundle.cjs'
 * @param {string} opts.harnessPath - absolute path to harness.ts, aliased
 *   in place of '@rstest/core'
 * @param {boolean} [opts.shebang] - prepend '#!/usr/bin/env node' (default true)
 */
export async function buildContractBundle({ entry, outDir, filename, harnessPath, shebang = true }) {
  const rsbuild = await createRsbuild({
    cwd: path.dirname(entry),
    rsbuildConfig: {
      mode: 'production',
      source: {
        entry: { main: entry },
      },
      output: {
        target: 'node',
        distPath: { root: outDir },
        filename: { js: filename },
        cleanDistPath: true,
        minify: true,
      },
      tools: {
        rspack: {
          resolve: harnessResolveConfig(harnessPath),
          plugins: shebang
            ? [
                new (await import('@rspack/core')).rspack.BannerPlugin({
                  banner: '#!/usr/bin/env node',
                  raw: true,
                  entryOnly: true,
                }),
              ]
            : [],
        },
      },
    },
  });

  // rsbuild's own error logging goes straight to stdout/stderr and isn't
  // reliably interceptable (rstest wraps those streams itself for its own
  // reporting, which stomps on any monkey-patch of ours — found the hard
  // way). `onAfterBuild` fires even when the build FAILS, with the raw
  // rspack `stats` object, which has the actual structured error messages
  // (e.g. "export 'rs' ... was not found in '@rstest/core'") — surfaced
  // here on the thrown error so callers (tests/boundary.test.ts) can
  // assert on specific failure reasons without scraping console text.
  let buildErrors = [];
  rsbuild.onAfterBuild(({ stats }) => {
    if (!stats) return;
    const statsList = 'stats' in stats ? stats.stats : [stats];
    buildErrors = statsList.flatMap((s) => s.compilation?.errors?.map((e) => e.message) ?? []);
  });

  // `rsbuild.build()` with `mode: 'production'` sets `process.env.NODE_ENV
  // = 'production'` as a side effect of the build itself — NOT scoped to
  // the build, a real mutation of THIS process's environment. Root-caused
  // after a long detour (originally just "reorder your calls and don't
  // ask why"): a later `execFileSync('npx', ['rstest', ...])` in the same
  // process inherits that leaked NODE_ENV=production by default, and
  // under it, rstest's own mock-hoisting transform (`rs.mock()`) silently
  // breaks — not a crash, a WRONG RESULT (confirmed by forcing
  // NODE_ENV=production directly against the real CLI with no rsbuild
  // involved at all: the exact same test that otherwise passes cleanly
  // starts failing). Saving and restoring it here means every current
  // and future caller of this function is safe by construction, rather
  // than needing to remember a call-ordering rule whose cause was a
  // mystery.
  const nodeEnvBefore = process.env.NODE_ENV;
  try {
    const result = await rsbuild.build();
    await result.close();
  } catch (cause) {
    const error = new Error(
      buildErrors.length > 0 ? `Rspack build failed:\n\n${buildErrors.join('\n\n')}` : cause.message,
    );
    error.buildErrors = buildErrors;
    throw error;
  } finally {
    if (nodeEnvBefore === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnvBefore;
  }
}
