import { describe, expect, test } from '@rstest/core';

// `.only` is scoped per FILE, not globally across a bundle (confirmed
// against the real runner — see harness.ts's `registerFile`). This file
// marks one test `.only`; fileB.test.ts (bundled alongside it) has no
// `.only` at all and must be completely unaffected.
describe('fileA', () => {
  test.only('A - marked only, should run', () => {
    expect(true).toBe(true);
  });

  test('A - not marked only, should be skipped', () => {
    throw new Error('should not run — only-mode is active in this file');
  });
});

describe('fileA, a second top-level describe in the SAME file', () => {
  test('also skipped — only-mode scopes to the whole FILE, not just the one describe it appears in', () => {
    throw new Error('should not run — only-mode scopes to the whole file');
  });
});
