import type { DatabaseSchema, Entity, EntityAttribute, EntityRelation, RelationType } from '@/components/workspace/Preview/types';

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

      // Ищем primary key целевой сущности
      const primaryKeyAttr = targetEntity.attributes.find(a => a.isPrimaryKey);
      if (!primaryKeyAttr) {
        console.warn(`Navigation relation skipped: ${entity.name}.${attr.name} -> ${targetEntity.name} (no primary key found)`);
        continue;
      }

      // Создаём ключ связи (односторонняя связь, без сортировки)
      const relationKey = `${entity.name}.${attr.name}->${targetEntity.name}.${primaryKeyAttr.name}`;

      // Сохраняем связь в Map по ключу
      if (!relationsMap.has(relationKey)) {
        // Определяем направление связи на основе rank сущностей
        const entityRank = entity.rank ?? 0;
        const targetRank = targetEntity.rank ?? 0;
        const isForward = entityRank <= targetRank;

        // Выбираем source и target так, чтобы связь шла от меньшего rank к большему
        const [sourceEntity, sourceAttrName, destEntity, destAttrName] = isForward
          ? [entity, attr.name, targetEntity, primaryKeyAttr.name]
          : [targetEntity, primaryKeyAttr.name, entity, attr.name];

        // Если у primary key уже есть paletteIndex — используем его,
        // иначе назначаем новый (все связи на один PK будут одного цвета)
        const paletteIndex = primaryKeyAttr.paletteIndex ?? relationsMap.size;

        // Помечаем оба атрибута для создания Handles (ReactFlow требует Handle на обоих концах edge)
        attr.hasConnection = isForward ? 'source' : 'target';
        attr.isNavigation = true;
        attr.paletteIndex = paletteIndex;

        // Помечаем primary key для создания target Handle
        primaryKeyAttr.hasConnection = mergeConnectionRole(
          primaryKeyAttr.hasConnection,
          isForward ? 'target' : 'source'
        );
        primaryKeyAttr.paletteIndex = paletteIndex;

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
function expandMultipleSyncs(entities: Entity[]): void {
  const clonesToAdd: Entity[] = [];
  
  for (const entity of entities) {
    // Собираем уникальные имена клонов
    const cloneNames = new Set<string>();
    for (const attr of entity.attributes) {
      if (attr.sync) {
        for (const s of attr.sync) {
          if (s.clone) cloneNames.add(s.clone);
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
        attributes: entity.attributes.map(attr => ({
          ...attr,
          sync: attr.sync?.filter(s => s.clone === cloneName) || undefined
        })),
      });
    }
    
    // В оригинале оставляем только sync без clone
    for (const attr of entity.attributes) {
      if (attr.sync) {
        const syncsWithoutClone = attr.sync.filter(s => !s.clone);
        attr.sync = syncsWithoutClone.length > 0 ? syncsWithoutClone : undefined;
      }
    }
  }
  
  entities.push(...clonesToAdd);
}

/**
 * Удаляет оригиналы без sync, у которых есть клоны (полностью заменённые клонами).
 * Обычные сущности без sync не затрагиваются.
 */
function removeUnusedEntities(entities: Entity[]): void {
  // Собираем базовые имена клонов: "Entity(clone)" -> "Entity"
  const clonedBaseNames = new Set<string>();
  for (const entity of entities) {
    const match = entity.name.match(/^(.+)\(.+\)$/);
    if (match) {
      clonedBaseNames.add(match[1]);
    }
  }
  
  // Удаляем оригиналы без sync, у которых есть клоны
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    const hasSync = entity.attributes.some(attr => attr.sync && attr.sync.length > 0);
    const hasClones = clonedBaseNames.has(entity.name);
    
    if (!hasSync && hasClones) {
      entities.splice(i, 1);
    }
  }
}

/**
 * Создает relations между сущностями на основе односторонних ссылок (sync/map атрибуты)
 */
export function buildLinkRelations(entities: Entity[], schema?: Partial<DatabaseSchema>): EntityRelation[] {
  // Шаг 1: Расширяем сущности с множественными sync - создаём клоны
  expandMultipleSyncs(entities);
  
  // Шаг 2: Удаляем оригиналы без sync (полностью заменённые клонами)
  removeUnusedEntities(entities);

  // Шаг 2: Создаем Map всех атрибутов с полными путями: "EntityName.attributeName" -> {entity, attr}
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
        const target = attributesMap.get(syncTarget.target);

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

          const isForward = sourceRank <= targetRank;

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
