import type { OutputRule, Issue, EntityNode } from '../../types.ts';

export const ruleO3: OutputRule = {
  id: 'O3',
  check(input, output) {
    const entities = new Map<string, EntityNode>();
    for (const c of input.containers) if (c.kind === 'entity') entities.set(c.name, c);
    const issues: Issue[] = [];
    for (const c of output.containers) {
      if (c.kind !== 'dto') continue;
      let baseName = c.name.startsWith('DTO.') ? c.name.slice(4) : c.name;
      for (const sfx of ['ListRequest', 'ListResponse', 'Create', 'Update']) {
        if (baseName.endsWith(sfx)) { baseName = baseName.slice(0, -sfx.length); break; }
      }
      const ent = entities.get(baseName);
      if (!ent) continue;
      for (const a of c.attributes) {
        const entAttr = ent.attributes.find(x => x.name === a.name);
        if (!entAttr || !entAttr.type || !a.type) continue;
        if (entAttr.type !== a.type) {
          issues.push({
            rule: 'O3', entity: c.name, attribute: a.name, line: a.position.line,
            message: `O3: ${c.name}.${a.name} (line ${a.position.line}): type mismatch with ${ent.name}.${a.name}: DTO has '${a.type}', entity has '${entAttr.type}'.`,
          });
        }
      }
    }
    return issues;
  },
};
