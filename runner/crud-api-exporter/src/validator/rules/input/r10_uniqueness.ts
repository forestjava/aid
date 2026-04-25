import type { Rule, Issue } from '../../types.ts';

export const ruleR10: Rule = {
  id: 'R10',
  check(ast) {
    const issues: Issue[] = [];
    const seenContainer = new Map<string, number[]>();
    for (const c of ast.containers) {
      const lines = seenContainer.get(c.name) ?? [];
      lines.push(c.position.line);
      seenContainer.set(c.name, lines);
    }
    for (const [name, lines] of seenContainer) {
      if (lines.length > 1) {
        issues.push({
          rule: 'R10', entity: name, line: lines[0],
          message: `duplicate entity '${name}' at lines ${lines.join(', ')}.`,
        });
      }
    }
    for (const c of ast.containers) {
      if (c.kind !== 'entity' && c.kind !== 'dto') continue;
      const seen = new Map<string, number[]>();
      for (const a of c.attributes) {
        const ls = seen.get(a.name) ?? [];
        ls.push(a.position.line);
        seen.set(a.name, ls);
      }
      for (const [name, ls] of seen) {
        if (ls.length > 1) {
          issues.push({
            rule: 'R10', entity: c.name, attribute: name, line: ls[0],
            message: `duplicate attribute '${c.name}.${name}' at lines ${ls.join(', ')}.`,
          });
        }
      }
    }
    return issues;
  },
};
