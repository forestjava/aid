import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO3 } from './o03_type_match.ts';
import { parseToAst } from '../../ast.ts';

const INPUT = `entity X { attribute id { type uuid; key primary; }
  attribute date { type datetime; is required; label "D"; } }`;

describe('O3 type match', () => {
  it('passes when DTO type matches entity', () => {
    const out = `dto DTO.X { attribute id { type uuid; map X.id; } attribute date { type datetime; is required; map X.date; } }`;
    const i = parseToAst(INPUT).ast;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO3.check(i, o), []);
  });
  it('fails when DTO downgrades datetime to date', () => {
    const out = `dto DTO.X { attribute id { type uuid; map X.id; } attribute date { type date; is required; map X.date; } }`;
    const i = parseToAst(INPUT).ast;
    const o = parseToAst(out).ast;
    const issues = ruleO3.check(i, o);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /type mismatch/);
    assert.match(issues[0].message, /DTO has 'date', entity has 'datetime'/);
  });
});
