import type { Rule, Issue } from '../../types.ts';

const PRIMITIVES = new Set(['string', 'text', 'integer', 'decimal', 'boolean', 'uuid', 'date', 'datetime']);
// Names that R5 specifically flags as case-mistake primitives.
// R4 cedes these so we don't double-report.
const R5_KNOWN_BAD = new Set(['Number', 'number', 'Date', 'DateTime', 'dateTime', 'String', 'Integer', 'Boolean', 'UUID', 'Uuid']);

function stripArray(t: string): string {
  return t.endsWith('[]') ? t.slice(0, -2) : t;
}
function stripDecimalArgs(t: string): string {
  const i = t.indexOf('(');
  return i > 0 ? t.slice(0, i) : t;
}

export const ruleR4: Rule = {
  id: 'R4',
  check(ast) {
    const knownNames = new Set<string>();
    for (const c of ast.containers) knownNames.add(c.name);

    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (a.type === null) continue;
        const t = stripDecimalArgs(stripArray(a.type));
        if (R5_KNOWN_BAD.has(t)) continue;
        if (PRIMITIVES.has(t)) continue;
        if (knownNames.has(t)) continue;
        issues.push({
          rule: 'R4', entity: c.name, attribute: a.name, line: a.position.line,
          message: `${c.name}.${a.name} (line ${a.position.line}): unknown type '${a.type}'. Expected a primitive [${[...PRIMITIVES].join(', ')}] or a declared entity/enum.`,
        });
      }
    }
    return issues;
  },
};
