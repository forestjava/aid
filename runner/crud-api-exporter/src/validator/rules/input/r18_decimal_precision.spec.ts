import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR18 } from './r18_decimal_precision.ts';
import { parseToAst } from '../../ast.ts';

describe('R18 decimal precision', () => {
  it('passes for decimal(10,2)', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute p { type decimal(10,2); is required; label "P"; } }`);
    assert.deepEqual(ruleR18.check(ast), []);
  });
  it('fails for bare decimal', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute p { type decimal; is required; label "P"; } }`);
    const issues = ruleR18.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /must include precision and scale/);
  });
});
