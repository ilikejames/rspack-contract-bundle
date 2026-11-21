import { describe, expect, test } from '@rstest/core';

// No `.only` anywhere in this file — must run completely normally
// regardless of fileA.test.ts's `.only`, bundled alongside it.
describe('fileB, unrelated to fileA', () => {
  test('B - runs normally, unaffected by fileA\'s only-mode', () => {
    expect(true).toBe(true);
  });
});
