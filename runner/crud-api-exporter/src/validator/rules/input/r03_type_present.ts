import type { Rule, Issue } from '../../types.ts';

export const ruleR3: Rule = {
  id: 'R3',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (a.type === null) {
          issues.push({
            rule: 'R3', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): missing 'type' directive.`,
          });
        }
      }
    }
    return issues;
  },
};
