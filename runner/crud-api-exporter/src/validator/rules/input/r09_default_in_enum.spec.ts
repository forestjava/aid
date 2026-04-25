import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR9 } from './r09_default_in_enum.ts';
import { parseToAst } from '../../ast.ts';

describe('R9 default in enum values', () => {
  it('passes when default is one of enum values', () => {
    const { ast } = parseToAst(`enum S { value A { label "A"; } value B { label "B"; } }
entity X { attribute id { type uuid; key primary; }
  attribute s { type S; is required; default A; label "S"; } }`);
    assert.deepEqual(ruleR9.check(ast), []);
  });
  it('fails when default not in enum', () => {
    const { ast } = parseToAst(`enum S { value A { label "A"; } }
entity X { attribute id { type uuid; key primary; }
  attribute s { type S; is required; default Activ; label "S"; } }`);
    const issues = ruleR9.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /default value 'Activ' not found in enum 'S'/);
  });
});
