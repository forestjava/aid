import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dslGrammar } from './grammar.ts';

describe('grammar', () => {
  it('loads ohm grammar from shared/grammar.ohm', () => {
    assert.equal(dslGrammar.name, 'DSL');
  });

  it('parses a minimal entity', () => {
    const m = dslGrammar.match('entity X { attribute id { type uuid; key primary; } }');
    assert.ok(m.succeeded(), m.failed() ? m.message : 'parse failed');
  });
});
