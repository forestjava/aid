import { describe, it, expect } from 'vitest';
import { buildSharedTypesUserPrompt, enumFileName } from './sharedTypesStage.js';
import type { FrozenContract } from '../contractFreeze.js';

function makeContract(overrides: Partial<FrozenContract> = {}): FrozenContract {
  return {
    sourceFiles: [],
    entities: [],
    enums: [],
    dtos: [],
    endpoints: [],
    ...overrides,
  };
}

describe('enumFileName', () => {
  it('kebab-cases a single PascalCase word', () => {
    expect(enumFileName('EquipmentStatus')).toBe('equipment-status');
  });

  it('handles already-lowercase names', () => {
    expect(enumFileName('status')).toBe('status');
  });

  it('handles consecutive capitals', () => {
    expect(enumFileName('HTTPStatus')).toBe('http-status');
  });

  it('does NOT pluralize', () => {
    expect(enumFileName('Kind')).toBe('kind');
  });
});

describe('buildSharedTypesUserPrompt', () => {
  it('lists the pagination file in required outputs', () => {
    const prompt = buildSharedTypesUserPrompt(makeContract());
    expect(prompt).toContain('server/src/shared/pagination.ts');
    expect(prompt).toContain('server/src/shared/index.ts');
  });

  it('lists an enum file for each enum in the contract', () => {
    const prompt = buildSharedTypesUserPrompt(
      makeContract({
        enums: [
          { name: 'EquipmentStatus', description: null, values: [{ name: 'Active', label: null }] },
          { name: 'OrderKind', description: null, values: [{ name: 'Planned', label: null }] },
        ],
      }),
    );
    expect(prompt).toContain('server/src/enums/equipment-status.enum.ts');
    expect(prompt).toContain('server/src/enums/order-kind.enum.ts');
  });

  it('embeds the contract enums as a JSON projection', () => {
    const prompt = buildSharedTypesUserPrompt(
      makeContract({
        enums: [{ name: 'EquipmentStatus', description: null, values: [{ name: 'Active', label: null }] }],
      }),
    );
    expect(prompt).toContain('"EquipmentStatus"');
    expect(prompt).toContain('"Active"');
  });

  it('surfaces list endpoints so the LLM understands pagination consumers', () => {
    const prompt = buildSharedTypesUserPrompt(
      makeContract({
        endpoints: [
          {
            apiName: 'Equipment',
            name: 'listEquipment',
            label: 'POST /equipment/page',
            method: 'POST',
            path: '/equipment/page',
            description: null,
            attributes: [],
          },
        ],
      }),
    );
    expect(prompt).toContain('listEquipment');
  });

  it('works on an empty contract without throwing', () => {
    const prompt = buildSharedTypesUserPrompt(makeContract());
    expect(prompt).toContain('server/src/shared/pagination.ts');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('declares the strict JSON response format', () => {
    const prompt = buildSharedTypesUserPrompt(makeContract());
    expect(prompt).toMatch(/"files"\s*:\s*\[/);
  });
});
