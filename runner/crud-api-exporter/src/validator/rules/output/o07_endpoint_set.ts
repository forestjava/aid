import type { OutputRule, Issue, ApiNode } from '../../types.ts';

const REQUIRED = ['list', 'get', 'create', 'update', 'delete'];

export const ruleO7: OutputRule = {
  id: 'O7',
  check(input, output) {
    const apis = new Map<string, ApiNode>();
    for (const c of output.containers) if (c.kind === 'api') apis.set(c.name, c);
    const issues: Issue[] = [];
    for (const c of input.containers) {
      if (c.kind !== 'entity') continue;
      const apiName = `API.${c.name}`;
      const api = apis.get(apiName);
      if (!api) {
        issues.push({
          rule: 'O7', entity: c.name, line: c.position.line,
          message: `O7: missing API container '${apiName}'.`,
        });
        continue;
      }
      for (const verb of REQUIRED) {
        const expected = `${verb}${c.name}`;
        if (!api.endpoints.some(ep => ep.name === expected)) {
          issues.push({
            rule: 'O7', entity: c.name, line: api.position.line,
            message: `O7: missing endpoint '${expected}' in '${apiName}'.`,
          });
        }
      }
    }
    return issues;
  },
};
