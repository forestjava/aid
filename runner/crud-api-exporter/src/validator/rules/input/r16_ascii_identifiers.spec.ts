import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR16 } from './r16_ascii_identifiers.ts';
import { parseToAst } from '../../ast.ts';

describe('R16 ASCII identifiers', () => {
  it('passes for ASCII names', () => {
    const { ast } = parseToAst(`enum Role { value Signer { label "Подписант"; } }`);
    assert.deepEqual(ruleR16.check(ast), []);
  });
  it('fails for cyrillic enum value', () => {
    const { ast } = parseToAst(`enum Role { value Подписант { label "Подписант"; } }`);
    const issues = ruleR16.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /must be ASCII/);
  });
});
