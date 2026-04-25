import type { Rule, Issue } from '../../types.ts';

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;

export const ruleR13: Rule = {
  id: 'R13',
  check(ast) {
    const issues: Issue[] = [];
    for (const c of ast.containers) {
      if (c.kind === 'entity' || c.kind === 'enum') {
        if (!PASCAL.test(c.name)) {
          issues.push({
            rule: 'R13', entity: c.name, line: c.position.line,
            message: `${c.kind} '${c.name}' (line ${c.position.line}): must be PascalCase.`,
          });
        }
      }
      if (c.kind === 'entity') {
        for (const a of c.attributes) {
          if (!CAMEL.test(a.name) && !PASCAL.test(a.name)) {
            issues.push({
              rule: 'R13', entity: c.name, attribute: a.name, line: a.position.line,
              message: `${c.name}.${a.name} (line ${a.position.line}): must be camelCase.`,
            });
          }
        }
      }
    }
    return issues;
  },
};
