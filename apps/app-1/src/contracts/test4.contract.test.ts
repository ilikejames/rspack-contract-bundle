import { describe, expect, test } from '@rstest/core';
import { echo } from '@pack-exp/network';
import { getEchoUrl, reportEcho } from './reportEcho.js';

/**
 * A genuine, currently-failing contract test — not a contrived wrong
 * assertion, a real pending feature: a ping/pong heartbeat endpoint the
 * dev echo-server hasn't been built yet. `dest: 'ping'` isn't handled (see
 * libs/echo-server/src/server.mjs — only `dest: 'echo'` is).
 *
 * Calls the raw `echo()` directly rather than going through `reportEcho`
 * (which never throws — see its own doc comment), AND gives `echo()` a
 * deliberately huge `timeoutMs` (60s) so ITS own internal timer practically
 * never fires — the handler never stops waiting on its own. What actually
 * ends this test is OUR harness's own per-test timeout (the 3rd arg to
 * `test(...)`, 1000ms here): `withTimeout` in harness.ts wins the race long
 * before network's internal timer ever would, and rejects with its OWN
 * message (`test "..." timed out after 1000ms`) — not `network`'s
 * (`echo timed out after 60000ms (deadline ...)`).
 *
 * `{ signal }` (the test context's 2nd arg, matching real rstest's
 * `TestContext.signal`) is passed straight through to `echo()`'s own
 * `signal` option: when the harness's 1000ms fires, it aborts that signal,
 * and `echo()` hears it and closes its socket immediately instead of
 * leaving the connection (and its 60s timer) running in the background —
 * without this, the whole bundled process would hang for up to 60s after
 * every result already printed, waiting for that abandoned timer.
 *
 * The assertion is never reached either way; once ping/pong is implemented
 * for real, it'll resolve well within 1000ms and this stops being a
 * timeout at all.
 */
describe('test4: echo contract: ping/pong heartbeat (not implemented yet)', () => {
  test(
    'server responds to a ping with a pong',
    async ({ signal }) => {
      const result = await echo(getEchoUrl(), JSON.stringify({ dest: 'ping' }), {
        timeoutMs: 60_000,
        signal,
      });

      expect(result.received).toBe(JSON.stringify({ dest: 'pong' }));
    },
    1_000,
  );

  test('a normal echo still works right after', async () => {
    const PAYLOAD = JSON.stringify({ dest: 'echo', message: 'still works' });
    const report = await reportEcho(PAYLOAD);

    expect(report.ok).toBe(true);
    expect(report.received).toBe(PAYLOAD);
  });
});
