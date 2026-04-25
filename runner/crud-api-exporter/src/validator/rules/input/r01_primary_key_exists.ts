import type { Rule, Issue } from '../../types.ts';

export const ruleR1: Rule = {
  id: 'R1',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      const pks = c.attributes.filter(a => a.isPrimary);
      if (pks.length === 0) {
        issues.push({
          rule: 'R1', entity: c.name, line: c.position.line,
          message: `entity '${c.name}' (line ${c.position.line}): missing primary key. Add 'attribute id { type uuid; key primary; }'.`,
        });
      } else if (pks.length > 1) {
        issues.push({
          rule: 'R1', entity: c.name, line: c.position.line,
          message: `entity '${c.name}' (line ${c.position.line}): more than one primary key. Use a single 'attribute id { type uuid; key primary; }'.`,
        });
      }
    }
    return issues;
  },
};
