import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR13 } from './r13_naming_case.ts';
import { parseToAst } from '../../ast.ts';

describe('R13 naming case', () => {
  it('passes for proper PascalCase / camelCase', () => {
    const { ast } = parseToAst(`entity Equipment { attribute id { type uuid; key primary; }
  attribute serialNumber { type string; is required; label "S"; } }`);
    assert.deepEqual(ruleR13.check(ast), []);
  });
  it('fails for snake_case entity', () => {
    const { ast } = parseToAst(`entity change_equipment { attribute id { type uuid; key primary; } }`);
    const issues = ruleR13.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /must be PascalCase/);
  });
  it('fails for snake_case attribute', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute serial_number { type string; is required; label "S"; } }`);
    const issues = ruleR13.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /must be camelCase/);
  });
});
