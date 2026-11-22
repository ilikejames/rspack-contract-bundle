import { describe, expect, test } from '@rstest/core';
import { reportEcho } from './reportEcho.js';

// The dev echo-server routes by `dest`; only "echo" gets a reply (see
// libs/echo-server/src/server.mjs). This is otherwise still a plain
// string as far as `echo()`/`reportEcho()` are concerned — they're
// protocol-agnostic and just send/compare whatever string they're given.
const PAYLOAD = JSON.stringify({ dest: 'echo', message: 'hello-from-test-1' });

describe('test1: echo contract: plain text payload', () => {
  test('echoes the payload back verbatim', async () => {
    const report = await reportEcho(PAYLOAD);

    expect(report.error).toBeUndefined();
    expect(report.received).toBe(PAYLOAD);
    expect(report.ok).toBe(true);
  });

  test('reports the url it talked to', async () => {
    const report = await reportEcho(PAYLOAD);

    expect(report.url).toMatch(/^wss?:\/\//);
    expect(report.payload).toBe(PAYLOAD);
  });
});
