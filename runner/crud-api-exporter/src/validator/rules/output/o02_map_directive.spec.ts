import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO2 } from './o02_map_directive.ts';
import { parseToAst } from '../../ast.ts';

describe('O2 map directive', () => {
  it('passes when each prop attr has map', () => {
    const out = `dto DTO.X { attribute id { type uuid; map X.id; } attribute n { type string; is required; map X.n; } }`;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO2.check({ source: '', containers: [] }, o), []);
  });
  it('fails when map missing on prop attr', () => {
    const out = `dto DTO.X { attribute id { type uuid; map X.id; } attribute n { type string; is required; } }`;
    const o = parseToAst(out).ast;
    const issues = ruleO2.check({ source: '', containers: [] }, o);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /missing 'map'/);
  });
  it('skips map for content/pageInfo/filter/page', () => {
    const out = `dto DTO.XListResponse { attribute content { type DTO.X[]; } attribute pageInfo { type DTO.PageInfo; } }`;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO2.check({ source: '', containers: [] }, o), []);
  });
});
