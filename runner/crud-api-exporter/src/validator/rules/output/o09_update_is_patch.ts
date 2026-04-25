import type { OutputRule, Issue } from '../../types.ts';

export const ruleO9: OutputRule = {
  id: 'O9',
  check(_input, output) {
    const issues: Issue[] = [];
    for (const c of output.containers) {
      if (c.kind !== 'api') continue;
      for (const ep of c.endpoints) {
        if (!ep.name.startsWith('update')) continue;
        const verb = ep.label?.split(' ')[0] ?? '';
        if (verb && verb !== 'PATCH') {
          issues.push({
            rule: 'O9', entity: c.name, attribute: ep.name, line: ep.position.line,
            message: `${c.name}.${ep.name} (line ${ep.position.line}): method must be 'PATCH', got '${verb}'.`,
          });
        }
      }
    }
    return issues;
  },
};
