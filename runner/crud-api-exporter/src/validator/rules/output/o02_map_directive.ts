import type { OutputRule, Issue } from '../../types.ts';

const SKIP_NAMES = new Set(['content', 'pageInfo', 'filter', 'page']);
const SKIP_DTO_SUFFIX = ['ListRequest', 'ListResponse'];

export const ruleO2: OutputRule = {
  id: 'O2',
  check(_input, output) {
    const issues: Issue[] = [];
    for (const c of output.containers) {
      if (c.kind !== 'dto') continue;
      if (SKIP_DTO_SUFFIX.some(s => c.name.endsWith(s))) continue;
      for (const a of c.attributes) {
        if (SKIP_NAMES.has(a.name)) continue;
        if (!a.mapTarget) {
          issues.push({
            rule: 'O2', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): missing 'map' directive.`,
          });
        }
      }
    }
    return issues;
  },
};
