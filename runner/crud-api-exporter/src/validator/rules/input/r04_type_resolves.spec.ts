import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR4 } from './r04_type_resolves.ts';
import { parseToAst } from '../../ast.ts';

describe('R4 type resolves', () => {
  it('passes for primitive and resolvable refs', () => {
    const { ast } = parseToAst(`enum S { value A { label "A"; } }
entity X { attribute id { type uuid; key primary; }
  attribute s { type S; is required; label "S"; default A; } }`);
    assert.deepEqual(ruleR4.check(ast), []);
  });
  it('fails for unknown type', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute s { type Stirng; is required; label "S"; } }`);
    const issues = ruleR4.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /unknown type 'Stirng'/);
  });
});
