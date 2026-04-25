import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runInputRules, runOutputRules } from './runRules.ts';
import type { Rule, OutputRule, Ast } from './types.ts';

const emptyAst: Ast = { source: '', containers: [] };

describe('runRules', () => {
  it('runInputRules collects issues from all rules', () => {
    const a: Rule = { id: 'A', check: () => [{ rule: 'A', line: 1, message: 'a' }] };
    const b: Rule = { id: 'B', check: () => [{ rule: 'B', line: 2, message: 'b' }] };
    const r = runInputRules(emptyAst, [a, b]);
    assert.equal(r.issues.length, 2);
    assert.equal(r.ok, false);
  });

  it('runInputRules returns ok=true when no issues', () => {
    const a: Rule = { id: 'A', check: () => [] };
    const r = runInputRules(emptyAst, [a]);
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
  });

  it('runOutputRules passes both input and output to rules', () => {
    let seen: { i: Ast; o: Ast } | null = null;
    const r: OutputRule = { id: 'X', check: (i, o) => { seen = { i, o }; return []; } };
    runOutputRules(emptyAst, emptyAst, [r]);
    assert.ok(seen);
  });
});
