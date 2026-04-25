import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO6 } from './o06_dto_refs.ts';
import { parseToAst } from '../../ast.ts';

describe('O6 DTO refs', () => {
  it('passes when references resolve', () => {
    const out = `dto DTO.X { attribute id { type uuid; map X.id; } }
dto DTO.XListResponse { attribute content { type DTO.X[]; } attribute pageInfo { type DTO.PageInfo; } }`;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO6.check({ source: '', containers: [] }, o), []);
  });
  it('fails on unknown DTO reference', () => {
    const out = `api API.X { description "x"; endpoint l { label "POST /x/page"; attribute request { type DTO.NoSuch; } } }`;
    const o = parseToAst(out).ast;
    const issues = ruleO6.check({ source: '', containers: [] }, o);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /undefined DTO 'DTO\.NoSuch'/);
  });
});
