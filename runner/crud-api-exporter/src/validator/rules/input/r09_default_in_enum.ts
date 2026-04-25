import type { Rule, Issue, EnumNode } from '../../types.ts';

export const ruleR9: Rule = {
  id: 'R9',
  check(ast) {
    const enums = new Map<string, EnumNode>();
    for (const c of ast.containers) if (c.kind === 'enum') enums.set(c.name, c);
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (!a.defaultValue || !a.type) continue;
        const en = enums.get(a.type);
        if (!en) continue;
        if (!en.values.some(v => v.name === a.defaultValue)) {
          const available = en.values.map(v => v.name).join(', ');
          issues.push({
            rule: 'R9', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): default value '${a.defaultValue}' not found in enum '${en.name}'. Available: ${available}.`,
          });
        }
      }
    }
    return issues;
  },
};
