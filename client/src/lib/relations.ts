import { HEADER_HANDLE_ID, type DatabaseSchema, type Entity, type EntityAttribute, type EntityRelation, type RelationType } from '@/components/workspace/Preview/types';

/**
 * Создает relations между сущностями на основе типа атрибута (односторонние internal связи).
 * Атрибут со сложным типом соединяется с primary key целевой сущности.
 * Также обрабатывает embedded-атрибуты (из зависимых сущностей).
 */
export function buildNavigationRelations(entities: Entity[], schema?: Partial<DatabaseSchema>): EntityRelation[] {
  // Если filter === 'external', internal связи не нужны
  if (schema?.filter === 'external') {
    return [];
  }

  const entityMap = new Map(entities.map(e => [e.name, e]));
  const relationsMap = new Map<string, EntityRelation>();

  /**
   * Создаёт navigation relation для одного атрибута.
   * navigationPath — путь для Handle ID (attr.name или parentAttr.embAttr для embedded).
   */
  function processNavAttr(entity: Entity, attr: EntityAttribute, navigationPath: string): void {
    if (!attr.type) return;

    const targetEntity = entityMap.get(attr.type);
    if (!targetEntity) return;

    const primaryKeyAttr = targetEntity.attributes.find(a => a.isPrimaryKey);
    const targetAttrName = primaryKeyAttr?.name ?? HEADER_HANDLE_ID;

    const relationKey = `${entity.name}.${navigationPath}->${targetEntity.name}.${targetAttrName}`;
    if (relationsMap.has(relationKey)) return;

    const entityRank = entity.rank ?? 0;
    const targetRank = targetEntity.rank ?? 0;
    const isForward = entityRank < targetRank;

    const [sourceEntity, sourceNavigation, destEntity, destNavigation] = isForward
      ? [entity, navigationPath, targetEntity, targetAttrName]
      : [targetEntity, targetAttrName, entity, navigationPath];

    const paletteIndex = primaryKeyAttr?.paletteIndex ?? relationsMap.size;

    attr.hasConnection = isForward ? 'source' : 'target';
    attr.isNavigation = true;
    attr.paletteIndex = paletteIndex;

    if (primaryKeyAttr) {
      primaryKeyAttr.hasConnection = mergeConnectionRole(
        primaryKeyAttr.hasConnection,
        isForward ? 'target' : 'source'
      );
      primaryKeyAttr.paletteIndex = paletteIndex;
    } else {
      targetEntity.hasHeaderConnection = mergeConnectionRole(
        targetEntity.hasHeaderConnection,
        isForward ? 'target' : 'source'
      );
    }

    relationsMap.set(relationKey, {
      source: sourceEntity.name,
      sourceNavigation: sourceNavigation,
      target: destEntity.name,
      targetNavigation: destNavigation,
      paletteIndex,
      type: 'internal',
    });
  }

  function processAttrsRecursive(entity: Entity, attributes: EntityAttribute[], prefix: string): void {
    for (const attr of attributes) {
      const navPath = prefix ? `${prefix}.${attr.name}` : attr.name;
      processNavAttr(entity, attr, navPath);
      if (attr.embeddedEntity) {
        processAttrsRecursive(entity, attr.embeddedEntity.attributes, navPath);
      }
    }
  }

  for (const entity of entities) {
    processAttrsRecursive(entity, entity.attributes, '');
  }

  return Array.from(relationsMap.values());
}

/**
 * Объединяет роли связи для атрибута (для external связей атрибут может быть и source, и target)
 */
function mergeConnectionRole(
  current: 'source' | 'target' | 'both' | undefined,
  newRole: 'source' | 'target'
): 'source' | 'target' | 'both' {
  if (!current) return newRole;
  if (current === 'both') return 'both';
  if (current === newRole) return current;
  return 'both'; // current и newRole разные → 'both'
}

