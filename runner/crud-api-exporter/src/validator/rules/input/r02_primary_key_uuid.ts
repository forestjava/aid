import type { Rule, Issue } from '../../types.ts';

export const ruleR2: Rule = {
  id: 'R2',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (!a.isPrimary) continue;
        if (a.type !== 'uuid') {
          issues.push({
            rule: 'R2', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): primary key must be 'uuid', got '${a.type ?? '<none>'}'.`,
          });
        }
      }
    }
    return issues;
  },
};
