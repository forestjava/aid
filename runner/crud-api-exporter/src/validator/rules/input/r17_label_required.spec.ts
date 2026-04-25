import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR17 } from './r17_label_required.ts';
import { parseToAst } from '../../ast.ts';

describe('R17 label required', () => {
  it('passes when label is set on non-PK', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute n { type string; is required; label "N"; } }`);
    assert.deepEqual(ruleR17.check(ast), []);
  });
  it('skips PK', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; } attribute n { type string; is required; label "N"; } }`);
    assert.deepEqual(ruleR17.check(ast), []);
  });
  it('fails when label missing', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute n { type string; is required; } }`);
    const issues = ruleR17.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /missing 'label'/);
  });
});