/**
 * Создаёт клоны сущностей на основе явно указанных имён клонов (clone).
 * Клоны создаются ТОЛЬКО когда у sync явно указан clone.
 * Группирует по clone: один клон на каждое уникальное имя клона.
 * В оригинальной сущности sync с clone удаляются (связи только с клонами).
 * Модифицирует массив entities, добавляя клоны.
 */
export function expandMultipleSyncs(entities: Entity[]): void {
  const clonesToAdd: Entity[] = [];
  
  for (const entity of entities) {
    // Собираем уникальные имена клонов из sync и typeClones
    const cloneNames = new Set<string>();
    for (const attr of entity.attributes) {
      if (attr.sync) {
        for (const s of attr.sync) {
          if (s.clone) cloneNames.add(s.clone);
        }
      }
      if (attr.typeClones) {
        for (const tc of attr.typeClones) {
          cloneNames.add(tc.clone);
        }
      }
    }
    
    // Создаём клон для каждого уникального имени
    for (const cloneName of cloneNames) {
      clonesToAdd.push({
        name: `${entity.name}(${cloneName})`,
        label: entity.label ? `${entity.label} (${cloneName})` : `(${cloneName})`,
        type: entity.type,
        rank: entity.rank,
        attributes: entity.attributes.map(attr => {
          const cloneAttr = {
            ...attr,
            sync: attr.sync?.filter(s => s.clone === cloneName) || undefined,
          };
          if (attr.typeClones) {
            const match = attr.typeClones.find(tc => tc.clone === cloneName);
            if (match) {
              cloneAttr.type = match.type;
              cloneAttr.isCollection = match.isCollection;
            }
            delete cloneAttr.typeClones;
          }
          return cloneAttr;
        }),
      });
    }
    
    // В оригинале оставляем только sync без clone и убираем typeClones
    for (const attr of entity.attributes) {
      if (attr.sync) {
        const syncsWithoutClone = attr.sync.filter(s => !s.clone);
        attr.sync = syncsWithoutClone.length > 0 ? syncsWithoutClone : undefined;
      }
      if (attr.typeClones) {
        delete attr.typeClones;
      }
    }
  }
  
  entities.push(...clonesToAdd);
}

/**
 * Удаляет неиспользуемые сущности: оригиналы, полностью заменённые клонами,
 * и клоны «про запас», на которые никто не ссылается.
 * Обычные сущности без клонов не затрагиваются.
 */
export function removeUnusedEntities(entities: Entity[]): void {
  const clonedBaseNames = new Set<string>();
  for (const entity of entities) {
    const match = entity.name.match(/^(.+)\(.+\)$/);
    if (match) {
      clonedBaseNames.add(match[1]);
    }
  }

  const entityNames = new Set(entities.map(e => e.name));

  // Собираем имена сущностей, на которые ссылаются через type или как цель sync
  const referencedNames = new Set<string>();
  for (const entity of entities) {
    for (const attr of entity.attributes) {
      if (attr.type) {
        referencedNames.add(attr.type);
      }
      if (attr.sync) {
        for (const s of attr.sync) {
          const parts = s.target.split('.');
          for (let i = parts.length; i >= 1; i--) {
            const prefix = parts.slice(0, i).join('.');
            if (entityNames.has(prefix)) {
              referencedNames.add(prefix);
              break;
            }
          }
        }
      }
    }
  }

  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    const isClone = /\(.+\)$/.test(entity.name);
    const hasClones = clonedBaseNames.has(entity.name);
    if (!hasClones && !isClone) continue;

    // Проверяем, есть ли хотя бы один sync, резолвящийся в известную сущность
    const hasResolvableSync = entity.attributes.some(attr =>
      attr.sync && attr.sync.some(s => {
        const parts = s.target.split('.');
        for (let j = parts.length; j >= 1; j--) {
          if (entityNames.has(parts.slice(0, j).join('.'))) return true;
        }
        return false;
      })
    );

    if (!hasResolvableSync && !referencedNames.has(entity.name)) {
      entities.splice(i, 1);
    }
  }
}

