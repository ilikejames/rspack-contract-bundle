# build-contracts

The reusable bundling tool: packs a `require.context`-discovered set of
contract test files into a single file a third party can run **without
installing anything**, plus a display-only React component for rendering
results. It owns none of the real contract tests itself — that's an
app's job (see `apps/app-1`); this package only supplies the generic
machinery every such app needs.

```
shared/                 "the build tool" — @pack-exp/build-contracts's "." export
  src/harness.ts            @rstest/core replacement, aliased in at build time
  src/testEnv.ts             generic key/value test config (see below)
  src/index.ts               public exports: registerFile, run, runAndCollect,
                              CaseResult, getTestEnv, setTestEnv
  src/entry.ts               THIS package's own self-contained build/SEA demo
                              (bundles fixtures/only-scope/tests, not any real
                              app's contracts — see "Porting" below)
  buildContractBundle.mjs    the rsbuild config, exported as "./build"
components/
  src/index.tsx            "the react components" — @pack-exp/build-contracts/components
                              export: <ContractResults results summary? />, display-only
rsbuild/build.mjs        this package's OWN demo bundle -> rsbuild/dist/contract.bundle.cjs
sea/build.sh             -> sea/dist/contract-standalone (no Node needed either)
tests/                   this package's own test suite (npm test -> rstest run)
fixtures/                test INPUT for tests/ above, and for shared/src/entry.ts's demo
```

## Two entry points

- **`.`** (`shared/src/index.ts`) — the build tool: `registerFile`,
  `run`, `runAndCollect` (from `harness.ts`), `getTestEnv`/`setTestEnv`
  (from `testEnv.ts`), and the `CaseResult` type. A consuming app's own
  entry files (its `require.context` call — see "Porting" below) import
  from here, as do its real contract test files, indirectly, via the
  `@rstest/core` alias.
- **`./components`** (`components/src/index.tsx`) — `<ContractResults />`,
  for rendering results in a UI. Display-only: it takes `results:
  CaseResult[]` and an optional `summary` and renders them, nothing else.
  No run button, no URL input, no state of its own about whether a run is
  in progress — the consuming app owns all of that, including deciding
  *when* to pass `summary` (typically: only once a run has fully
  settled, so it never appears next to a still-partial `results` array).
- **`./build`** (`shared/buildContractBundle.mjs`) — not a runtime
  import; a Node-side helper (`buildContractBundle`, `harnessResolveConfig`)
  a consuming app's own build script and `rsbuild.config.ts` both use to
  bundle their entry files with the same `@rstest/core` aliasing this
  package's own build uses. `react`/`react-dom` are **peerDependencies**:
  this package doesn't ship its own React, the consuming app's copy is
  what actually renders `<ContractResults />`.

## `shared/src/testEnv.ts` — generic test config, not just a URL

Replaces an earlier single-purpose `getEchoUrl`/`setEchoUrl` pair that
could only ever hold one hardcoded value. `setTestEnv({ KEY: value, ... })`
merges arbitrary key/value pairs into a shared store; `getTestEnv(key)`
reads one back. Seeded from `process.env` where that exists (a Node CLI
run, so `ECHO_URL=... node contract.bundle.cjs` works exactly as before);
a browser has no `process`, so there, a consuming app's own UI calling
`setTestEnv(...)` (e.g. from a URL textbox) is the only way in. Neither
this package nor any real contract test needs to know in advance what
keys a given app's tests will want.

## `shared/src/harness.ts` — the `@rstest/core` replacement

Aliased in at bundle time so **the real test files are bundled
unmodified** — only the `@rstest/core` import resolves somewhere else.

`describe`/`test`/hooks/`run` are hand-rolled: nested `describe`,
`beforeAll`/`afterAll`/`beforeEach`/`afterEach` (correct outer->inner /
inner->outer ordering), `test.skip`/`.todo`/`.each`,
`describe.skip`/`.only`/`.each` (array-of-tuples form), `test.only`, and
a per-test / per-hook timeout (`test(name, fn, timeoutMs)`, same
5000ms/10000ms defaults as real rstest).

