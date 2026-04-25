import type { Ast, Rule, OutputRule, ValidationResult } from './types.ts';

export function runInputRules(ast: Ast, rules: Rule[]): ValidationResult {
  const issues = rules.flatMap(r => r.check(ast));
  return { ok: issues.length === 0, issues };
}

export function runOutputRules(input: Ast, output: Ast, rules: OutputRule[]): ValidationResult {
  const issues = rules.flatMap(r => r.check(input, output));
  return { ok: issues.length === 0, issues };
}
