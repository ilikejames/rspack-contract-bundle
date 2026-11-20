# contract-test-runner

The "reach" goal: a React page with a URL textbox (editable, not just a
display) and a "Run contract tests" button. Clicking it runs the real
`packages/contract` tests, in-browser, against whatever WebSocket endpoint
is in the textbox — including one this machine doesn't control.

## How it's wired

No separate prebuilt browser bundle. `src/App.tsx` imports directly from
`@pack-exp/contract-test-bundler/browser` (that package's `exports` map
points `./browser` at `tools/contract-test-bundler/shared/src/entry.browser.ts`
— real TypeScript source, not a build artifact). This app's own `rsbuild`
build is the only bundler pass: it compiles that source together with its
own `src/`, in one go.

That means this app's `rsbuild.config.ts` needs the **same** two
`resolve` settings `contract-test-bundler`'s own builds need — `@rstest/core`
aliased to `harness.ts` (a deliberate substitution; see that package's
README for why), and `.js`→`.ts` `extensionAlias` (our source uses
explicit `.js`-suffixed relative imports under `verbatimModuleSyntax`).
`entry.browser.ts`'s own `require.context(...)` call (same discovery
mechanism as the Node bundle's `entry.ts`) still pulls in
`packages/contract/tests/*.contract.test.ts` directly — that part needed
no browser-specific change at all, since `network`'s `echo()` already
used the global `WebSocket`, not Node's `ws` package.

**One real change was needed in `packages/contract`**: `reportEcho`'s
target URL used to be resolved once, from `process.env.ECHO_URL`, at
module-load time — fine for a CLI process (new process + fresh env var
per run), wrong for a page where the URL can change and "Run" gets
clicked more than once in the same page load. Replaced with
`getEchoUrl()`/`setEchoUrl(url)` over a mutable module-level variable, so
each click can set a fresh target before running. Clicking without
changing the textbox just keeps using whatever it's already set to;
nothing in `packages/contract`'s Node-side behavior or tests changed.

## Running

```sh
npm run dev -w @pack-exp/contract-test-runner       # http://localhost:3300, HMR
npm run build -w @pack-exp/contract-test-runner      # -> dist/
npm run preview -w @pack-exp/contract-test-runner    # serve the build

npm run test:e2e -w @pack-exp/contract-test-runner   # playwright, auto-builds+serves
```

The dev echo-server (`npm run echo` from the repo root,
`ws://127.0.0.1:8787`) needs to be running for the prefilled default URL
to produce a passing-ish run — same `test3`/`test4` caveats as the Node
bundle (see `tools/contract-test-bundler`'s README): `test4`'s ping/pong
test is a real, intentional failure either way.

## `e2e/`

Two Playwright specs, verified against a real Chromium instance:

- `smoke.spec.ts` — loads the page, runs against the prefilled default
  URL, asserts a result for every test shows up.
- `url-override.spec.ts` — the actual point of this whole app: types an
  unreachable URL into the textbox, runs, and asserts every result
  mentions THAT url specifically — proving the textbox genuinely controls
  the target, not just displaying a fixed default.
