import type {
  FrozenContract,
  FrozenDto,
  FrozenEnum,
  FrozenEndpoint,
} from './contractFreeze.js';

export interface ReferencedEntityInfo {
  name: string;
  pkType: string;
}

export interface EntitySlice {
  entity: { name: string };
  dtos: FrozenDto[];
  enums: FrozenEnum[];
  endpoints: FrozenEndpoint[];
  referencedEntities: ReferencedEntityInfo[];
}

/**
 * Extracts a per-entity slice of the frozen contract: only the DTOs, enums,
 * endpoints, and FK references that the per-entity LLM call needs. This keeps
 * the input prompt small (token budget) and entity-scoped, so unrelated entity
 * details can never bleed into the generated module.
 */
export function sliceContractForEntity(
  contract: FrozenContract,
  entityName: string,
): EntitySlice {
  const dtos = contract.dtos.filter((d) => dtoBelongsToEntity(d, entityName));

  // Enum references: any DTO field whose type matches a known enum name.
  const enumNames = new Set<string>();
  for (const dto of dtos) {
    for (const field of dto.fields) {
      if (field.type && contract.enums.some((e) => e.name === field.type)) {
        enumNames.add(field.type);
      }
    }
  }
  const enums = contract.enums.filter((e) => enumNames.has(e.name));

  // Endpoints belonging to this entity (apiName == entityName per DSL convention).
  const endpoints = contract.endpoints.filter((ep) => ep.apiName === entityName);

  // Referenced entities: any DTO field whose `map` points to a different entity.
  const refNames = new Set<string>();
  for (const dto of dtos) {
    for (const field of dto.fields) {
      if (!field.map) continue;
      const [target] = field.map.split('.');
      if (target && target !== entityName) {
        refNames.add(target);
      }
    }
  }

  const referencedEntities: ReferencedEntityInfo[] = [...refNames]
    .sort()
    .map((name) => ({ name, pkType: lookupPrimaryKeyType(contract, name) }));

  return {
    entity: { name: entityName },
    dtos,
    enums,
    endpoints,
    referencedEntities,
  };
}

/**
 * A DTO belongs to entity `X` if its name matches the canonical convention
 * `X | XCreate | XUpdate`. Falls back to inspecting `field.map` prefixes when
 * the name does not match — useful for read-only or auxiliary DTOs.
 */
function dtoBelongsToEntity(dto: FrozenDto, entityName: string): boolean {
  if (
    dto.name === entityName ||
    dto.name === `${entityName}Create` ||
    dto.name === `${entityName}Update`
  ) {
    return true;
  }
  // Fallback: dominant map prefix.
  let owned = 0;
  let foreign = 0;
  for (const field of dto.fields) {
    if (!field.map) continue;
    const [target] = field.map.split('.');
    if (target === entityName) owned++;
    else if (target) foreign++;
  }
  return owned > 0 && owned >= foreign;
}

function lookupPrimaryKeyType(contract: FrozenContract, entityName: string): string {
  for (const dto of contract.dtos) {
    if (!dtoBelongsToEntity(dto, entityName)) continue;
    for (const field of dto.fields) {
      if (field.primary && field.type) return field.type;
    }
  }
  return 'uuid';
}

/**
 * Convert PascalCase entity name to its kebab-case plural resource slug used
 * for both NestJS module folders and React Admin resource folders.
 *
 * Rule (from CLAUDE.md §Naming conventions):
 *   - irregular cases listed explicitly (e.g. `Equipment` → `equipment`)
 *   - otherwise: PascalCase → kebab-case → append `s` (`es` if ends in `s`)
 *
 * Examples: Equipment → equipment, EquipmentType → equipment-types,
 * RepairOrder → repair-orders, Address → addresses.
 */
export function entityKebab(entityName: string): string {
  const irregulars: Record<string, string> = {
    Equipment: 'equipment',
  };
  if (irregulars[entityName]) return irregulars[entityName];

  const kebab = entityName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

  if (kebab.endsWith('s')) return `${kebab}es`;
  return `${kebab}s`;
}
