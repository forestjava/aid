import type { OutputRule, Issue } from '../../types.ts';

function toKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const TEMPLATES: Record<string, (k: string) => string> = {
  list: k => `POST /${k}/page`,
  get: k => `GET /${k}/{id}`,
  create: k => `POST /${k}`,
  update: k => `PATCH /${k}/{id}`,
  delete: k => `DELETE /${k}/{id}`,
};

export const ruleO8: OutputRule = {
  id: 'O8',
  check(input, output) {
    const entityNames = new Set(input.containers.filter(c => c.kind === 'entity').map(c => c.name));
    const issues: Issue[] = [];
    for (const c of output.containers) {
      if (c.kind !== 'api') continue;
      const apiSuffix = c.name.startsWith('API.') ? c.name.slice(4) : c.name;
      if (!entityNames.has(apiSuffix)) continue;
      const kebab = toKebab(apiSuffix);
      for (const ep of c.endpoints) {
        for (const verb of Object.keys(TEMPLATES)) {
          if (ep.name.startsWith(verb) && ep.name.slice(verb.length) === apiSuffix) {
            const expected = TEMPLATES[verb](kebab);
            if (ep.label !== expected) {
              issues.push({
                rule: 'O8', entity: c.name, attribute: ep.name, line: ep.position.line,
                message: `O8: ${c.name}.${ep.name} (line ${ep.position.line}): label '${ep.label ?? ''}' does not match expected '${expected}'.`,
              });
            }
            break;
          }
        }
      }
    }
    return issues;
  },
};
