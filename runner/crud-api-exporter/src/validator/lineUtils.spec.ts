import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { offsetToLine } from './lineUtils.ts';

describe('offsetToLine', () => {
  it('returns 1 for offset 0', () => {
    assert.equal(offsetToLine('abc', 0), 1);
  });
  it('returns 2 after first newline', () => {
    assert.equal(offsetToLine('abc\nxyz', 4), 2);
  });
  it('returns correct line in multi-line text', () => {
    const src = 'a\nb\nc\nd';
    assert.equal(offsetToLine(src, 6), 4);
  });
});
