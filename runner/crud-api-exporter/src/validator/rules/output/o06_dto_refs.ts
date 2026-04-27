import type { OutputRule, Issue } from '../../types.ts';

const SHARED_DTO_PATTERN = /^DTO\.([A-Z][A-Za-z0-9]*)?(Filter|PageRequest|PageInfo)$/;

function stripArray(t: string): string { return t.endsWith('[]') ? t.slice(0, -2) : t; }

export const ruleO6: OutputRule = {
  id: 'O6',
  check(_input, output) {
    const declared = new Set(output.containers.filter(c => c.kind === 'dto').map(c => c.name));
    const issues: Issue[] = [];
    function checkRef(ref: string | null, where: string, line: number) {
      if (!ref) return;
      const t = stripArray(ref);
      if (!t.startsWith('DTO.')) return;
      if (SHARED_DTO_PATTERN.test(t)) return;
      if (!declared.has(t)) {
        issues.push({
          rule: 'O6', line,
          message: `reference to undefined DTO '${t}' at ${where} (line ${line}).`,
        });
      }
    }
    for (const c of output.containers) {
      if (c.kind === 'dto') {
        for (const a of c.attributes) checkRef(a.type, `${c.name}.${a.name}`, a.position.line);
      }
      if (c.kind === 'api') {
        for (const ep of c.endpoints) {
          for (const a of ep.attributes) checkRef(a.type, `${c.name}.${ep.name}.${a.name}`, a.position.line);
        }
      }
    }
    return issues;
  },
};
