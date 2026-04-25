import type { Rule, Issue } from '../../types.ts';

export const ruleR6: Rule = {
  id: 'R6',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (a.isPrimary) continue;
        const set = (a.isRequired ? 1 : 0) + (a.isNullable ? 1 : 0);
        if (set !== 1) {
          issues.push({
            rule: 'R6', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): must declare exactly one of 'is required' or 'is nullable'.`,
          });
        }
      }
    }
    return issues;
  },
};
