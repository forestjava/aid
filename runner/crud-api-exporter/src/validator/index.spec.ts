import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateInputSource } from './index.ts';

const REFERENCE = `enum Role {
  value Executor { label "Исполнитель"; }
  value Signer { label "Подписант"; }
  value User { label "Пользователь"; }
}

entity Employee {
  attribute id { type uuid; key primary; }
  attribute fullName { type string; is required; label "Полное имя"; }
  attribute role { type Role; is required; default Executor; label "Роль"; }
  attribute position { type string; is nullable; label "Должность"; }
  attribute bossId { type uuid; is nullable; key foreign { relates Employee.id; } label "Руководитель"; }
  attribute price { type decimal(10,2); is required; label "Стоимость часа"; }
}`;

const BUG_CASE = `entity Equipment {
  attribute id { type uuid; key primary; }
  attribute serialNumber { type string; is required; }
}
entity ChangeEquipmentStatus {
  attribute equipmentId { type Equipment; }
  attribute date { type dateTime; is required; }
}`;

describe('validateInputSource', () => {
  it('reference DSL passes with no issues', () => {
    const r = validateInputSource(REFERENCE);
    assert.equal(r.ok, true, JSON.stringify(r.issues, null, 2));
  });
  it('bug-case DSL produces expected rule violations', () => {
    const r = validateInputSource(BUG_CASE);
    assert.equal(r.ok, false);
    const ruleIds = new Set(r.issues.map(i => i.rule));
    assert.ok(ruleIds.has('R1'), 'R1 missing PK on ChangeEquipmentStatus');
    assert.ok(ruleIds.has('R5'), 'R5 dateTime not lowercase');
    assert.ok(ruleIds.has('R7'), 'R7 type Equipment without FK wrapper');
    assert.ok(ruleIds.has('R17'), 'R17 missing labels');
  });
});

import { validateOutputAgainstInput } from './index.ts';

const INPUT_OK = `entity X { attribute id { type uuid; key primary; }
  attribute date { type datetime; is required; label "D"; } }`;

const OUTPUT_GOOD = `dto DTO.X { description "x"; attribute id { type uuid; map X.id; } attribute date { type datetime; is required; map X.date; } }
dto DTO.XCreate { description "x"; attribute date { type datetime; is required; map X.date; } }
dto DTO.XUpdate { description "x"; attribute date { type datetime; is nullable; map X.date; } }
dto DTO.XListRequest { description "x"; attribute filter { type DTO.Filter; is nullable; } attribute page { type DTO.PageRequest; } }
dto DTO.XListResponse { description "x"; attribute content { type DTO.X[]; } attribute pageInfo { type DTO.PageInfo; } }
api API.X { description "x";
  endpoint listX { label "POST /x/page"; attribute request { type DTO.XListRequest; } attribute response { type DTO.XListResponse; } }
  endpoint getX { label "GET /x/{id}"; attribute id { type uuid; } attribute response { type DTO.X; } }
  endpoint createX { label "POST /x"; attribute request { type DTO.XCreate; } }
  endpoint updateX { label "PATCH /x/{id}"; attribute id { type uuid; } attribute request { type DTO.XUpdate; } }
  endpoint deleteX { label "DELETE /x/{id}"; attribute id { type uuid; } } }`;

describe('validateOutputAgainstInput', () => {
  it('passes for clean output', () => {
    const r = validateOutputAgainstInput(INPUT_OK, OUTPUT_GOOD);
    assert.equal(r.ok, true, JSON.stringify(r.issues, null, 2));
  });
  it('fails when datetime is downgraded to date', () => {
    const broken = OUTPUT_GOOD.replace('attribute date { type datetime; is required; map X.date; }',
                                        'attribute date { type date; is required; map X.date; }');
    const r = validateOutputAgainstInput(INPUT_OK, broken);
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.rule === 'O3'));
  });
  it('fails when update is PUT', () => {
    const broken = OUTPUT_GOOD.replace('label "PATCH /x/{id}"', 'label "PUT /x/{id}"');
    const r = validateOutputAgainstInput(INPUT_OK, broken);
    assert.ok(r.issues.some(i => i.rule === 'O9'));
  });
});
