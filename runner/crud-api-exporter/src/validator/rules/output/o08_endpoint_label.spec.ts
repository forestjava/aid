import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleO8 } from './o08_endpoint_label.ts';
import { parseToAst } from '../../ast.ts';

const INPUT = `entity ChangeEquipmentStatus { attribute id { type uuid; key primary; } }`;

describe('O8 endpoint label', () => {
  it('passes with kebab-case path', () => {
    const out = `api API.ChangeEquipmentStatus { description "x";
  endpoint listChangeEquipmentStatus { label "POST /change-equipment-status/page"; attribute request { type DTO.ChangeEquipmentStatusListRequest; } } }`;
    const i = parseToAst(INPUT).ast;
    const o = parseToAst(out).ast;
    assert.deepEqual(ruleO8.check(i, o), []);
  });
  it('fails on camelCase path', () => {
    const out = `api API.ChangeEquipmentStatus { description "x";
  endpoint listChangeEquipmentStatus { label "POST /changeEquipmentStatus/page"; attribute request { type DTO.ChangeEquipmentStatusListRequest; } } }`;
    const i = parseToAst(INPUT).ast;
    const o = parseToAst(out).ast;
    const issues = ruleO8.check(i, o);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /does not match expected/);
  });
});