`.skip` matches real semantics exactly: a skip-marked suite runs **none**
of its hooks, not "run setup then skip the tests" — verified against the
real runner (a `beforeAll` inside a `describe.skip` must never execute).
`.only` is scoped **per file**, not globally across the whole bundle —
confirmed empirically against the real runner before assuming the usual
jest/vitest mental model carried over unchanged: marking `.only` in one
file does NOT affect a sibling file bundled alongside it, but DOES affect
every other top-level `describe` within that SAME file. Since a single
bundle here can span many discovered test files, a naive single global
flag would have been wrong — `registerFile` (called once per file by
every entry point that loops over `require.context().keys()`) establishes
that boundary. `tests/only-scope.test.ts` proves this through the real
bundler with two actual files, not just by reading the code.

A handful of rarer modifiers (`describe`'s `.for`/`.todo`/`.concurrent`/
`.sequential`/`.runIf`/`.skipIf`, `test`'s `.for`/`.fails`/`.concurrent`/
`.sequential`/`.runIf`/`.skipIf`) aren't implemented — calling any of
them throws a clear, named error pointing at this README instead of
crashing with a cryptic `.x is not a function`. That failure mode
distinction matters: a missing rstest EXPORT (`rs.fn`, say) is caught by
rspack's build-time static linking; a missing PROPERTY on an export that
DOES exist (`describe.each`, before it was implemented for real) is
invisible to that check and only surfaces when actually called.

Every test and hook races against its timeout via an
`AbortController` — on timeout, the signal is handed to the test as a
second argument (`async ({ signal }) => ...`), matching real rstest's
`TestContext.signal`, so a test whose own async work supports
cancellation can actually stop it rather than leaving it running in the
background after the harness has already moved on and printed a result.

`expect` is **not** hand-rolled — it depends on the real `@vitest/expect`
(the same Jest-compatible matcher library `@rstest/core` itself is built
on — `chai` + `JestChaiExpect` + `JestAsymmetricMatchers` + `JestExtend`)
at **build** time and lets the bundler inline it. Full real matcher
surface, zero reimplementation, zero catch-up — at the cost of ~145KB of
bundled chai instead of ~1KB of bespoke code.

All of the above is verified line-for-line against the real rstest
runner by `tests/boundary.test.ts` — see below.

## `shared/src/entry.ts` — this package's own demo, not a real app's

This package owns no real contract tests, so this file discovers and
bundles `fixtures/only-scope/tests` instead — enough to prove the whole
pipeline (discovery -> harness -> bundle -> optionally SEA) still works
end to end, fully self-contained, without this package needing to know
about any consuming app's real tests or directory layout. A real
consuming app writes its own version of this file (see
`apps/app-1/src/entry.node.ts`) pointed at its own test directory.

## `rsbuild/` — this package's own demo bundle

`npm run build` -> `rsbuild/dist/contract.bundle.cjs`. Config lives in
`shared/buildContractBundle.mjs` (shared with `tests/boundary.test.ts`
and `tests/only-scope.test.ts`, which need the exact same aliasing to
bundle their own test fixtures, and with any consuming app's own build
script via the `./build` export): `createRsbuild()` targeting
`output.target: 'node'`, `tools.rspack` for the underlying resolve/plugin
config (rsbuild is a config layer over rspack). A
`resolve.extensionAlias: { '.js': ['.ts', '.js'] }` is needed because our
source uses explicit `.js`-suffixed relative imports under
`verbatimModuleSyntax`.

Only **one** alias is configured: `@rstest/core` -> `harness.ts` — a
deliberate substitution, the actual point of this whole setup.
`@pack-exp/*` workspace packages are **not** aliased: npm workspaces
already symlinks them into `node_modules/@pack-exp/*`, and each one's
`package.json` points its `exports` at its own `src/index.ts`, so plain
Node-style resolution (which rspack follows) finds them on its own.

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

