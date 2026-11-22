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

### Layout

```
apps/app-1          React app — OWNS its real contract tests
                     (src/contracts/*.contract.test.ts), the
                     require.context call that discovers them
                     (src/entry.node.ts / entry.browser.ts), the URL
                     textbox + run button, and bundling them into
                     ./dist/contract.bundle.cjs
libs/add             lib — add(a, b)
libs/network         lib — echo(url, payload) over a WebSocket (depends on add)
libs/build-contracts the reusable bundler — the @rstest/core replacement,
                     the bundler config, and a display-only React
                     component. Owns NO real contract tests and no
                     require.context call of its own (see below) — it
                     exists to be imported by an app like app-1, not to
                     bundle anything by itself.
libs/echo-server     dev-only ws echo service (NOT part of any test bundle)
```

The split matters for porting: **`libs/build-contracts` is the generic,
reusable package** (copy this one into your target codebase, mostly
unchanged); **`apps/app-1` is the example of how to USE it** (your real
app, with its real contract tests, looks like this, not like
`build-contracts`).

### The toy example, in one sentence

`apps/app-1/src/contracts/`'s tests open a WebSocket, send a payload, and
check what comes back. Four test files (`test1`–`test4.contract.test.ts`),
intentionally including one test that's a currently-failing, real
pending feature (not a fake bug) — left in on purpose to prove the whole
pipeline reports failures correctly, not just happy paths.

### The three things that got built around it

1. **A Node CLI bundle** (`apps/app-1/scripts/build-contracts.mjs`, using
   `libs/build-contracts`, built with **rsbuild**) — packs the tests +
   everything they depend on into one `.cjs` file,
   `apps/app-1/dist/contract.bundle.cjs`. `node contract.bundle.cjs` runs
   it; zero `npm install` needed on the machine that runs it.
2. **A standalone executable** (`libs/build-contracts/sea/`) — takes a
   bundle one step further using Node's Single Executable Application
   feature: injects it into a copy of the Node binary itself. Verified to
   run with `PATH=""` and no Node installed at all. Costs ~110MB and a
   platform-specific build step. Currently wired only against
   `build-contracts`'s own self-contained demo, not against `app-1` — see
   that package's README.
3. **A browser page** (`apps/app-1`, React) — a text box (editable, not
   just a default) for the target WebSocket URL and a "Run contract
   tests" button. Clicking it runs the *same* real test files, in a real
   browser, against whatever endpoint is in the box. Verified end-to-end
   with Playwright, including that the text box genuinely controls the
   target (typed in an unreachable URL, watched every result correctly
   fail mentioning that exact URL).

All three run the exact same test files, unmodified, and agree on the
result every time: `6 passed, 1 failed, 7 total` against the local dev
fixture.

### The core trick, if you only read one paragraph

`@rstest/core` (the real test framework these tests are written against)
only works inside its own test-runner process — importing it anywhere
else throws immediately. So instead of bundling the real framework, the
bundler **aliases `@rstest/core` to a small hand-written stand-in**
(`libs/build-contracts/shared/src/harness.ts`) at build time. The real
test files are bundled completely unmodified; only where `@rstest/core`
resolves to changes. `describe`/`test`/hooks/timeouts are hand-rolled
(small, safe to maintain); `expect` is **not** hand-rolled — it depends
on the real `@vitest/expect` library at build time instead, so matcher
behavior is never approximated. Read `libs/build-contracts/README.md`
for the full reasoning and the boundaries of what this approach can and
can't do — it's worth reading before you port this, not just this file.

### Where the `require.context` call lives — and why it's NOT in the lib

Every consuming app writes its **own** `require.context('./contracts',
...)` call, once per entry point (Node + browser) — see
`apps/app-1/src/entry.node.ts` / `entry.browser.ts`. `libs/build-contracts`
has no opinion on where an app's tests live; it only supplies what those
entry files import (`registerFile`, `run`, `runAndCollect`). This isn't
an arbitrary split — `require.context`'s directory argument must be a
literal string at the exact call site (see below), so there is no way
for a shared lib to take "your test directory" as a parameter. The call
site has to live next to whoever actually knows that path, which is the
app, not the lib.

### Config: `getTestEnv`/`setTestEnv`, not a single hardcoded URL

`libs/build-contracts` exports a generic key/value test-config store
(`shared/src/testEnv.ts`): `setTestEnv({ KEY: value, ... })` merges
values in, `getTestEnv(key)` reads one back. Seeded from `process.env`
where that exists (a Node CLI run), so `ECHO_URL=... node
contract.bundle.cjs` keeps working as an env var; a browser has no
`process`, so there an app's own UI (a URL textbox, say) calls
`setTestEnv(...)` instead. This replaced an earlier, narrower
`getEchoUrl`/`setEchoUrl` pair that could only ever hold one fixed value
— a real contract test suite usually needs more than a URL (an API key,
a feature flag, a second endpoint...), and the lib shouldn't need to know
in advance what an app's tests will want.

