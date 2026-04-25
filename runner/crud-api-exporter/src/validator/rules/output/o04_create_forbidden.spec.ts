import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO4 } from './o04_create_forbidden.ts';
import { parseToAst } from '../../ast.ts';

describe('O4 Create-DTO forbidden fields', () => {
  it('passes for clean Create-DTO', () => {
    const out = `dto DTO.XCreate { attribute name { type string; is required; map X.name; } }`;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO4.check({ source: '', containers: [] }, o), []);
  });
  it('fails when id is in Create-DTO', () => {
    const out = `dto DTO.XCreate { attribute id { type uuid; is required; map X.id; } attribute n { type string; is required; map X.n; } }`;
    const o = parseToAst(out).ast;
    const issues = ruleO4.check({ source: '', containers: [] }, o);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /forbidden in Create-DTO/);
  });
});
