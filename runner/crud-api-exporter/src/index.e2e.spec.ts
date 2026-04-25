import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateInputSource, validateOutputAgainstInput } from './validator/index.ts';

const GOOD_INPUT = `entity X { attribute id { type uuid; key primary; }
  attribute date { type datetime; is required; label "D"; } }`;
const BAD_INPUT = `entity X { attribute id { type uuid; key primary; }
  attribute date { type dateTime; is required; } }`;
const GOOD_OUTPUT = `dto DTO.X { description "x"; attribute id { type uuid; map X.id; } attribute date { type datetime; is required; map X.date; } }
dto DTO.XCreate { description "x"; attribute date { type datetime; is required; map X.date; } }
dto DTO.XUpdate { description "x"; attribute date { type datetime; is nullable; map X.date; } }
dto DTO.XListRequest { description "x"; attribute page { type DTO.PageRequest; } }
dto DTO.XListResponse { description "x"; attribute content { type DTO.X[]; } attribute pageInfo { type DTO.PageInfo; } }
api API.X { description "x";
  endpoint listX { label "POST /x/page"; attribute request { type DTO.XListRequest; } }
  endpoint getX { label "GET /x/{id}"; attribute id { type uuid; } }
  endpoint createX { label "POST /x"; attribute request { type DTO.XCreate; } }
  endpoint updateX { label "PATCH /x/{id}"; attribute id { type uuid; } }
  endpoint deleteX { label "DELETE /x/{id}"; attribute id { type uuid; } } }`;
const BAD_OUTPUT = GOOD_OUTPUT.replace('attribute date { type datetime; is required; map X.date; }',
                                        'attribute date { type date; is required; map X.date; }');

describe('e2e validation flow', () => {
  it('green path: input ok, output ok', () => {
    const i = validateInputSource(GOOD_INPUT);
    assert.equal(i.ok, true);
    const o = validateOutputAgainstInput(GOOD_INPUT, GOOD_OUTPUT);
    assert.equal(o.ok, true);
  });
  it('input-validation failure', () => {
    const i = validateInputSource(BAD_INPUT);
    assert.equal(i.ok, false);
    assert.ok(i.issues.some(x => x.rule === 'R5'));
  });
  it('output-validation failure: datetime downgraded', () => {
    const i = validateInputSource(GOOD_INPUT);
    assert.equal(i.ok, true);
    const o = validateOutputAgainstInput(GOOD_INPUT, BAD_OUTPUT);
    assert.equal(o.ok, false);
    assert.ok(o.issues.some(x => x.rule === 'O3'));
  });
});
