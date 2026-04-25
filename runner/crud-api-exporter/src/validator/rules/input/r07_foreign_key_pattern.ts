import type { Rule, Issue } from '../../types.ts';

export const ruleR7: Rule = {
  id: 'R7',
  check(ast) {
    const entityNames = new Set(ast.containers.filter(c => c.kind === 'entity').map(c => c.name));
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (a.type === null) continue;
        if (a.type.endsWith('[]')) continue;
        if (!entityNames.has(a.type)) continue;
        // attribute type points at another entity. Must be wrapped: type uuid + key foreign relates X.
        issues.push({
          rule: 'R7', entity: c.name, attribute: a.name, line: a.position.line,
          message: `${c.name}.${a.name} (line ${a.position.line}): foreign key column must be 'type uuid' with 'key foreign { relates ${a.type}.id; }'. Got 'type ${a.type}'.`,
        });
      }
    }
    return issues;
  },
};