### Dependencies this pulls in, and why each one is there

If you're porting this and wondering "why does a test *bundler* depend on
`chai`?" — here's every non-obvious one, from
`libs/build-contracts/package.json`:

- **`chai` + `@vitest/expect`** (regular `dependencies`, so they get
  bundled *into* the output, not just used while building) — this is the
  real matcher library, explained above. `@vitest/expect` is a Jest-style
  matcher set published as a Chai plugin; `chai` is the assertion engine
  it plugs into. Together they're what makes `expect(x).toBe(y)` etc.
  work for real inside the bundle, instead of us hand-rolling a handful
  of matchers and inevitably falling behind whatever your real test
  framework adds next. This is the single biggest contributor to the
  bundle's size (~150KB, mostly this) — a deliberate trade, not bloat.
- **`react` + `react-dom`** (`peerDependencies`) — only needed by the
  `./components` export (`<ContractResults />`); the consuming app
  supplies its own copy, this package ships none of its own.
- **`@rsbuild/core` + `@rspack/core`** (`devDependencies`) — the actual
  bundler. `@rsbuild/core` is a higher-level config layer over
  `@rspack/core` (the lower-level bundler engine, a Rust-based
  webpack-compatible tool) — build scripts configure the former, which
  drives the latter underneath. If your target codebase already uses a
  different bundler (webpack, esbuild, vite), the specific config in
  `shared/buildContractBundle.mjs` won't transfer directly, but the
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
  assertions can't be verified by any bundle (see Limitations below).
- **`postject`** (`devDependency`) — only used by `sea/build.sh`, to
  inject the bundle into a copy of the Node binary for the standalone
  executable. Not needed if you skip that step.
- **`typescript`** (`devDependency`) — for `npm run typecheck` in this
  package. Nothing exotic; same as any other TS package.

Nothing in that list is a *runtime* dependency of your real application
code — they're either inlined into the output on purpose (`chai`,
`@vitest/expect`), supplied by the consuming app (`react`/`react-dom`),
or used only while building/self-testing (everything else).

## Before you port this anywhere: read these two things

1. **`libs/build-contracts/README.md`** — the real documentation.
   Explains the harness, the two package entry points, the bundle, the
   standalone binary, and — important — a whole section on exactly where
   this approach's coverage of the real test framework ends (mocking,
   fake timers, module mocking) and why, verified by `npm test` in that
   package against the real framework, not just asserted.
2. **`apps/app-1/README.md`** — the example of how to consume the lib:
   owning your own contract tests, your own `require.context` entry
   files, your own URL textbox UI around the lib's display-only results
   component, and your own build script producing
   `./dist/contract.bundle.cjs`.

## Porting this into an existing, bigger codebase

Assume your target codebase already has its own real contract-style test
files (possibly several), its own `@rstest/core` or similar test runner,
and its own rspack/rsbuild setup. Here's the order to do this in:

### 1. Copy `libs/build-contracts/` in as a new package, unchanged

Keep the internal structure (`shared/`, `components/`, `rsbuild/`, `sea/`,
`tests/`, `fixtures/`). Rename the package in its `package.json` to
match your codebase's naming convention. This package needs no changes
for YOUR test directory or test files — it has no opinion on either.

### 2. In YOUR app, write your own entry files — the one thing you MUST add

Your app (not the copied lib) needs its own version of
`apps/app-1/src/entry.node.ts` / `entry.browser.ts`:

```ts
import { registerFile, run } from '<your-build-contracts-package>';

const testContext = require.context(
  './contracts',            // <-- your test directory, relative to this file
  false,
  /\.contract\.test\.ts$/,  // <-- and maybe this glob
);

for (const key of testContext.keys()) {
  registerFile(() => testContext(key));
}

run().then((code) => {
  process.exitCode = code;
});
```

**This path has to stay a hardcoded literal.** `require.context` is a
build-time API — the bundler reads that exact string at compile time to
know which files to pull in. We tried making it a variable, and tried a
package-specifier approach instead of a relative path; both either broke
the build outright or (worse) built "successfully" and then threw a
confusing runtime error. There's no cleverer way to do this — just write
the string in your own entry file, next to your own tests.

### 3. Rename the scope everywhere

Every file in the copied package references `@pack-exp/*` package names
(imports, `package.json` dependency lists, a couple of code comments).
Grep for `@pack-exp` in the copied package and replace with your real
scope / package names. This is ordinary "renamed a package" work, not
specific to this bundler.

### 4. Check what your real tests actually use