This capability is **not** wired into `apps/app-1` at this stage — it
stays here as a standalone demo against this package's own fixtures, not
because it doesn't work, but because it isn't needed yet.

Gotchas hit along the way, left in code comments where they bit:
- `command -v node` resolves to a version-manager shim (asdf/nvm/volta), not
  the real binary — had to use `asdf which node`.
- `npx postject` (and `npx tsc` in `tests/type-boundary.test.ts`) does not
  resolve relative paths against the caller's cwd; every path passed to
  either is absolute.

## Running

```sh
npm run build          # -> rsbuild/dist/contract.bundle.cjs (this package's own demo)
npm run build:sea      # -> sea/dist/contract-standalone (needs the above first)

node rsbuild/dist/contract.bundle.cjs
./sea/dist/contract-standalone

npm test               # -> rstest run; this package's own test suite
```

## `tests/` — this package's own test suite

Real `@rstest/core`, run the normal way (`npm test` -> `rstest run`,
same convention as every other package in this repo) — this package
checking its own correctness from the outside, not something bundled
through its own harness.

### `tests/boundary.test.ts`

Checks that `harness.ts` still covers what the README above says it
covers, and still fails the way it says it fails for everything else.
Fixtures: `fixtures/boundary/tests/{supported,unsupported}.test.ts`, both
legitimate rstest usage (verified against the real runner first, in
`beforeAll`, so neither is a strawman):

- `supported.test.ts` — hooks, nesting, skip/todo/each. Must produce
  IDENTICAL pass/fail/skip/todo counts under the real rstest runner and
  under our harness (bundled via rsbuild).
- `unsupported.test.ts` — `rs.fn`/`rs.spyOn`/fake timers/`rs.mock`.
  Passes fine under the real runner; bundling it through rsbuild (harness
  aliased in) must **fail at build time**, naming the missing exports.

`fixtures/boundary/` has its own `package.json` + `rstest.config.ts`:
without a local `package.json`, rstest misattributes the project root to
a parent directory, and some of its compiler transforms — notably
`rs.mock()`'s hoisting — silently stop applying.

### `tests/type-boundary.test.ts`

A different axis, prompted by real-world use of `expect-type`.
Type-level assertions (`expectTypeOf(...).toEqualTypeOf<...>()`) have
zero runtime footprint, so a bundle (any bundle, ours or not) is provably
blind to whether they're true or false. Fixtures:
`fixtures/type-boundary/{probe,wrong}.types.test.ts`. Checks that
`tsc --noEmit` passes on the valid-usage fixture and fails (specifically
with a "does not satisfy the constraint" error) on the deliberately-wrong
one — the point being that type tests need a `tsc` pass shipped/run
separately; they can't be folded into the runtime bundle.

## Porting / using this package elsewhere

- **The `require.context` call is NOT in this package — it's the one
  thing every consuming app writes for itself**, once per entry point
  (Node + browser), pointed at its own test directory. See
  `apps/app-1/src/entry.node.ts` / `entry.browser.ts`.
  `require.context`'s directory argument must be a literal string at the
  exact call site — rspack statically pattern-matches the call itself at
  build time to know which files to bundle. A referenced constant, a
  package specifier via `node_modules`/`exports` (tried both) — either
  fails the build outright, or (worse) "succeeds" and throws a confusing
  error at runtime instead.
- **`@pack-exp/*` package names** — if renaming this scope, grep for
  `@pack-exp` and update every reference (`package.json` files,
  `buildContractBundle.mjs`-consuming build scripts, etc).
- **Timeout constants** (`harness.ts`'s 5000ms/10000ms) — named constants
  matching real rstest's own defaults (`testTimeout`/`hookTimeout`), not
  arbitrary. Leave them unless your target codebase's rstest config
  overrides those defaults.
