import { describe, expect, test } from '@rstest/core';
import { reportEcho } from '../src/index.js';

// Routed to a dest the dev echo-server has no handler for (only "echo" is
// handled — see tools/echo-server/src/server.mjs). The server accepts the
// connection and the message, then simply never replies: a real, if
// deliberately contrived, "hit an endpoint that exists but isn't
// implemented" scenario, rather than a connection error or a crash. This
// is what actually exercises `network`'s client-side timeout (2000ms) —
// genuinely takes ~2s to fail, not a mocked delay.
const PAYLOAD = JSON.stringify({ dest: 'not-implemented', message: 'hello-from-test-3' });

describe('test3: echo contract: unhandled endpoint', () => {
  test('times out successfully waiting for a reply that never comes', async () => {
    const report = await reportEcho(PAYLOAD);

    expect(report.ok).toBe(false);
    expect(report.received).toBeUndefined();
    expect(report.error).toMatch(/timed out after \d+ms/);
  });
});
