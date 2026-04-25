import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO1 } from './o01_dto_set.ts';
import { parseToAst } from '../../ast.ts';

const INPUT = `entity Equipment { attribute id { type uuid; key primary; } attribute name { type string; is required; label "N"; } }`;

describe('O1 DTO set', () => {
  it('passes when full set present', () => {
    const out = `dto DTO.Equipment { description "x"; attribute id { type uuid; map Equipment.id; } }
dto DTO.EquipmentCreate { description "x"; attribute name { type string; is required; map Equipment.name; } }
dto DTO.EquipmentUpdate { description "x"; attribute name { type string; is nullable; map Equipment.name; } }
dto DTO.EquipmentListRequest { description "x"; attribute page { type DTO.PageRequest; } }
dto DTO.EquipmentListResponse { description "x"; attribute content { type DTO.Equipment[]; } }`;
    const i = parseToAst(INPUT).ast;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO1.check(i, o), []);
  });
  it('fails when Create is missing', () => {
    const out = `dto DTO.Equipment { description "x"; attribute id { type uuid; map Equipment.id; } }`;
    const i = parseToAst(INPUT).ast;
    const o = parseToAst(out).ast;
    const issues = ruleO1.check(i, o);
    assert.ok(issues.some(x => /DTO\.EquipmentCreate/.test(x.message)));
  });
});
