import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO9 } from './o09_update_is_patch.ts';
import { parseToAst } from '../../ast.ts';

describe('O9 update is PATCH', () => {
  it('passes for PATCH', () => {
    const out = `api API.X { description "x"; endpoint updateX { label "PATCH /x/{id}"; attribute id { type uuid; } } }`;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO9.check({ source: '', containers: [] }, o), []);
  });
  it('fails for PUT', () => {
    const out = `api API.X { description "x"; endpoint updateX { label "PUT /x/{id}"; attribute id { type uuid; } } }`;
    const o = parseToAst(out).ast;
    const issues = ruleO9.check({ source: '', containers: [] }, o);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /method must be 'PATCH', got 'PUT'/);
  });
});
