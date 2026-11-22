import { describe, expect, test } from '@rstest/core';
import { reportEcho } from './reportEcho.js';

// dest: 'echo' so the dev echo-server actually replies — see test1's
// comment and libs/echo-server/src/server.mjs.
const PAYLOAD = JSON.stringify({
  dest: 'echo',
  from: 'test-2',
  nested: { list: [1, 2, 3], flag: true },
  unicode: 'ü-✓-🧪',
});

describe('test2: echo contract: json payload', () => {
  test('echoes a structured payload back verbatim', async () => {
    const report = await reportEcho(PAYLOAD);

    expect(report.error).toBeUndefined();
    expect(report.received).toBe(PAYLOAD);
    expect(report.ok).toBe(true);
  });

  test('round trip is parseable on the way back', async () => {
    const report = await reportEcho(PAYLOAD);

    expect(report.received).toBeDefined();
    expect(JSON.parse(report.received as string)).toEqual({
      dest: 'echo',
      from: 'test-2',
      nested: { list: [1, 2, 3], flag: true },
      unicode: 'ü-✓-🧪',
    });
  });
});
