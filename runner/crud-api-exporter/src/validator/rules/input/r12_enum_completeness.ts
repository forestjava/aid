import type { Rule, Issue } from '../../types.ts';

export const ruleR12: Rule = {
  id: 'R12',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'enum') continue;
      if (c.values.length === 0) {
        issues.push({
          rule: 'R12', entity: c.name, line: c.position.line,
          message: `enum '${c.name}' (line ${c.position.line}): empty enum.`,
        });
        continue;
      }
      for (const v of c.values) {
        if (!v.label) {
          issues.push({
            rule: 'R12', entity: c.name, line: v.position.line,
            message: `enum '${c.name}' (line ${v.position.line}): value '${v.name}' has no 'label'.`,
          });
        }
      }
    }
    return issues;
  },
};
