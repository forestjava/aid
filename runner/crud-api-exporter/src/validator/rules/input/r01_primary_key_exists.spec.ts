import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleR1 } from './r01_primary_key_exists.ts';
import { parseToAst } from '../../ast.ts';

describe('R1 primary key exists', () => {
  it('passes when entity has primary key', () => {
    const { ast } = parseToAst(`entity X { attribute id { type uuid; key primary; } }`);
    assert.deepEqual(ruleR1.check(ast), []);
  });
  it('fails when entity has no primary key', () => {
    const { ast } = parseToAst(`entity X { attribute name { type string; is required; } }`);
    const issues = ruleR1.check(ast);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].rule, 'R1');
    assert.equal(issues[0].entity, 'X');
    assert.match(issues[0].message, /missing primary key/);
  });
  it('fails when entity has two primary keys', () => {
    const { ast } = parseToAst(`entity X { attribute a { type uuid; key primary; } attribute b { type uuid; key primary; } }`);
    const issues = ruleR1.check(ast);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /more than one primary key/);
  });
});
