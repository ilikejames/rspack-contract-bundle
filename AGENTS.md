# AGENTS.md

This file is for whoever (human or AI coding agent) picks this repo up
next, most likely to **port the bundling approach into a different,
existing codebase**. It assumes you've never seen this repo before. If
you're an AI agent reading this to help with that port, treat the whole
file as your brief.

## What this repo actually is

A small monorepo scaffold built to answer one question: **can we pack a
set of real integration/contract tests into a single, dependency-free
artifact that a third party can run without installing anything** —
including against a remote endpoint nobody in this repo controls?

Answer: yes, proven three different ways. This repo is the *proof*, not
the destination — the real goal is applying the same approach inside a
bigger, pre-existing codebase with real contract tests.

### The toy example, in one sentence

`packages/contract`'s tests open a WebSocket, send a payload, and check
what comes back. Four test files (`test1`–`test4.contract.test.ts`),
intentionally including one test that's a currently-failing, real
pending feature (not a fake bug) — left in on purpose to prove the whole
pipeline reports failures correctly, not just happy paths.

### The three things that got built around it

1. **A Node CLI bundle** (`tools/contract-test-bundler/`, built with
   **rsbuild**) — packs the tests + everything they depend on into one
   `.cjs` file. `node contract.bundle.cjs` runs it; zero `npm install`
   needed on the machine that runs it.
2. **A standalone executable** (same package, `sea/`) — takes that
   bundle one step further using Node's Single Executable Application
   feature: injects it into a copy of the Node binary itself. Verified to
   run with `PATH=""` and no Node installed at all. Costs ~110MB and a
   platform-specific build step.
3. **A browser page** (`apps/contract-test-runner/`, React) — a text box
   (editable, not just a default) for the target WebSocket URL and a "Run
   contract tests" button. Clicking it runs the *same* real test files,
   in a real browser, against whatever endpoint is in the box. Verified
   end-to-end with Playwright, including that the text box genuinely
   controls the target (typed in an unreachable URL, watched every result
   correctly fail mentioning that exact URL).

All three run the exact same test files, unmodified, and agree on the
result every time: `6 passed, 1 failed, 7 total` against the local dev
fixture.

### The core trick, if you only read one paragraph

`@rstest/core` (the real test framework these tests are written against)
only works inside its own test-runner process — importing it anywhere
else throws immediately. So instead of bundling the real framework, the
bundler **aliases `@rstest/core` to a small hand-written stand-in**
(`shared/src/harness.ts`) at build time. The real test files are bundled
completely unmodified; only where `@rstest/core` resolves to changes.
`describe`/`test`/hooks/timeouts are hand-rolled (small, safe to
maintain); `expect` is **not** hand-rolled — it depends on the real
`@vitest/expect` library at build time instead, so matcher behavior is
never approximated. Read `tools/contract-test-bundler/README.md` for the
full reasoning and the boundaries of what this approach can and can't do
— it's worth reading before you port this, not just this file.

### Dependencies this pulls in, and why each one is there

If you're porting this and wondering "why does a test *bundler* depend on
`chai`?" — here's every non-obvious one, from
`tools/contract-test-bundler/package.json`:

- **`chai` + `@vitest/expect`** (regular `dependencies`, so they get
  bundled *into* the output, not just used while building) — this is the
  real matcher library, explained above. `@vitest/expect` is a Jest-style
  matcher set published as a Chai plugin; `chai` is the assertion engine
  it plugs into. Together they're what makes `expect(x).toBe(y)` etc.
  work for real inside the bundle, instead of us hand-rolling a handful
  of matchers and inevitably falling behind whatever your real test
  framework adds next. This is the single biggest contributor to the
  bundle's size (~150KB, mostly this) — a deliberate trade, not bloat.
- **`@rsbuild/core` + `@rspack/core`** (`devDependencies`) — the actual
  bundler. `@rsbuild/core` is a higher-level config layer over
  `@rspack/core` (the lower-level bundler engine, a Rust-based
  webpack-compatible tool) — our build scripts configure the former,
  which drives the latter underneath. If your target codebase already
  uses a different bundler (webpack, esbuild, vite), the specific config
  in `shared/buildContractBundle.mjs` won't transfer directly, but the
  *pattern* (alias the test framework import, discover test files via a
  context/glob mechanism, bundle for your target) should still apply —
  check whether your bundler has an equivalent to `require.context`.
- **`@rstest/core`** (`devDependency` here, even though it's also what
  gets *aliased away* at bundle time) — needed so this package's own
  self-tests (`npm test`, see `tests/`) can run the REAL test runner to
  check the hand-rolled harness against it. It is never present in the
  actual bundled output.
