import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR11 } from './r11_at_name_datetime.ts';
import { parseToAst } from '../../ast.ts';

describe('R11 *At fields require datetime', () => {
  it('passes for createdAt: datetime', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute createdAt { type datetime; is required; label "C"; } }`);
    assert.deepEqual(ruleR11.check(ast), []);
  });
  it('fails for signedAt: date', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; }
  attribute signedAt { type date; is required; label "S"; } }`);
    const issues = ruleR11.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /must be 'datetime', got 'date'/);
  });
});
