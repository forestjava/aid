import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR15 } from './r15_required_cycle.ts';
import { parseToAst } from '../../ast.ts';

describe('R15 required cycle', () => {
  it('passes when at least one side is nullable', () => {
    const { ast } = parseToAst(`entity A { attribute id { type uuid; key primary; }
  attribute bId { type uuid; is required; key foreign { relates B.id; } label "B"; } }
entity B { attribute id { type uuid; key primary; }
  attribute aId { type uuid; is nullable; key foreign { relates A.id; } label "A"; } }`);
    assert.deepEqual(ruleR15.check(ast), []);
  });
  it('fails for both-required cycle', () => {
    const { ast } = parseToAst(`entity A { attribute id { type uuid; key primary; }
  attribute bId { type uuid; is required; key foreign { relates B.id; } label "B"; } }
entity B { attribute id { type uuid; key primary; }
  attribute aId { type uuid; is required; key foreign { relates A.id; } label "A"; } }`);
    const issues = ruleR15.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /required-cycle/);
  });
});
