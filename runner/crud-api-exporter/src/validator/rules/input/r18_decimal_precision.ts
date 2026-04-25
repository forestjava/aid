import type { Rule, Issue } from '../../types.ts';

export const ruleR18: Rule = {
  id: 'R18',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (a.type === 'decimal') {
          issues.push({
            rule: 'R18', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): 'decimal' must include precision and scale, e.g. 'decimal(10,2)'.`,
          });
        }
      }
    }
    return issues;
  },
};
