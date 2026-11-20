# pack-exp

Scaffold for an experiment: **bundle a set of tests into a single artifact that a
third party can run without installing dependencies.** This repo is only the
starting point — the bundling step comes next.

## Layout

```
packages/add        lib — add(a, b)
packages/network    lib — echo(url, payload) over a WebSocket (depends on add)
packages/contract   subject under test — reportEcho(payload) + 4 contract tests
tools/echo-server   dev-only ws echo service (NOT part of the test bundle)
```

The echo-server routes by a `dest` field in the message body — only
`dest: "echo"` gets a reply; any other `dest` (or no `dest` at all) is
silently unhandled. `test1`/`test2` use `dest: "echo"`; `test3`
deliberately targets an unimplemented `dest` to exercise `network`'s own
client-side timeout for real (genuinely takes ~2s, not a mocked delay).
`network`/`contract` stay protocol-agnostic — this routing knowledge lives
only in the test payloads and the dev server.

**`test4` is a genuine, currently-failing test, left in on purpose**: it
targets a `dest: 'ping'` heartbeat endpoint the echo-server doesn't
implement yet. Unlike `test3` (which expects and correctly detects a
timeout — a pass), `test4` expects success and gets the timeout instead —
a real `✗`, documenting a real pending feature rather than standing in for
one. `npm test` exits non-zero because of it, same as a real CI run would.
Execution continues normally past the failure (its second test, right
after, passes as expected).

The libs are "just-in-time" packages: `exports` points straight at `src/index.ts`,
so the consumer (rstest/rspack today, the bundler tomorrow) compiles them from
source. Nothing is pre-built, which is what makes a single self-contained test
bundle possible later.

## Running

```sh
npm install

npm run echo              # terminal 1 — ws://127.0.0.1:8787
npm test                  # terminal 2 — turbo -> rstest, all 4 contract files (exits non-zero: test4 is a known, real failure)

npm run typecheck         # tsc across all packages
```

Run one file at a time:

```sh
npm run test -w @pack-exp/contract -- tests/test1.contract.test.ts
npm run test -w @pack-exp/contract -- tests/test2.contract.test.ts
npm run test -w @pack-exp/contract -- tests/test3.contract.test.ts
npm run test -w @pack-exp/contract -- tests/test4.contract.test.ts
```

Point the tests somewhere else with `ECHO_URL`; move the server with
`ECHO_PORT` / `ECHO_HOST`.

With no server running, both files still execute and fail on assertions
(`reportEcho` never throws — a dead socket becomes `{ ok: false, error }`).

## Tooling

npm workspaces · TypeScript · rstest (rspack) · turbo (local cache only,
remote cache disabled in `turbo.json`).
