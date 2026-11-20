// Shared rsbuild config used by every "bundle an entry file with
// @rstest/core aliased to our harness" build in this package: the real
// contract bundle (rsbuild/build.mjs) and the harness-coverage
// verification bundles (verify/harness-coverage/).
import { createRsbuild } from '@rsbuild/core';
import path from 'node:path';

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
          resolve: {
            // @pack-exp/* workspace packages are deliberately NOT aliased:
            // npm workspaces already symlinks them into
            // node_modules/@pack-exp/*, and each one's package.json
            // `exports` points at its own src/index.ts, so plain
            // Node-style resolution (which rspack follows) finds them on
            // its own. Only @rstest/core is aliased — a deliberate
            // substitution, not something to "discover".
            extensionAlias: {
              '.js': ['.ts', '.js'],
            },
            alias: {
              '@rstest/core': harnessPath,
            },
          },
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

  try {
    const result = await rsbuild.build();
    await result.close();
  } catch (cause) {
    const error = new Error(
      buildErrors.length > 0 ? `Rspack build failed:\n\n${buildErrors.join('\n\n')}` : cause.message,
    );
    error.buildErrors = buildErrors;
    throw error;
  }
}
