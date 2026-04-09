import { describe, it, expect } from 'vitest';
import { buildSharedTypesUserPrompt, enumFileName } from './sharedTypesStage.js';
import type { FrozenContract } from '../contractFreeze.js';

import { vi, beforeEach } from 'vitest';

vi.mock('../llmClient.js', () => ({
  callLLM: vi.fn(),
  extractCodeBlock: vi.fn((s: string) => s),
}));

import { callLLM } from '../llmClient.js';
import { runSharedTypesStage } from './sharedTypesStage.js';

const mockedCallLLM = vi.mocked(callLLM);

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

describe('runSharedTypesStage', () => {
  beforeEach(() => {
    mockedCallLLM.mockReset();
  });

  const oneEnumContract: FrozenContract = {
    sourceFiles: [],
    entities: [],
    enums: [
      {
        name: 'EquipmentStatus',
        description: null,
        values: [
          { name: 'Active', label: null },
          { name: 'Repair', label: null },
        ],
      },
    ],
    dtos: [],
    endpoints: [],
  };

  function llmReturns(files: Array<{ path: string; content: string }>) {
    mockedCallLLM.mockResolvedValue({
      content: JSON.stringify({ files }),
      usage: null,
    });
  }

  it('returns the files the LLM produced when they are in-zone', async () => {
    llmReturns([
      { path: 'server/src/enums/equipment-status.enum.ts', content: 'export enum EquipmentStatus {}' },
      { path: 'server/src/shared/pagination.ts', content: 'export interface PaginatedResponse<T> { data: T[]; total: number; }' },
      { path: 'server/src/shared/index.ts', content: "export * from './pagination';" },
    ]);

    const result = await runSharedTypesStage({ contract: oneEnumContract });

    expect(result.files).toHaveLength(3);
    expect(result.files.map((f) => f.path)).toEqual([
      'server/src/enums/equipment-status.enum.ts',
      'server/src/shared/pagination.ts',
      'server/src/shared/index.ts',
    ]);
  });

  it('drops files returned outside the allowed zones', async () => {
    llmReturns([
      { path: 'server/src/enums/equipment-status.enum.ts', content: 'export enum X {}' },
      { path: 'server/src/modules/foo/foo.module.ts', content: 'export class FooModule {}' },
    ]);

    const result = await runSharedTypesStage({ contract: oneEnumContract });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('server/src/enums/equipment-status.enum.ts');
  });

  it('throws when the LLM returns zero in-zone files', async () => {
    llmReturns([{ path: 'server/src/modules/foo.ts', content: 'x' }]);

    await expect(runSharedTypesStage({ contract: oneEnumContract })).rejects.toThrow(
      /no in-zone files returned/,
    );
  });

  it('throws when the LLM returns invalid JSON', async () => {
    mockedCallLLM.mockResolvedValue({
      content: 'this is not json at all',
      usage: null,
    });

    await expect(runSharedTypesStage({ contract: oneEnumContract })).rejects.toThrow();
  });

  it('appends previousError to the user prompt when repair feedback is supplied', async () => {
    llmReturns([
      { path: 'server/src/shared/pagination.ts', content: 'x' },
      { path: 'server/src/shared/index.ts', content: 'x' },
    ]);

    await runSharedTypesStage({
      contract: oneEnumContract,
      previousError: 'error: Missing file: server/src/shared/pagination.ts',
    });

    expect(mockedCallLLM).toHaveBeenCalledOnce();
    const userPrompt = mockedCallLLM.mock.calls[0][0].userPrompt;
    expect(userPrompt).toContain('PREVIOUS ATTEMPT FAILED');
    expect(userPrompt).toContain('Missing file: server/src/shared/pagination.ts');
  });

  it('calls the LLM with label "shared-types"', async () => {
    llmReturns([{ path: 'server/src/shared/pagination.ts', content: 'x' }]);

    await runSharedTypesStage({ contract: oneEnumContract });

    expect(mockedCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'shared-types' }),
    );
  });
});
