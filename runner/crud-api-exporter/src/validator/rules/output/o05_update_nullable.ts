import type { OutputRule, Issue } from '../../types.ts';

export const ruleO5: OutputRule = {
  id: 'O5',
  check(_input, output) {
    const issues: Issue[] = [];
    for (const c of output.containers) {
      if (c.kind !== 'dto' || !c.name.endsWith('Update')) continue;
      for (const a of c.attributes) {
        if (!a.isNullable) {
          issues.push({
            rule: 'O5', entity: c.name, attribute: a.name, line: a.position.line,
            message: `O5: ${c.name}.${a.name} (line ${a.position.line}): must be 'is nullable' (PATCH semantics).`,
          });
        }
      }
    }
    return issues;
  },
};