interface AttributeMapEntry {
  entity: Entity
  attr: EntityAttribute
  navigationPath: string // attr.name для обычных, "parentAttr.embAttr" для embedded
}

/**
 * Создает relations между сущностями на основе односторонних ссылок (sync/map атрибуты).
 * Поддерживает embedded-атрибуты: путь вида Entity.parentAttr.embAttr резолвится точно.
 */
export function buildLinkRelations(entities: Entity[], schema?: Partial<DatabaseSchema>): EntityRelation[] {
  const attributesMap = new Map<string, AttributeMapEntry>();

  function registerAttrs(entity: Entity, attributes: EntityAttribute[], prefix: string): void {
    for (const attr of attributes) {
      const navPath = prefix ? `${prefix}.${attr.name}` : attr.name;
      attributesMap.set(`${entity.name}.${navPath}`, { entity, attr, navigationPath: navPath });
      if (attr.embeddedEntity) {
        registerAttrs(entity, attr.embeddedEntity.attributes, navPath);
      }
    }
  }

  for (const entity of entities) {
    registerAttrs(entity, entity.attributes, '');
  }

  const relationsMap = new Map<string, EntityRelation>();

  function processSyncAttrs(entity: Entity, attributes: EntityAttribute[], prefix: string): void {
    for (const attr of attributes) {
      const navPath = prefix ? `${prefix}.${attr.name}` : attr.name;

      if (attr.sync && attr.sync.length > 0) {
        for (const syncTarget of attr.sync) {
          const filter = schema?.filter as RelationType | undefined;
          if (filter && syncTarget.type !== filter) continue;

          // Ищем целевой атрибут по полному пути (теперь включая embedded-пути),
          // затем пробуем укороченные префиксы
          let target = attributesMap.get(syncTarget.target);
          if (!target) {
            const parts = syncTarget.target.split('.');
            for (let i = parts.length - 1; i >= 2; i--) {
              const shorter = parts.slice(0, i).join('.');
              target = attributesMap.get(shorter);
              if (target) break;
            }
          }

          if (!target) {
            console.warn(`Sync target not found: ${syncTarget.target}`);
            continue;
          }

          const sourceEntry: AttributeMapEntry = { entity, attr, navigationPath: navPath };

          const canonicalKey = [
            `${sourceEntry.entity.name}.${sourceEntry.navigationPath}`,
            `${target.entity.name}.${target.navigationPath}`
          ].sort().join('::');

          if (!relationsMap.has(canonicalKey)) {
            const sourceRank = entity.rank ?? 0;
            const targetRank = target.entity.rank ?? 0;

            const isForward = attr.isForeignKey
              ? sourceRank < targetRank
              : sourceRank <= targetRank;

            const [srcEntry, tgtEntry] = isForward
              ? [sourceEntry, target]
              : [target, sourceEntry];

            const paletteIndex = srcEntry.attr.paletteIndex ?? tgtEntry.attr.paletteIndex ?? relationsMap.size;

            srcEntry.attr.hasConnection = mergeConnectionRole(srcEntry.attr.hasConnection, 'source');
            srcEntry.attr.hasConnectionType = syncTarget.type;
            srcEntry.attr.paletteIndex = paletteIndex;

            tgtEntry.attr.hasConnection = mergeConnectionRole(tgtEntry.attr.hasConnection, 'target');
            tgtEntry.attr.hasConnectionType = syncTarget.type;
            tgtEntry.attr.paletteIndex = paletteIndex;

            relationsMap.set(canonicalKey, {
              source: srcEntry.entity.name,
              sourceNavigation: srcEntry.navigationPath,
              target: tgtEntry.entity.name,
              targetNavigation: tgtEntry.navigationPath,
              paletteIndex,
              type: syncTarget.type,
            });
          }
        }
      }

      if (attr.embeddedEntity) {
        processSyncAttrs(entity, attr.embeddedEntity.attributes, navPath);
      }
    }
  }

  for (const entity of entities) {
    processSyncAttrs(entity, entity.attributes, '');
  }

  return Array.from(relationsMap.values());
}
