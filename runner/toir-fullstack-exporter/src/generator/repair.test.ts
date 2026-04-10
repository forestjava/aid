import { describe, it, expect } from 'vitest';
import { failuresForStage, parseValidatorFailures } from './repair.js';

describe('STAGE_ZONES attribution for shared-types', () => {
  it('attributes server/src/enums/*.ts failures to shared-types', () => {
    const failures = parseValidatorFailures(
      '- Missing file: server/src/enums/equipment-status.enum.ts\n',
    );
    const owned = failuresForStage(failures, 'shared-types');
    expect(owned).toHaveLength(1);
    expect(owned[0].files).toContain('server/src/enums/equipment-status.enum.ts');
  });

  it('attributes server/src/shared/*.ts failures to shared-types', () => {
    const failures = parseValidatorFailures(
      '- Missing file: server/src/shared/pagination.ts\n',
    );
    const owned = failuresForStage(failures, 'shared-types');
    expect(owned).toHaveLength(1);
  });

  it('does NOT attribute enum failures to nest-entities anymore', () => {
    const failures = parseValidatorFailures(
      '- Missing file: server/src/enums/equipment-status.enum.ts\n',
    );
    const owned = failuresForStage(failures, 'nest-entities');
    expect(owned).toHaveLength(0);
  });

  it('still attributes module failures to nest-entities', () => {
    const failures = parseValidatorFailures(
      '- Missing file: server/src/modules/equipment/equipment.module.ts\n',
    );
    const owned = failuresForStage(failures, 'nest-entities');
    expect(owned).toHaveLength(1);
  });
});
