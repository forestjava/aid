import { HEADER_HANDLE_ID, type DatabaseSchema, type Entity, type EntityAttribute, type EntityRelation, type RelationType } from '@/components/workspace/Preview/types';

/**
 * Создает relations между сущностями на основе типа атрибута (односторонние internal связи).
 * Атрибут со сложным типом соединяется с primary key целевой сущности.
 */
export function buildNavigationRelations(entities: Entity[], schema?: Partial<DatabaseSchema>): EntityRelation[] {
  // Если filter === 'external', internal связи не нужны
  if (schema?.filter === 'external') {
    return [];
  }

  const entityMap = new Map(entities.map(e => [e.name, e]));
  const relationsMap = new Map<string, EntityRelation>();

  for (const entity of entities) {
    for (const attr of entity.attributes) {
      // Пропускаем атрибуты без типа
      if (!attr.type) continue;

      // Имя целевой сущности (type уже без '[]', isCollection установлен парсером)
      const targetEntity = entityMap.get(attr.type);
      if (!targetEntity) {
        continue;
      }

      // Ищем primary key целевой сущности (если нет — связь пойдёт к заголовку)
      const primaryKeyAttr = targetEntity.attributes.find(a => a.isPrimaryKey);
      const targetAttrName = primaryKeyAttr?.name ?? HEADER_HANDLE_ID;

      // Создаём ключ связи (односторонняя связь, без сортировки)
      const relationKey = `${entity.name}.${attr.name}->${targetEntity.name}.${targetAttrName}`;

      // Сохраняем связь в Map по ключу
      if (!relationsMap.has(relationKey)) {
        // Определяем направление связи на основе rank сущностей
        const entityRank = entity.rank ?? 0;
        const targetRank = targetEntity.rank ?? 0;
        const isForward = entityRank <= targetRank;

        // Выбираем source и target так, чтобы связь шла от меньшего rank к большему
        const [sourceEntity, sourceAttrName, destEntity, destAttrName] = isForward
          ? [entity, attr.name, targetEntity, targetAttrName]
          : [targetEntity, targetAttrName, entity, attr.name];

        // Если у primary key уже есть paletteIndex — используем его,
        // иначе назначаем новый (все связи на один PK будут одного цвета)
        const paletteIndex = primaryKeyAttr?.paletteIndex ?? relationsMap.size;

        // Помечаем оба атрибута для создания Handles (ReactFlow требует Handle на обоих концах edge)
        attr.hasConnection = isForward ? 'source' : 'target';
        attr.isNavigation = true;
        attr.paletteIndex = paletteIndex;

        if (primaryKeyAttr) {
          // Помечаем primary key для создания target Handle
          primaryKeyAttr.hasConnection = mergeConnectionRole(
            primaryKeyAttr.hasConnection,
            isForward ? 'target' : 'source'
          );
          primaryKeyAttr.paletteIndex = paletteIndex;
        } else {
          // Нет PK — связь идёт к заголовку сущности
          targetEntity.hasHeaderConnection = mergeConnectionRole(
            targetEntity.hasHeaderConnection,
            isForward ? 'target' : 'source'
          );
        }

        relationsMap.set(relationKey, {
          source: sourceEntity.name,
          sourceNavigation: sourceAttrName,
          target: destEntity.name,
          targetNavigation: destAttrName,
          paletteIndex,
          type: 'internal',
        });
      }
    }
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

/**
 * Создает relations между сущностями на основе односторонних ссылок (sync/map атрибуты)
 */
export function buildLinkRelations(entities: Entity[], schema?: Partial<DatabaseSchema>): EntityRelation[] {
  // Создаем Map всех атрибутов с полными путями: "EntityName.attributeName" -> {entity, attr}
  const attributesMap = new Map<string, { entity: Entity; attr: EntityAttribute }>();

  for (const entity of entities) {
    for (const attr of entity.attributes) {
      const fullPath = `${entity.name}.${attr.name}`;
      attributesMap.set(fullPath, { entity, attr });
    }
  }

  const relationsMap = new Map<string, EntityRelation>();

  // Шаг 3: Перебираем все атрибуты и ищем sync
  for (const entity of entities) {
    for (const attr of entity.attributes) {
      if (!attr.sync || attr.sync.length === 0) continue;

      // Теперь sync - это массив, но после expandMultipleSyncs в каждом атрибуте максимум 1 элемент
      for (const syncTarget of attr.sync) {
        // Фильтруем по типу связи, если указан filter
        const filter = schema?.filter as RelationType | undefined;
        if (filter && syncTarget.type !== filter) continue;

        // Ищем целевой атрибут по полному пути в Map
        // Если точный путь не найден, пробуем укороченные префиксы —
        // глубокая навигация (Entity.attr.subAttr.field) резолвится до ближайшего Entity.attr
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

        // Создаём канонический ключ связи (включаем атрибуты для поддержки нескольких связей между сущностями)
        const canonicalKey = [
          `${entity.name}.${attr.name}`,
          `${target.entity.name}.${target.attr.name}`
        ].sort().join('::');

        // Сохраняем связь в Map по ключу (первая встреченная)
        if (!relationsMap.has(canonicalKey)) {
          // Определяем направление связи на основе rank сущностей
          // source должен иметь меньший или равный rank, чтобы связь шла слева направо
          const sourceRank = entity.rank ?? 0;
          const targetRank = target.entity.rank ?? 0;

          const isForward = syncTarget.type === 'external'
            ? sourceRank < targetRank
            : sourceRank <= targetRank;

          // Выбираем source и target так, чтобы связь шла от меньшего rank к большему
          const [sourceEntity, sourceAttr, targetEntity, targetAttr] = isForward
            ? [entity, attr, target.entity, target.attr]
            : [target.entity, target.attr, entity, attr];

          // Определяем paletteIndex: используем существующий у атрибутов или генерируем новый
          const paletteIndex = sourceAttr.paletteIndex ?? targetAttr.paletteIndex ?? relationsMap.size;

          // Помечаем атрибуты (учитываем, что атрибут может участвовать в нескольких связях)
          sourceAttr.hasConnection = mergeConnectionRole(sourceAttr.hasConnection, 'source');
          sourceAttr.hasConnectionType = syncTarget.type;
          sourceAttr.paletteIndex = paletteIndex;

          targetAttr.hasConnection = mergeConnectionRole(targetAttr.hasConnection, 'target');
          targetAttr.hasConnectionType = syncTarget.type;
          targetAttr.paletteIndex = paletteIndex;

          // Создаем связь с типом из syncTarget
          relationsMap.set(canonicalKey, {
            source: sourceEntity.name,
            sourceNavigation: sourceAttr.name,
            target: targetEntity.name,
            targetNavigation: targetAttr.name,
            paletteIndex,
            type: syncTarget.type,
          });
        }
      }
    }
  }

  return Array.from(relationsMap.values());
}
