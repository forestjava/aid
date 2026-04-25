import type { Rule, Issue, EntityNode } from '../../types.ts';

export const ruleR15: Rule = {
  id: 'R15',
  check(ast) {
    const entities = ast.containers.filter(c => c.kind === 'entity') as EntityNode[];
    const adj = new Map<string, string[]>();
    for (const e of entities) {
      const reqEdges: string[] = [];
      for (const a of e.attributes) {
        if (a.foreignRelates && a.isRequired) {
          const target = a.foreignRelates.split('.')[0];
          reqEdges.push(target);
        }
      }
      adj.set(e.name, reqEdges);
    }
    const issues: Issue[] = [];
    const reported = new Set<string>();
    for (const start of adj.keys()) {
      const stack: { node: string; path: string[] }[] = [{ node: start, path: [start] }];
      while (stack.length) {
        const { node, path } = stack.pop()!;
        for (const nxt of adj.get(node) ?? []) {
          if (nxt === start && path.length > 0) {
            const cyc = [...path, nxt];
            const key = [...new Set(path)].sort().join(',');
            if (!reported.has(key)) {
              reported.add(key);
              const e = entities.find(x => x.name === start)!;
              issues.push({
                rule: 'R15', entity: start, line: e.position.line,
                message: `required-cycle ${cyc.join(' -> ')}. At least one foreign key in the cycle must be 'is nullable'.`,
              });
            }
            continue;
          }
          if (!path.includes(nxt)) {
            stack.push({ node: nxt, path: [...path, nxt] });
          }
        }
      }
    }
    return issues;
  },
};
