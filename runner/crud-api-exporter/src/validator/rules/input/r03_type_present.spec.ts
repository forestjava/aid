import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR3 } from './r03_type_present.ts';
import { parseToAst } from '../../ast.ts';

describe('R3 type directive', () => {
  it('passes when all attributes have type', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; } attribute n { type string; is required; } }`);
    assert.deepEqual(ruleR3.check(ast), []);
  });
  it('fails when attribute has no type', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; } attribute code { key primary; } }`);
    const issues = ruleR3.check(ast).filter(i => i.attribute === 'code');
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /missing 'type' directive/);
  });
});
