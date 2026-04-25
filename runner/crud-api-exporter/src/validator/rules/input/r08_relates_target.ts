import type { Rule, Issue, EntityNode } from '../../types.ts';

export const ruleR8: Rule = {
  id: 'R8',
  check(ast) {
    const entities = new Map<string, EntityNode>();
    for (const c of ast.containers) if (c.kind === 'entity') entities.set(c.name, c);
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (!a.foreignRelates) continue;
        const dot = a.foreignRelates.indexOf('.');
        if (dot < 0) continue;
        const entityName = a.foreignRelates.slice(0, dot);
        const fieldName = a.foreignRelates.slice(dot + 1);
        const target = entities.get(entityName);
        if (!target) {
          issues.push({
            rule: 'R8', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): 'relates ${a.foreignRelates}' — unknown entity '${entityName}'.`,
          });
          continue;
        }
        if (!target.attributes.some(x => x.name === fieldName)) {
          const available = target.attributes.map(x => x.name).join(', ');
          issues.push({
            rule: 'R8', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): 'relates ${a.foreignRelates}' — field '${fieldName}' not found in entity '${entityName}'. Available: ${available}.`,
          });
        }
      }
    }
    return issues;
  },
};
