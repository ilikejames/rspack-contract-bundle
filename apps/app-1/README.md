# app-1

A React page with a URL textbox (editable, not just a display) and a
"Run contract tests" button. Clicking it runs this app's own real
contract tests (`src/contracts/*.contract.test.ts`), in-browser, against
whatever WebSocket endpoint is in the textbox — including one this
machine doesn't control. The app also owns bundling those same tests into
a standalone Node CLI artifact, `./dist/contract.bundle.cjs`.

## How it's wired

This app owns everything specific to ITS contracts and ITS UI;
`@pack-exp/build-contracts` only supplies the generic, reusable pieces
(the `@rstest/core` replacement, the bundler config, and a display-only
results component) — see that package's README for what it is and isn't
responsible for.

- **`src/contracts/`** — the real tests (`reportEcho.ts` + `test1`–`test4`).
  Owned entirely by this app, not by the lib.
- **`src/entry.node.ts`** / **`src/entry.browser.ts`** — this app's own
  `require.context('./contracts', ...)` call, once for each target. That
  call's directory argument must be a literal string at the exact call
  site (see `@pack-exp/build-contracts`'s README) — these two files are
  the only place in this app that line lives, since discovery belongs
  next to the thing doing the discovering, not inside the shared lib.
- **`src/App.tsx`** — owns the URL textbox and run button, calls
  `runContractTests()` from `entry.browser.ts`, and renders the result
  with `<ContractResults />` from `@pack-exp/build-contracts/components`
  — a display-only component: it takes `results` (and, once a run has
  fully settled, `summary`) as props and renders them, nothing else. This
  app decides *when* a run is "done enough" to show a summary; the
  component never infers that on its own.
- **`scripts/build-contracts.mjs`** — calls
  `buildContractBundle()` (from `@pack-exp/build-contracts/build`) with
  `entry.node.ts`, aliasing `@rstest/core` to the lib's `harness.ts`.
  This app's normal `rsbuild build` and `build:contracts` both write into
  `./dist`; neither cleans the whole directory first (`cleanDistPath:
  false` on both sides), so running either one doesn't wipe the other's
  output.
- **`rstest.config.ts`** — runs the SAME test files unbundled, for fast
  local iteration (`npm test`), the normal `npm test` -> `rstest run`
  convention every other package in this repo uses.

`reportEcho`'s target URL is read via `@pack-exp/build-contracts`'s
`getTestEnv('ECHO_URL')` rather than a locally-owned mutable variable —
the same mechanism works whether the URL comes from `process.env` (a
Node CLI run) or `setTestEnv({ ECHO_URL: url })` (this app's own
textbox, called from `entry.browser.ts`'s `runContractTests`), with no
app-specific plumbing needed in the lib.

## Running

```sh
npm run dev -w @pack-exp/app-1          # http://localhost:3300, HMR
npm run build -w @pack-exp/app-1        # -> dist/ (the app itself)
npm run build:contracts -w @pack-exp/app-1  # -> dist/contract.bundle.cjs
npm run preview -w @pack-exp/app-1      # serve the build

npm test -w @pack-exp/app-1             # real rstest, unbundled, fast
npm run test:e2e -w @pack-exp/app-1     # playwright, auto-builds+serves
```

The dev echo-server (`npm run echo` from the repo root,
`ws://127.0.0.1:8787`) needs to be running for the prefilled default URL
to produce a passing-ish run. `test4`'s ping/pong test is a real,
intentional failure either way — see `src/contracts/test4.contract.test.ts`.

## `e2e/`

Three Playwright specs, verified against a real Chromium instance:

- `smoke.spec.ts` — loads the page, runs against the prefilled default
  URL, asserts a result for every test shows up.
- `url-override.spec.ts` — types an unreachable URL into the textbox,
  runs, and asserts every result mentions THAT url specifically — proving
  the textbox genuinely controls the target, not just displaying a fixed
  default.
- `progressive.spec.ts` — asserts results render as each test settles
  (not all at once at the end), and that the summary line only appears
  once the whole run has finished, never alongside a still-partial result
  list.
