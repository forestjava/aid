import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const API_SUMMARY_TOOL = fileURLToPath(
  new URL('../../context/tools/api-summary.mjs', import.meta.url),
);

export interface FrozenEnumValue {
  name: string;
  label: string | null;
}

export interface FrozenEnum {
  name: string;
  description: string | null;
  values: FrozenEnumValue[];
}

export interface FrozenDtoField {
  name: string;
  type: string | null;
  required: boolean;
  nullable: boolean;
  unique: boolean;
  primary: boolean;
  description: string | null;
  map: string | null;
  sync: boolean;
  label: string | null;
}

export interface FrozenDto {
  name: string;
  description: string | null;
  fields: FrozenDtoField[];
}

export interface FrozenEndpointAttr {
  name: string;
  type: string | null;
  description: string | null;
}

export interface FrozenEndpoint {
  apiName: string;
  name: string;
  label: string | null;
  method: string | null;
  path: string | null;
  description: string | null;
  attributes: FrozenEndpointAttr[];
}

export interface FrozenEntity {
  /** Entity name derived from `Entity.field` map references in DTOs. */
  name: string;
}

export interface FrozenContract {
  sourceFiles: string[];
  entities: FrozenEntity[];
  enums: FrozenEnum[];
  dtos: FrozenDto[];
  endpoints: FrozenEndpoint[];
}

interface ApiSummaryShape {
  sourceFiles: string[];
  enums: FrozenEnum[];
  dtos: FrozenDto[];
  apis: Array<{
    name: string;
    description: string | null;
    endpoints: Array<Omit<FrozenEndpoint, 'apiName'>>;
  }>;
}

/**
 * Parses the DSL into a normalized FrozenContract by reusing the canonical
 * api-summary.mjs tool. The DSL string is written into a temp directory laid
 * out as `domain/<file>.api.dsl` so the tool's file discovery picks it up.
 */
export async function freezeContract(dslContent: string): Promise<FrozenContract> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'contract-freeze-'));
  try {
    const domainDir = path.join(tempRoot, 'domain');
    await fs.mkdir(domainDir, { recursive: true });
    await fs.writeFile(path.join(domainDir, 'input.api.dsl'), dslContent, 'utf8');

    const mod = (await import(API_SUMMARY_TOOL)) as {
      buildApiSummary: (rootDir: string) => ApiSummaryShape;
    };
    const summary = mod.buildApiSummary(tempRoot);

    const endpoints: FrozenEndpoint[] = [];
    for (const api of summary.apis) {
      for (const ep of api.endpoints) {
        endpoints.push({ apiName: api.name, ...ep });
      }
    }

    const entityNames = new Set<string>();
    for (const dto of summary.dtos) {
      for (const field of dto.fields) {
        if (field.map) {
          const [entity] = field.map.split('.');
          if (entity) entityNames.add(entity);
        }
      }
    }

    return {
      sourceFiles: summary.sourceFiles,
      entities: [...entityNames].sort().map((name) => ({ name })),
      enums: summary.enums,
      dtos: summary.dtos,
      endpoints,
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
