import type { Rule, Issue } from '../../types.ts';

export const ruleR11: Rule = {
  id: 'R11',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        const isAtName = /At$/.test(a.name) || a.name === 'timestamp';
        if (!isAtName) continue;
        if (a.type !== 'datetime') {
          issues.push({
            rule: 'R11', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): attribute name suggests timestamp — type must be 'datetime', got '${a.type ?? '<none>'}'.`,
          });
        }
      }
    }
    return issues;
  },
};
