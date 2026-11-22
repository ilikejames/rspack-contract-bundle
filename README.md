# pack-exp

Experiment: **bundle a set of contract tests into a single artifact that a
third party can run without installing dependencies**, so a deployed
environment's integrations can be verified against the real thing — not
mocked, since these contracts are designed to run against a real remote.

## Layout

```
apps/app-1          React app: a URL textbox + "Run contract tests" button,
                     owns its own contract tests (src/contracts) and their
                     bundling into a standalone artifact
libs/add             lib — add(a, b)
libs/network         lib — echo(url, payload) over a WebSocket (depends on add)
libs/build-contracts the bundler: packs a `require.context`-discovered set of
                     test files + the real @vitest/expect matcher library into
                     one zero-dependency file, with a display-only React
                     component to render the results
libs/echo-server     dev-only ws echo service (NOT part of any test bundle)
```

The echo-server routes by a `dest` field in the message body — only
`dest: "echo"` gets a reply; any other `dest` (or no `dest` at all) is
silently unhandled. `test1`/`test2` use `dest: "echo"`; `test3`
deliberately targets an unimplemented `dest` to exercise `network`'s own
client-side timeout for real (genuinely takes ~2s, not a mocked delay).
`test4` targets a `dest: 'ping'` heartbeat endpoint the echo-server
doesn't implement yet — a genuine, currently-failing test, left in on
purpose to document a real pending feature rather than stand in for one.
`network` stays protocol-agnostic throughout — this routing knowledge
lives only in the test payloads and the dev server.

The libs are "just-in-time" packages: `exports` points straight at
`src/index.ts` (or `.tsx`), so the consumer (rstest/rspack, or whatever
app imports them) compiles from source. Nothing is pre-built.

## Running

```sh
npm install

npm run echo              # terminal 1 — ws://127.0.0.1:8787
npm test                   # terminal 2 — turbo -> rstest, every package's own tests

npm run typecheck          # tsc across every package
```

Run app-1's own (unbundled) contract tests directly:

```sh
npm run test -w @pack-exp/app-1 -- src/contracts/test1.contract.test.ts
```

Point the tests somewhere else with `ECHO_URL`; move the server with
`ECHO_PORT` / `ECHO_HOST`. With no server running, tests still execute
and fail on assertions (`reportEcho` never throws — a dead socket becomes
`{ ok: false, error }`).

Build and run the portable contract bundle (see `apps/app-1/README.md`
and `libs/build-contracts/README.md` for how it's assembled):

```sh
npm run build:contracts -w @pack-exp/app-1   # -> apps/app-1/dist/contract.bundle.cjs
node apps/app-1/dist/contract.bundle.cjs
```

## Tooling

npm workspaces · TypeScript · rstest (rspack) · rsbuild · React · turbo
(local cache only, remote cache disabled in `turbo.json`).
