import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO5 } from './o05_update_nullable.ts';
import { parseToAst } from '../../ast.ts';

describe('O5 Update nullable', () => {
  it('passes when all fields nullable', () => {
    const out = `dto DTO.XUpdate { attribute n { type string; is nullable; map X.n; } }`;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO5.check({ source: '', containers: [] }, o), []);
  });
  it('fails when a field is required', () => {
    const out = `dto DTO.XUpdate { attribute n { type string; is required; map X.n; } }`;
    const o = parseToAst(out).ast;
    const issues = ruleO5.check({ source: '', containers: [] }, o);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /must be 'is nullable'/);
  });
});
