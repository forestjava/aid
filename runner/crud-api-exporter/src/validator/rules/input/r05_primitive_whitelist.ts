import type { Rule, Issue } from '../../types.ts';

const WHITELIST = ['string', 'text', 'integer', 'decimal', 'boolean', 'uuid', 'date', 'datetime'];
const WHITELIST_SET = new Set(WHITELIST);
const KNOWN_BAD = new Set(['Number', 'number', 'Date', 'DateTime', 'dateTime', 'String', 'Integer', 'Boolean', 'UUID', 'Uuid']);

function stripArray(t: string): string { return t.endsWith('[]') ? t.slice(0, -2) : t; }
function stripDecimalArgs(t: string): string { const i = t.indexOf('('); return i > 0 ? t.slice(0, i) : t; }

export const ruleR5: Rule = {
  id: 'R5',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind !== 'entity') continue;
      for (const a of c.attributes) {
        if (a.type === null) continue;
        const t = stripDecimalArgs(stripArray(a.type));
        if (WHITELIST_SET.has(t)) continue;
        if (KNOWN_BAD.has(t)) {
          issues.push({
            rule: 'R5', entity: c.name, attribute: a.name, line: a.position.line,
            message: `${c.name}.${a.name} (line ${a.position.line}): primitive type must be lowercase from whitelist [${WHITELIST.join(', ')}]. Got '${a.type}'.`,
          });
        }
      }
    }
    return issues;
  },
};
