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