- **`expect-type`** (`devDependency`) — only used by the type-boundary
  self-test (`tests/type-boundary.test.ts`), which proves that type-level
  assertions can't be verified by any bundle (see Limitations below). Not
  needed at all if you don't use `expect-type`-style type tests in your
  real codebase — safe to drop along with that one test file.
- **`postject`** (`devDependency`) — only used by `sea/build.sh`, to
  inject the bundle into a copy of the Node binary for the standalone
  executable. Not needed if you skip that step.
- **`typescript`** (`devDependency`) — for `npm run typecheck` in this
  package. Nothing exotic; same as any other TS package.

Nothing in that list is a *runtime* dependency of your real application
code — they're either inlined into the output on purpose (`chai`,
`@vitest/expect`) or used only while building/self-testing (everything
else).

## Before you port this anywhere: read these two things

1. **`tools/contract-test-bundler/README.md`** — the real documentation.
   Explains the harness, the bundle, the standalone binary, and —
   important — a whole section on exactly where this approach's coverage
   of the real test framework ends (mocking, fake timers, module mocking)
   and why, verified by `npm test` in that package against the real
   framework, not just asserted.
2. **`apps/contract-test-runner/README.md`** — if you also want the
   browser piece, this explains how it imports the bundler's source
   directly (no separate prebuilt browser artifact) and what had to
   change in `packages/contract` to make a URL textbox work at all
   (`getEchoUrl()`/`setEchoUrl()` instead of a value frozen once at
   startup).

## Porting this into an existing, bigger codebase

Assume your target codebase already has its own real contract-style test
package (possibly several), its own `@rstest/core` or similar test
runner, and its own rspack/rsbuild setup. Here's the order to do this in:

### 1. Copy `tools/contract-test-bundler/` in as a new package

Keep the internal structure (`shared/`, `rsbuild/`, `sea/`, `tests/`,
`fixtures/`). Rename the package in its `package.json` to match your
codebase's naming convention.

### 2. Point it at your real tests — the one line you MUST change

Open `shared/src/entry.ts` (and `shared/src/entry.browser.ts` if you want
the browser piece too). Both call:

```ts
const testContext = require.context(
  '../../../../packages/contract/tests',   // <-- change this
  false,
  /\.contract\.test\.ts$/,                 // <-- and maybe this glob
);
```

Point the first argument at **your** test directory, relative to
`shared/src/`. Change the regex too if your test files aren't named
`*.contract.test.ts`.

