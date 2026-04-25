import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR10 } from './r10_uniqueness.ts';
import { parseToAst } from '../../ast.ts';

describe('R10 uniqueness', () => {
  it('passes for unique names', () => {
    const { ast } = parseToAst(`entity A { attribute id { type uuid; key primary; } } entity B { attribute id { type uuid; key primary; } }`);
    assert.deepEqual(ruleR10.check(ast), []);
  });
  it('fails on duplicate entity name', () => {
    const { ast } = parseToAst(`entity A { attribute id { type uuid; key primary; } } entity A { attribute id { type uuid; key primary; } }`);
    const issues = ruleR10.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /duplicate entity 'A'/);
  });
  it('fails on duplicate attribute', () => {
    const { ast } = parseToAst(`entity A { attribute id { type uuid; key primary; } attribute n { type string; is required; label "N"; } attribute n { type string; is required; label "N"; } }`);
    const issues = ruleR10.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /duplicate attribute 'A\.n'/);
  });
});
