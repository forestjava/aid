import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR7 } from './r07_foreign_key_pattern.ts';
import { parseToAst } from '../../ast.ts';

describe('R7 FK pattern', () => {
  it('passes when FK is uuid + relates', () => {
    const { ast } = parseToAst(`entity Equipment { attribute id { type uuid; key primary; } }
entity C { attribute id { type uuid; key primary; }
  attribute equipmentId { type uuid; is required; key foreign { relates Equipment.id; } label "E"; } }`);
    assert.deepEqual(ruleR7.check(ast), []);
  });
  it('fails when type is the entity name without FK wrapper', () => {
    const { ast } = parseToAst(`entity Equipment { attribute id { type uuid; key primary; } }
entity C { attribute id { type uuid; key primary; }
  attribute equipmentId { type Equipment; is required; label "E"; } }`);
    const issues = ruleR7.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /foreign key column must be 'type uuid'/);
  });
});