**This path has to stay a hardcoded literal.** `require.context` is a
build-time API — the bundler reads that exact string at compile time to
know which files to pull in. We tried making it a variable, and tried a
package-specifier approach instead of a relative path; both either broke
the build outright or (worse) built "successfully" and then threw a
confusing runtime error. There's no cleverer way to do this — just edit
the string. Full story (so you don't have to rediscover it) is in
`tools/contract-test-bundler/README.md`'s "Porting this package
elsewhere" section.

### 3. Rename the scope everywhere

Every file in the copied package references `@pack-exp/*` package names
(imports, `package.json` dependency lists, a couple of code comments).
Grep for `@pack-exp` in the copied package and replace with your real
scope / package names. This is ordinary "renamed a package" work, not
specific to this bundler.

### 4. Check what your real tests actually use

The harness supports: `describe` (including nested), `test`,
`test.skip`, `test.todo`, `test.each` (array-of-tuples form),
`beforeAll`/`afterAll`/`beforeEach`/`afterEach`, and a per-test timeout
(`test(name, fn, timeoutMs)`). `expect` is the real matcher library, so
every matcher your real framework supports also works here.

It does **not** support mocking (`vi.fn`/`rs.fn`, spies, fake timers) or
module mocking (`vi.mock`/`rs.mock`) — and module mocking specifically
never will, for an architectural reason explained in the README (it
depends on a compiler transform this approach doesn't have). If your real
contract tests use any of that, you'll find out immediately: the bundle
build **fails loudly**, naming the exact missing export, rather than
failing silently at runtime. That's by design — a louder failure here is
the point, not a bug to report.

If your contract tests are simple (the kind that mostly assert on real
network/IO responses, which contract tests usually are), this is often a
non-issue. If they're not, you have two honest choices: strip the mocking
out of the subset you're bundling, or treat this as a known limitation
and don't bundle those particular test files.

### 5. Build, then verify against the real thing

From inside the copied package:

```sh
npm install                 # whatever your repo's install step is
npm test                    # runs the bundler's OWN self-tests — confirms
                             # the harness still matches your real test
                             # runner's behavior, using YOUR now-pointed-at
                             # test fixtures. Do this before trusting the bundle.
npm run build                # -> rsbuild/dist/<name>.bundle.cjs
node rsbuild/dist/<name>.bundle.cjs   # run it
```

Compare the bundle's output to running your real tests the normal way
(`your-test-runner run`). They should match exactly — same tests, same
pass/fail, just one faster/portable artifact instead of the other.

**Exit codes work for CI as-is**: both `node .../contract.bundle.cjs` and
the standalone binary exit `0` only if every test passed, `1` if any
failed (`harness.ts`'s `run()` — `tally.failed > 0 ? 1 : 0`). Verified on
both artifacts, not just assumed. Wire either one into your pipeline the
same way you'd wire in any other test command; nothing bundler-specific
needed there.

Optional next steps, in order of effort:

```sh
npm run build:sea             # standalone binary — needs the build above first
./sea/dist/<name>-standalone  # run it, PATH="" works

npm run dev -w <app-name>      # the browser page, if you ported that too
npm run test:e2e -w <app-name> # Playwright — needs Chromium installed once
                                # (npx playwright install chromium)
```

### 6. What NOT to port

`tools/echo-server/` — this is a **local dev-only fixture**, standing in
for whatever real server your real contract tests actually hit. It's not
part of the bundle (nothing in the bundled path ever imports it) and
isn't meant to be. Don't copy it unless you specifically need a local
stand-in server for your own development — your target codebase almost
certainly already has a real equivalent (a staging environment, a mock
server, whatever your contract tests actually point at).

## Where files get generated, and what to `.gitignore`

Everything below is a **build output** — regenerated by running the
relevant command, never meant to be committed. This repo's own
`.gitignore` is two lines at the root that cover all of it (patterns with
no leading slash match at *any* depth, so one root-level `.gitignore`
is enough — no need for one in every subfolder):

```
node_modules/
dist/
```

Concretely, in this repo, that covers:

- `tools/contract-test-bundler/rsbuild/dist/` — the CLI bundle
- `tools/contract-test-bundler/sea/dist/` — the standalone binary (this
  one is ~110MB — be especially sure this never gets committed; verify
  with `git log --all --diff-filter=A --name-only | grep sea/dist` if
  you're ever unsure, same way this history was double-checked here)
- `tools/contract-test-bundler/tests/tmp-boundary/` — scratch output from
  the bundler's own self-tests (cleans itself up via `afterAll`, but
  check it's gone if a test run ever gets killed mid-way)
- `tools/contract-test-bundler/fixtures/boundary/node_modules/` — npm
  creates this because that fixture folder has its own tiny `package.json`
  (needed so the real test runner resolves it as its own project — see
  that package's own README for why)
- `apps/contract-test-runner/dist/` — the built browser page
- every plain `node_modules/` anywhere in the tree

Also add, if you port the browser app (these are app-specific, not
covered by the two generic patterns above):

```
test-results/
playwright-report/
blob-report/
```

**Before your first push**, it's worth confirming none of this ever
slipped into git history already — a large binary committed once stays
in `.git`'s history even after you delete it later, and only a history
rewrite removes it. A quick check:

```sh
git log --all --diff-filter=A --name-only --pretty=format: \
  | grep -E "dist/|node_modules/|\.bundle\.cjs$" | sort -u
# should print nothing

du -sh .git   # should be small (low hundreds of KB for a repo this size)
```

## Honest current limitations

- **Mocking and module mocking aren't supported**, and module mocking
  specifically can't be, with this architecture (see above). If your real
  test suite leans on those, read the boundary documentation before
  assuming this will just work.
- **Type-level test assertions** (`expectTypeOf(...).toEqualTypeOf<...>()`,
  if you use `expect-type` or similar) have zero runtime footprint and
  can never be verified by any bundle — proven by
  `tools/contract-test-bundler/tests/type-boundary.test.ts`. Don't expect
  the bundle to catch a wrong type assertion; it structurally can't.
- **The real test framework itself (rstest, in this repo) has its own
  rough edges** — a genuine upstream bug was found and documented during
  this work (a specific `beforeEach` + `toEqual` combination that breaks
  the real runner, unrelated to anything in this bundler). If your port
  hits something that looks like a framework bug rather than a bundler
  problem, it might genuinely be one — bisect before assuming the
  bundler broke it.
- **The standalone binary only builds for the platform it's built on** —
  no cross-compilation. If you need binaries for multiple OSes/architectures,
  that build step has to run once per target platform.
- **This has only been proven against a small, deliberately simple test
  suite.** A real contract test suite in a bigger codebase will exercise
  far more of the real framework's surface than these four toy test
  files did. Budget time to run the bundler's own self-tests
  (`npm test` in the copied package) against your real fixtures and
  actually look at what fails before trusting the bundle in anything
  that matters.

## If you get stuck

Read the two package READMEs mentioned at the top before asking for
help elsewhere — most "why doesn't this work" questions in this repo's
own history were answered by something already written down in one of
those two files, usually with the exact error message and root cause
already documented next to the fix.
