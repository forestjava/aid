import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR12 } from './r12_enum_completeness.ts';
import { parseToAst } from '../../ast.ts';

describe('R12 enum completeness', () => {
  it('passes when each value has label', () => {
    const { ast } = parseToAst(`enum S { value A { label "A"; } value B { label "B"; } }`);
    assert.deepEqual(ruleR12.check(ast), []);
  });
  it('fails when value has no label', () => {
    const { ast } = parseToAst(`enum S { value A; }`);
    const issues = ruleR12.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /value 'A' has no 'label'/);
  });
  it('fails for empty enum', () => {
    const { ast } = parseToAst(`enum S { }`);
    const issues = ruleR12.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /empty enum/);
  });
});
