import type { OutputRule, Issue } from '../../types.ts';

const FORBIDDEN = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt']);

export const ruleO4: OutputRule = {
  id: 'O4',
  check(_input, output) {
    const issues: Issue[] = [];
    for (const c of output.containers) {
      if (c.kind !== 'dto' || !c.name.endsWith('Create')) continue;
      for (const a of c.attributes) {
        if (FORBIDDEN.has(a.name)) {
          issues.push({
            rule: 'O4', entity: c.name, attribute: a.name, line: a.position.line,
            message: `O4: ${c.name}.${a.name} (line ${a.position.line}): forbidden in Create-DTO (server-managed field).`,
          });
        }
      }
    }
    return issues;
  },
};
