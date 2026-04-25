import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR5 } from './r05_primitive_whitelist.ts';
import { parseToAst } from '../../ast.ts';

describe('R5 primitive whitelist', () => {
  it('passes for datetime', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute d { type datetime; is required; label "D"; } }`);
    assert.deepEqual(ruleR5.check(ast), []);
  });
  it('fails for dateTime camel-case', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute d { type dateTime; is required; label "D"; } }`);
    const issues = ruleR5.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /'dateTime'/);
    assert.match(issues[0].message, /lowercase/);
  });
  it('fails for number (not in whitelist)', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute p { type number; is required; label "P"; } }`);
    const issues = ruleR5.check(ast);
    assert.equal(issues.length, 1);
  });
});
