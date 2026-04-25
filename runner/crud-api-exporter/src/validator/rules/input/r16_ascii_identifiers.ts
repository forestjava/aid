import type { Rule, Issue } from '../../types.ts';

const ASCII_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const ruleR16: Rule = {
  id: 'R16',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (!ASCII_ID.test(c.name)) {
        issues.push({
          rule: 'R16', entity: c.name, line: c.position.line,
          message: `${c.kind} '${c.name}' (line ${c.position.line}): identifier must be ASCII [A-Za-z_][A-Za-z0-9_]*. Move human-readable text to 'label'.`,
        });
      }
      if (c.kind === 'entity' || c.kind === 'dto') {
        for (const a of c.attributes) {
          if (!ASCII_ID.test(a.name)) {
            issues.push({
              rule: 'R16', entity: c.name, attribute: a.name, line: a.position.line,
              message: `${c.name}.${a.name} (line ${a.position.line}): identifier must be ASCII.`,
            });
          }
        }
      }
      if (c.kind === 'enum') {
        for (const v of c.values) {
          if (!ASCII_ID.test(v.name)) {
            issues.push({
              rule: 'R16', entity: c.name, line: v.position.line,
              message: `enum value '${v.name}' (line ${v.position.line}): identifier must be ASCII [A-Za-z_][A-Za-z0-9_]*. Move human-readable text to 'label'.`,
            });
          }
        }
      }
    }
    return issues;
  },
};
