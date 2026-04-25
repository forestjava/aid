import type { Rule, Issue } from '../../types.ts';

export const ruleR14: Rule = {
  id: 'R14',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (!a.type || !a.type.endsWith('[]')) continue;
        const childTypeName = a.type.slice(0, -2);
        const child = ast.containers.find(x => x.kind === 'entity' && x.name === childTypeName);
        if (!child || child.kind !== 'entity') continue;
        const hasReverseFk = child.attributes.some(x => x.foreignRelates?.startsWith(`${c.name}.`));
        if (!hasReverseFk) {
          issues.push({
            rule: 'R14', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): array type '${a.type}' requires reverse foreign key in '${childTypeName}'. 1:many is generated from the FK side; do not declare the array on the parent side.`,
          });
        }
      }
    }
    return issues;
  },
};
