import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseToAst } from './ast.ts';

describe('parseToAst', () => {
  it('parses a single entity with primary key', () => {
    const src = `entity Equipment {
  attribute id {
    type uuid;
    key primary;
  }
  attribute name {
    type string;
    is required;
    label "Название";
  }
}`;
    const { ast, errors } = parseToAst(src);
    assert.deepEqual(errors, []);
    assert.equal(ast.containers.length, 1);
    const e = ast.containers[0];
    assert.equal(e.kind, 'entity');
    assert.equal(e.name, 'Equipment');
    if (e.kind !== 'entity') throw new Error('typing');
    assert.equal(e.attributes.length, 2);
    const id = e.attributes[0];
    assert.equal(id.name, 'id');
    assert.equal(id.type, 'uuid');
    assert.equal(id.isPrimary, true);
    const name = e.attributes[1];
    assert.equal(name.name, 'name');
    assert.equal(name.type, 'string');
    assert.equal(name.isRequired, true);
    assert.equal(name.label, 'Название');
  });

  it('parses enum with values and labels', () => {
    const src = `enum Role {
  value Signer { label "Подписант"; }
  value User { label "Пользователь"; }
}`;
    const { ast, errors } = parseToAst(src);
    assert.deepEqual(errors, []);
    const en = ast.containers[0];
    assert.equal(en.kind, 'enum');
    assert.equal(en.name, 'Role');
    if (en.kind !== 'enum') throw new Error('typing');
    assert.equal(en.values.length, 2);
    assert.equal(en.values[0].name, 'Signer');
    assert.equal(en.values[0].label, 'Подписант');
  });

  it('captures map, foreign relates, default', () => {
    const src = `entity X {
  attribute id { type uuid; key primary; }
  attribute eq {
    type uuid;
    is required;
    key foreign { relates Equipment.id; }
    map Equipment.id;
  }
  attribute s {
    type Status;
    is required;
    default Active;
    label "S";
  }
}`;
    const { ast, errors } = parseToAst(src);
    assert.deepEqual(errors, []);
    const e = ast.containers[0];
    if (e.kind !== 'entity') throw new Error('typing');
    const eq = e.attributes.find(a => a.name === 'eq')!;
    assert.equal(eq.foreignRelates, 'Equipment.id');
    assert.equal(eq.mapTarget, 'Equipment.id');
    const s = e.attributes.find(a => a.name === 's')!;
    assert.equal(s.defaultValue, 'Active');
  });

  it('returns parse error for invalid DSL', () => {
    const { errors } = parseToAst('not a valid dsl @@@');
    assert.equal(errors.length > 0, true);
    assert.match(errors[0].message, /Expected/);
  });

  it('parses dto and api containers', () => {
    const src = `dto DTO.Equipment {
  description "Полный объект";
  attribute id { type uuid; map Equipment.id; }
}
api API.Equipment {
  description "API";
  endpoint listEquipment {
    label "POST /equipment/page";
    attribute request { type DTO.EquipmentListRequest; }
  }
}`;
    const { ast, errors } = parseToAst(src);
    assert.deepEqual(errors, []);
    assert.equal(ast.containers.length, 2);
    const dto = ast.containers[0];
    assert.equal(dto.kind, 'dto');
    assert.equal(dto.name, 'DTO.Equipment');
    const api = ast.containers[1];
    assert.equal(api.kind, 'api');
    assert.equal(api.name, 'API.Equipment');
    if (api.kind !== 'api') throw new Error('typing');
    assert.equal(api.endpoints.length, 1);
    assert.equal(api.endpoints[0].label, 'POST /equipment/page');
  });
});
