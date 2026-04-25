import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR2 } from './r02_primary_key_uuid.ts';
import { parseToAst } from '../../ast.ts';

describe('R2 primary key is uuid', () => {
  it('passes for uuid primary', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; } }`);
    assert.deepEqual(ruleR2.check(ast), []);
  });
  it('fails for non-uuid primary', () => {
    const { ast } = parseToAst(`entity X { attribute id { type integer; key primary; } }`);
    const issues = ruleR2.check(ast);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].rule, 'R2');
    assert.match(issues[0].message, /primary key must be 'uuid', got 'integer'/);
  });
});
