# contract-test-bundler

Packs `packages/contract`'s tests (`test1`–`test4.contract.test.ts`) plus
their full dependency tree (`contract` -> `network` -> `add`) into a
single file a third party can run **without installing anything**. Built
with **rsbuild** — our actual stack's bundler.

```
shared/                core shared by every build in this package
  src/harness.ts          @rstest/core replacement, aliased in at build time
  src/entry.ts            discovers + runs the contract tests
  buildContractBundle.mjs  the rsbuild config, shared by rsbuild/ and tests/
rsbuild/build.mjs      THE bundle: -> rsbuild/dist/contract.bundle.cjs
sea/build.sh           -> sea/dist/contract-standalone (no Node needed either)
tests/                 THIS package's own test suite (npm test -> rstest run)
  boundary.test.ts        does the harness still match real rstest's API?
  type-boundary.test.ts   do type-level tests still need tsc, not a bundle?
fixtures/              test INPUT for tests/ above — built/typechecked,
                       not executed directly as part of this package's tests
  boundary/               supported.test.ts / unsupported.test.ts
  type-boundary/          probe.types.test.ts / wrong.types.test.ts
```

## `shared/src/harness.ts` — the `@rstest/core` replacement

Aliased in at bundle time so **the real test files are bundled
unmodified** — only the `@rstest/core` import resolves somewhere else.

`describe`/`test`/hooks/`run` are hand-rolled: nested `describe`,
`beforeAll`/`afterAll`/`beforeEach`/`afterEach` (correct outer->inner /
inner->outer ordering), `test.skip`, `test.todo`, `test.each`
(array-of-tuples form), and a per-test / per-hook timeout
(`test(name, fn, timeoutMs)`, same 5000ms/10000ms defaults as real
rstest). Every test and hook races against that timeout via an
`AbortController` — on timeout, the signal is handed to the test as a
second argument (`async ({ signal }) => ...`), matching real rstest's
`TestContext.signal`, so a test whose own async work supports
cancellation can actually stop it rather than leaving it running in the
background after the harness has already moved on and printed a result.
(Found the hard way: without this, a timed-out test using a long-lived
socket kept the whole process alive for however long THAT socket's own
timeout was, well after every result had already printed.)

`expect` is **not** hand-rolled. A first pass did reimplement a handful
of matchers (`toBe`, `toEqual`, ...) and ran into the obvious problem:
that's a bottomless catch-up game against whatever matchers rstest/vitest
ship next. Fixed by depending on the real `@vitest/expect` (the same
Jest-compatible matcher library `@rstest/core` itself is built on —
`chai` + `JestChaiExpect` + `JestAsymmetricMatchers` + `JestExtend`) at
**build** time and letting the bundler inline it. Full real matcher
surface, zero reimplementation, zero catch-up — at the cost of ~145KB of
bundled chai instead of ~1KB of bespoke code.

All of the above is verified line-for-line against the real rstest
runner by `tests/boundary.test.ts` — see below.

## `shared/src/entry.ts` — discovery, not a hardcoded list

