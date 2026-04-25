import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR6 } from './r06_required_or_nullable.ts';
import { parseToAst } from '../../ast.ts';

describe('R6 required xor nullable', () => {
  it('passes when required is set', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute n { type string; is required; label "N"; } }`);
    assert.deepEqual(ruleR6.check(ast), []);
  });
  it('fails when neither required nor nullable on non-PK', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute n { type string; label "N"; } }`);
    const issues = ruleR6.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /exactly one of 'is required' or 'is nullable'/);
  });
  it('fails when both required and nullable set', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute n { type string; is required; is nullable; label "N"; } }`);
    const issues = ruleR6.check(ast);
    assert.equal(issues.length, 1);
  });
});
