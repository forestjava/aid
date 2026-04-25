import { parseToAst } from './ast.ts';
import { runInputRules } from './runRules.ts';
import type { Rule, ValidationResult } from './types.ts';

import { ruleR1 } from './rules/input/r01_primary_key_exists.ts';
import { ruleR2 } from './rules/input/r02_primary_key_uuid.ts';
import { ruleR3 } from './rules/input/r03_type_present.ts';
import { ruleR4 } from './rules/input/r04_type_resolves.ts';
import { ruleR5 } from './rules/input/r05_primitive_whitelist.ts';
import { ruleR6 } from './rules/input/r06_required_or_nullable.ts';
import { ruleR7 } from './rules/input/r07_foreign_key_pattern.ts';
import { ruleR8 } from './rules/input/r08_relates_target.ts';
import { ruleR9 } from './rules/input/r09_default_in_enum.ts';
import { ruleR10 } from './rules/input/r10_uniqueness.ts';
import { ruleR11 } from './rules/input/r11_at_name_datetime.ts';
import { ruleR12 } from './rules/input/r12_enum_completeness.ts';
import { ruleR13 } from './rules/input/r13_naming_case.ts';
import { ruleR14 } from './rules/input/r14_array_reverse_fk.ts';
import { ruleR15 } from './rules/input/r15_required_cycle.ts';
import { ruleR16 } from './rules/input/r16_ascii_identifiers.ts';
import { ruleR17 } from './rules/input/r17_label_required.ts';
import { ruleR18 } from './rules/input/r18_decimal_precision.ts';

const INPUT_RULES: Rule[] = [
  ruleR1, ruleR2, ruleR3, ruleR4, ruleR5, ruleR6, ruleR7, ruleR8, ruleR9,
  ruleR10, ruleR11, ruleR12, ruleR13, ruleR14, ruleR15, ruleR16, ruleR17, ruleR18,
];

export interface InputValidationResult extends ValidationResult {
  parseErrors: { message: string; line: number }[];
}

export function validateInputSource(source: string): InputValidationResult {
  const { ast, errors } = parseToAst(source);
  if (errors.length > 0) {
    return { ok: false, issues: [], parseErrors: errors };
  }
  const r = runInputRules(ast, INPUT_RULES);
  return { ok: r.ok, issues: r.issues, parseErrors: [] };
}

export { parseToAst };
