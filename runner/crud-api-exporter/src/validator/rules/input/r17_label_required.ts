import type { Rule, Issue } from '../../types.ts';

export const ruleR17: Rule = {
  id: 'R17',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (a.isPrimary) continue;
        if (!a.label) {
          issues.push({
            rule: 'R17', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): missing 'label' directive (used by UI generator).`,
          });
        }
      }
    }
    return issues;
  },
};
