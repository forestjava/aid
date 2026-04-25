import type { OutputRule, Issue } from '../../types.ts';

const SUFFIXES = ['', 'Create', 'Update', 'ListRequest', 'ListResponse'];

export const ruleO1: OutputRule = {
  id: 'O1',
  check(input, output) {
    const dtoNames = new Set(output.containers.filter(c => c.kind === 'dto').map(c => c.name));
    const issues: Issue[] = [];
    for (const c of input.containers) {
      if (c.kind !== 'entity') continue;
      for (const sfx of SUFFIXES) {
        const expected = `DTO.${c.name}${sfx}`;
        if (!dtoNames.has(expected)) {
          issues.push({
            rule: 'O1', entity: c.name, line: c.position.line,
            message: `O1: missing DTO '${expected}' for entity '${c.name}'.`,
          });
        }
      }
    }
    return issues;
  },
};