Test files are **discovered**, not individually imported:
`require.context()` (webpack's API; rspack implements it too) scans
`packages/contract/tests/` for `*.contract.test.ts` at build time — the
same glob rstest's own config uses — and imports whatever matches. No
per-file import line to remember to add, no codegen pre-step.

`ctx.keys()` lists the matched module ids; calling `ctx(key)` for each
imports it (registering its suites), then `harness.run()` executes
everything, printing each result line the moment that test settles (not
buffered to the end), then a summary, then sets the process exit code
(0 = all passed).

## `rsbuild/` — the bundle

`npm run build` -> `rsbuild/dist/contract.bundle.cjs`. Config lives in
`shared/buildContractBundle.mjs` (shared with `tests/boundary.test.ts`,
which needs the exact same aliasing to bundle its own test fixtures):
`createRsbuild()` targeting `output.target: 'node'`, `tools.rspack` for
the underlying resolve/plugin config (rsbuild is a config layer over
rspack). No HTML plugin, no dev server — just a single Node bundle. A
`resolve.extensionAlias: { '.js': ['.ts', '.js'] }` is needed because our
source uses explicit `.js`-suffixed relative imports under
`verbatimModuleSyntax`.

Only **one** alias is configured: `@rstest/core` -> `harness.ts` — a
deliberate substitution, the actual point of this whole setup. The
`@pack-exp/*` workspace packages (`network`, `add`) are **not** aliased:
npm workspaces already symlinks them into `node_modules/@pack-exp/*`, and
each one's `package.json` points its `exports` at its own `src/index.ts`,
so plain Node-style resolution — which rspack follows — finds them on its
own.

Single `.cjs` file (~150KB, mostly `chai`) with a `#!/usr/bin/env node`
banner: runnable as `node contract.bundle.cjs` or, once `chmod +x`'d,
standalone as `./contract.bundle.cjs`. Zero npm dependencies to *install*
in the output. Node itself must still be on PATH.

## `sea/` — genuinely standalone (no Node required either)

`npm run build:sea` takes the rsbuild bundle and goes one step further:
uses Node's Single Executable Application feature
(`--experimental-sea-config` + `postject`) to inject it into a copy of
the Node binary itself, producing `sea/dist/contract-standalone` — a real
Mach-O/ELF/PE executable. Verified to run with `PATH=""` and no `node`
reachable at all. Cost: a ~110MB binary (it's a full Node runtime) and a
platform-specific build (macOS needs `codesign --remove-signature` /
re-sign around the injection step; other OSes/architectures need their
own build run on that platform — there's no cross-compilation here).

Gotchas hit along the way, left in code comments where they bit:
- `command -v node` resolves to a version-manager shim (asdf/nvm/volta), not
  the real binary — had to use `asdf which node`.
- `npx postject` (and `npx tsc` in `tests/type-boundary.test.ts`) does not
  resolve relative paths against the caller's cwd; every path passed to
  either is absolute.

## Running

```sh
# with tools/echo-server running on ws://127.0.0.1:8787
npm run build          # -> rsbuild/dist/contract.bundle.cjs
npm run build:sea      # -> sea/dist/contract-standalone (needs the above first)

node rsbuild/dist/contract.bundle.cjs
./sea/dist/contract-standalone
```

Each one: 6 passed / 1 failed with the echo server up, exit code 1 (takes
~4s total — `test3` and `test4`'s genuine 2s timeouts each dominate their
own moment). The one real failure (`test4`'s ping/pong test, a pending
feature) is left in deliberately, and shows execution continuing cleanly
right past it (its own second test passes immediately after). With the
echo server fully down: 1 passed / 6 failed, instant. Never crashes
either way.

## `tests/` — this package's own test suite

```sh
npm test   # -> rstest run; both checks below
```

Real `@rstest/core`, run the normal way (same `npm test` -> `rstest run`
convention as every other package in the repo) — this package checking
its own correctness from the outside, not something bundled through its
own harness.

### `tests/boundary.test.ts`

Checks that `harness.ts` still covers what the README above says it
covers, and still fails the way it says it fails for everything else.
Fixtures: `fixtures/boundary/tests/{supported,unsupported}.test.ts`, both
legitimate rstest usage (verified against the real runner first, in
`beforeAll`, so neither is a strawman):

- `supported.test.ts` — hooks, nesting, skip/todo/each. Must produce
  IDENTICAL pass/fail/skip/todo counts under the real rstest runner and
  under our harness (bundled via rsbuild). Also where a real upstream
  rstest 0.12.6 bug was found and bisected: `beforeEach` mutating a shared
  array, asserted on with `toEqual`, throws `TypeError: Invalid value
  used as weak map key` in the REAL runner — confirmed independent of our
  harness. Worked around with a counter + `toBe`, noted in the file.
- `unsupported.test.ts` — `rs.fn`/`rs.spyOn`/fake timers/`rs.mock`.
  Passes fine under the real runner; bundling it through rsbuild (harness
  aliased in) must **fail at build time**, naming the missing exports.
  `rs.mock()` specifically isn't just unimplemented — it depends on a
  compiler transform that hoists the mock call above the file's own
  imports, rewriting statement order before anything runs. No bundler
  alias can do that; supporting it for real would mean shipping an actual
  rstest/vitest-compatible transform. The missing-export message is
  pulled from rspack's structured `stats.compilation.errors` (via an
  `onAfterBuild` hook in `buildContractBundle.mjs`), not scraped from
  console output — found that rstest wraps `process.stdout`/`stderr` for
  its own reporting in a way that stomps on any monkey-patch of those
  streams from inside a test.

All real-rstest ground truth (both fixture files) is gathered in this
file's `beforeAll`, before anything touches rsbuild/rspack — running an
rsbuild build earlier in the same process was found to leak something
into `process.env` that confuses a later `execFileSync('npx', ['rstest',
...])` child into a wrong result for the exact same command. Keeping the
phases separated sidesteps it.

`fixtures/boundary/` has its own `package.json` + `rstest.config.ts`:
without a local `package.json`, rstest misattributes the project root to
a parent directory, and some of its compiler transforms — notably
`rs.mock()`'s hoisting — silently stop applying. Found the hard way.

### `tests/type-boundary.test.ts`

A different axis, prompted by real-world use of `expect-type`.
Type-level assertions (`expectTypeOf(...).toEqualTypeOf<...>()`) have
zero runtime footprint, so a bundle (any bundle, ours or not) is provably
blind to whether they're true or false. Fixtures:
`fixtures/type-boundary/{probe,wrong}.types.test.ts`. Checks that
`tsc --noEmit` passes on the valid-usage fixture and fails (specifically
with a "does not satisfy the constraint" error) on the deliberately-wrong
one — the point being that type tests need a `tsc` pass shipped/run
separately; they can't be folded into the runtime bundle. If you actually
use `expect-type` in a real test suite: run its typecheck as its own
step, never inside whatever bundles/runs your runtime tests.

## Porting this package elsewhere

What you'll need to touch, and why each is what it is:

- **`shared/src/entry.ts`'s `require.context('../../../../packages/contract/tests', ...)`**
  — the one genuinely unavoidable hardcoded path. `require.context`'s
  directory argument must be a literal string at the exact call site;
  rspack statically pattern-matches the call to know what to bundle. A
  referenced constant, a package specifier via `node_modules`/`exports`
  (tried both) — either fails the build outright, or (worse) "succeeds"
  and throws a confusing error at runtime instead. Point it at your own
  test directory; there's no config knob to add here that wouldn't just
  be a worse version of editing this one line.
- **`@pack-exp/*` package names** — `shared/buildContractBundle.mjs`,
  `package.json` files, and every test/source file's imports reference
  this scope. Ordinary consequence of renaming packages, not a design
  flaw — grep for `@pack-exp` and update to your own scope.
- **`tools/echo-server`'s port/host and `packages/contract`'s
  `DEFAULT_ECHO_URL`** — already environment-overridable
  (`ECHO_URL`/`ECHO_PORT`/`ECHO_HOST`), just has a hardcoded *default*
  pointing at `127.0.0.1:8787`. Nothing to change unless you want a
  different default.
- **Timeout constants** (`harness.ts`'s 5000ms/10000ms, `network`'s
  2000ms) — named constants matching real rstest's own defaults
  (`testTimeout`/`hookTimeout`), not arbitrary. Leave them unless your
  target codebase's rstest config overrides those defaults, in which case
  match whatever it uses.
- **`fixtures/type-boundary/*.types.test.ts`'s relative imports** to
  `packages/add`/`packages/network` — these are demo/reference fixtures,
  not the real deliverable; same monorepo-depth coupling as the
  `entry.ts` path above, but lower stakes, since this whole directory
  exists to be edited/replaced with YOUR real type-level tests anyway.
