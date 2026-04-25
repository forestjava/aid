import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO7 } from './o07_endpoint_set.ts';
import { parseToAst } from '../../ast.ts';

const INPUT = `entity X { attribute id { type uuid; key primary; } }`;

describe('O7 endpoint set', () => {
  it('passes with full five endpoints', () => {
    const out = `api API.X { description "x";
  endpoint listX { label "POST /x/page"; attribute request { type DTO.XListRequest; } }
  endpoint getX { label "GET /x/{id}"; attribute id { type uuid; } }
  endpoint createX { label "POST /x"; attribute request { type DTO.XCreate; } }
  endpoint updateX { label "PATCH /x/{id}"; attribute id { type uuid; } }
  endpoint deleteX { label "DELETE /x/{id}"; attribute id { type uuid; } } }`;
    const i = parseToAst(INPUT).ast;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO7.check(i, o), []);
  });
  it('fails when updateX missing', () => {
    const out = `api API.X { description "x";
  endpoint listX { label "POST /x/page"; attribute request { type DTO.XListRequest; } }
  endpoint getX { label "GET /x/{id}"; attribute id { type uuid; } }
  endpoint createX { label "POST /x"; attribute request { type DTO.XCreate; } }
  endpoint deleteX { label "DELETE /x/{id}"; attribute id { type uuid; } } }`;
    const i = parseToAst(INPUT).ast;
    const o = parseToAst(out).ast;
    const issues = ruleO7.check(i, o);
    assert.ok(issues.some(x => /missing endpoint 'updateX'/.test(x.message)));
  });
});
