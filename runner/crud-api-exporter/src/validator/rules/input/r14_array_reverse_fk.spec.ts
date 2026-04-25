import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR14 } from './r14_array_reverse_fk.ts';
import { parseToAst } from '../../ast.ts';

describe('R14 array reverse FK', () => {
  it('passes when reverse FK exists (self-ref via bossId)', () => {
    const { ast } = parseToAst(`entity Employee { attribute id { type uuid; key primary; }
  attribute bossId { type uuid; is nullable; key foreign { relates Employee.id; } label "B"; } }`);
    assert.deepEqual(ruleR14.check(ast), []);
  });
  it('fails when array without reverse FK', () => {
    const { ast } = parseToAst(`entity Employee { attribute id { type uuid; key primary; }
  attribute subordinates { type Employee[]; is nullable; label "S"; } }`);
    const issues = ruleR14.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /requires reverse foreign key/);
  });
});