The harness supports: `describe`/`it`/`test` (`it` is a plain alias for
`test`, same as jest/mocha/vitest — if your real tests use `it`
exclusively and never write `test`, that's fine, it's the same object),
including nested `describe`; `test.skip`/`.todo`/`.each`;
`describe.skip`/`.only`/`.each` (array-of-tuples form); `test.only`;
`beforeAll`/`afterAll`/`beforeEach`/`afterEach`; `assert` (chai's,
alongside `expect`); and a per-test timeout (`test(name, fn, timeoutMs)`).
`expect` is the real matcher library, so every matcher your real
framework supports also works here. `.skip` matches real semantics
exactly (a skipped suite runs **none** of its hooks — verified against
the real runner, not assumed). `.only` is scoped **per file**, matching
real rstest — confirmed empirically that it doesn't leak across files
bundled together, found the hard way that a naive single global flag
would have been wrong here.

It does **not** support mocking (`vi.fn`/`rs.fn`, spies, fake timers),
module mocking (`vi.mock`/`rs.mock` — never will, architectural reason in
the README), or the rarer modifiers (`.for`, `.concurrent`, `.sequential`,
`.runIf`, `.skipIf`, test's `.fails`, describe's `.todo`). If your real
contract tests use any of the first group, you'll find out immediately:
the bundle build **fails loudly**, naming the exact missing export,
rather than failing silently at runtime. The second group (missing
*properties* on an export that does exist, like `describe.each` before it
was implemented) can't be caught that way — those throw a clear, named
error instead, but only once actually called, not at build time. Either
way: loud and named, by design, never silent.

If your contract tests are simple (the kind that mostly assert on real
network/IO responses, which contract tests usually are), this is often a
non-issue. If they're not, you have two honest choices: strip the mocking
out of the subset you're bundling, or treat this as a known limitation
and don't bundle those particular test files.

### 5. Build, then verify against the real thing

From inside the copied `build-contracts` package:

```sh
npm install                 # whatever your repo's install step is
npm test                    # runs the bundler's OWN self-tests — confirms
                             # the harness still matches your real test
                             # runner's behavior. Do this before trusting
                             # anything downstream.
```

From inside YOUR app (the thing with the real `require.context` entry
files and real contract tests, modeled on `apps/app-1`):

```sh
npm run build:contracts      # -> dist/<name>.bundle.cjs
node dist/<name>.bundle.cjs  # run it
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
npm run build:sea             # standalone binary (libs/build-contracts) — needs
                               # its own `npm run build` first; not wired to
                               # YOUR app's bundle yet — see that package's README
./sea/dist/contract-standalone  # run it, PATH="" works

npm run dev -w <your-app>       # the browser page, if you ported that too
npm run test:e2e -w <your-app>  # Playwright — needs Chromium installed once
                                  # (npx playwright install chromium)
```

### 6. What NOT to port

`libs/echo-server/` — this is a **local dev-only fixture**, standing in
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

- `libs/build-contracts/rsbuild/dist/` — that package's own demo bundle
- `libs/build-contracts/sea/dist/` — the standalone binary (this one is
  ~110MB — be especially sure this never gets committed; verify with
  `git log --all --diff-filter=A --name-only | grep sea/dist` if you're
  ever unsure, same way this history was double-checked here)
- `libs/build-contracts/tests/tmp-boundary/`,
  `libs/build-contracts/tests/tmp-only-scope/` — scratch output from
  the bundler's own self-tests (cleans itself up via `afterAll`, but
  check it's gone if a test run ever gets killed mid-way)
- `libs/build-contracts/fixtures/boundary/node_modules/` and
  `libs/build-contracts/fixtures/only-scope/node_modules/` — npm creates
  these because those fixture folders have their own tiny `package.json`
  (needed so the real test runner resolves each as its own project — see
  that package's own README for why)
- `apps/app-1/dist/` — the built browser app AND `contract.bundle.cjs`
  (both deliberately write into this one directory — see that app's
  README for why neither one cleans it on its own)
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
  `libs/build-contracts/tests/type-boundary.test.ts`. Don't expect the
  bundle to catch a wrong type assertion; it structurally can't.
- **The real test framework itself (rstest, in this repo) has its own
  rough edges** — a genuine upstream bug was found and documented during
  this work (a specific `beforeEach` + `toEqual` combination that breaks
  the real runner, unrelated to anything in this bundler). If your port
  hits something that looks like a framework bug rather than a bundler
  problem, it might genuinely be one — bisect before assuming the
  bundler broke it.
- **The standalone binary only builds for the platform it's built on** —
  no cross-compilation. If you need binaries for multiple OSes/architectures,
  that build step has to run once per target platform. It's also not
  currently wired into `apps/app-1`'s own build — only into
  `libs/build-contracts`'s own self-contained demo.
- **No retry support.** A flaky contract test (a real remote having a bad
  moment) just fails; there's no retry-count option on `test(...)` the
  way some real runners have. Noted here deliberately as a known gap,
  not something this scaffold tried and failed at.
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
