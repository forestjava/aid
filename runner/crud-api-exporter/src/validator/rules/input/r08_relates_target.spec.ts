import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR8 } from './r08_relates_target.ts';
import { parseToAst } from '../../ast.ts';

describe('R8 relates target', () => {
  it('passes when relates points at existing field', () => {
    const { ast } = parseToAst(`entity Equipment { attribute id { type uuid; key primary; } }
entity C { attribute id { type uuid; key primary; }
  attribute eq { type uuid; is required; key foreign { relates Equipment.id; } label "E"; } }`);
    assert.deepEqual(ruleR8.check(ast), []);
  });
  it('fails when relates points at missing field', () => {
    const { ast } = parseToAst(`entity Equipment { attribute id { type uuid; key primary; } }
entity C { attribute id { type uuid; key primary; }
  attribute eq { type uuid; is required; key foreign { relates Equipment.idd; } label "E"; } }`);
    const issues = ruleR8.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /field 'idd' not found in entity 'Equipment'/);
  });
  it('fails when relates points at unknown entity', () => {
    const { ast } = parseToAst(`entity C { attribute id { type uuid; key primary; }
  attribute eq { type uuid; is required; key foreign { relates Foo.id; } label "E"; } }`);
    const issues = ruleR8.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /unknown entity 'Foo'/);
  });
});
