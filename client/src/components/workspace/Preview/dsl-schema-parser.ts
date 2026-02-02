import type { Node } from 'ohm-js';
import { dslGrammar } from '@/lib/grammar';
import type { DatabaseSchema, Entity, EntityAttribute, EntityRelation } from './types';

/**
 * Константы для ключевых слов DSL
 */
const ENTITY_KEYWORDS = new Set(['entity', 'сущность', 'class', 'table', 'json', 'dto']);
const ATTRIBUTE_KEYWORDS = new Set(['attribute', 'реквизит', 'method', 'метод', 'property', 'свойство']);
const SYNC_KEYWORDS = new Set(['sync', 'обмен', 'map', 'relates', 'связь', 'относится']);
const IS_MODIFIERS = new Set(['navigation', 'nullable', 'required']); // used for UI
const KEY_MODIFIERS = new Set(['primary', 'foreign']);  // used for UI
const LABEL_KEYWORDS = new Set(['label', 'заголовок']);
const SEPARATE_KEYWORDS = new Set(['separate', 'промежуток']);
const RANK_KEYWORDS = new Set(['rank', 'позиция']);

/**
 * Helper: генерирует fallback-обработчики для операций, возвращающих массивы
 */
function arrayFallbacks<T>(opName: string) {
  return {
    _nonterminal(...children: any[]): T[] {
      return children.flatMap(child => child[opName]());
    },
    _iter(...children: any[]): T[] {
      return children.flatMap(child => child[opName]());
    },
    _terminal(): T[] {
      return [];
    },
  };
}

/**
 * Helper: генерирует fallback-обработчики для операций, возвращающих объекты (merge)
 */
function objectFallbacks<T extends object>(opName: string) {
  return {
    _nonterminal(...children: any[]): T {
      return children.reduce((acc, child) => ({ ...acc, ...child[opName]() }), {} as T);
    },
    _iter(...children: any[]): T {
      return children.reduce((acc, child) => ({ ...acc, ...child[opName]() }), {} as T);
    },
    _terminal(): T {
      return {} as T;
    },
  };
}

/**
 * Семантика для парсинга DSL в схему БД
 */
const semantics = dslGrammar.createSemantics();

// Операция для извлечения сущностей
semantics.addOperation<Entity[]>('extractEntities', {
  ...arrayFallbacks<Entity>('extractEntities'),

  // Только Entity_options создаёт сущности
  Entity_options(this: Node, keyword: any, name: any, block: any, _semicolon: any): Entity[] {
    const keywordStr = keyword.sourceString;
    const nameStr = name.sourceString;

    if (ENTITY_KEYWORDS.has(keywordStr)) {
      const attributes = block.extractAttributes();
      const entityProps = block.extractEntityProps();
      return [{
        name: nameStr,
        label: entityProps.label || '',
        attributes,
        rank: entityProps.rank,
      }];
    }

    // Для остальных (service, etc.) - рекурсивно извлекаем вложенные entity
    return block.extractEntities();
  },
});

// Операция для извлечения атрибутов внутри entity
semantics.addOperation<EntityAttribute[]>('extractAttributes', {
  ...arrayFallbacks<EntityAttribute>('extractAttributes'),

  // attribute без блока опций
  Entity_simple(keyword: any, name: any, _semicolon: any): EntityAttribute[] {
    const keywordStr = keyword.sourceString;
    if (ATTRIBUTE_KEYWORDS.has(keywordStr)) {
      return [{ name: name.sourceString, label: '' }];
    }
    return [];
  },

  // attribute с блоком опций
  Entity_options(this: Node, keyword: any, name: any, block: any, _semicolon: any): EntityAttribute[] {
    const keywordStr = keyword.sourceString;
    if (ATTRIBUTE_KEYWORDS.has(keywordStr)) {
      const props = block.extractAttributeProps();
      return [{ name: name.sourceString, label: props.label || '', ...props }];
    }
    return [];
  },
});

// Операция для извлечения свойств атрибута (type, is navigation, key primary, etc.)
semantics.addOperation<Partial<EntityAttribute>>('extractAttributeProps', {
  ...objectFallbacks<Partial<EntityAttribute>>('extractAttributeProps'),

  // type SomeType;
  Entity_type(_typeKeyword: any, typeRef: any, _semicolon: any): Partial<EntityAttribute> {
    const typeStr = typeRef.sourceString;
    return { type: typeStr, isCollection: typeStr.endsWith('[]') };
  },

  // sync Entity.attr; / map Entity.attr; / relates Entity.attr;
  Entity_ref(refKeyword: any, ref: any, _semicolon: any): Partial<EntityAttribute> {
    if (SYNC_KEYWORDS.has(refKeyword.sourceString)) {
      return { sync: ref.sourceString };
    }
    return {};
  },

  // sync Entity.attr { ... }; / map Entity.attr { ... };
  Entity_refOptions(refKeyword: any, ref: any, block: any, _semicolon: any): Partial<EntityAttribute> {
    if (SYNC_KEYWORDS.has(refKeyword.sourceString)) {
      return { sync: ref.sourceString, ...block.extractAttributeProps() };
    }
    return block.extractAttributeProps();
  },

  // label "...";
  Entity_string(stringKeyword: any, stringValue: any, _semicolon: any): Partial<EntityAttribute> {
    if (LABEL_KEYWORDS.has(stringKeyword.sourceString)) {
      return { label: stringValue.sourceString.slice(1, -1) };
    }
    return {};
  },

  // is navigation; / is nullable; / key primary; / key foreign;
  Entity_simple(_keyword: any, name: any, _semicolon: any): Partial<EntityAttribute> {
    const keywordStr = _keyword.sourceString;
    const nameStr = name.sourceString;

    if (keywordStr === 'is' && IS_MODIFIERS.has(nameStr)) {
      if (nameStr === 'navigation') return { isNavigation: true };
      if (nameStr === 'nullable') return { isNullable: true };
      if (nameStr === 'required') return { isRequired: true };
    }

    if (keywordStr === 'key' && KEY_MODIFIERS.has(nameStr)) {
      if (nameStr === 'primary') return { isPrimaryKey: true };
      if (nameStr === 'foreign') return { isForeignKey: true };
    }

    return {};
  },

  // key primary { ... }; / key foreign { ... };
  Entity_options(_keyword: any, _name: any, block: any, _semicolon: any): Partial<EntityAttribute> {
    const keywordStr = _keyword.sourceString;
    const nameStr = _name.sourceString;

    if (keywordStr === 'key' && KEY_MODIFIERS.has(nameStr)) {
      const props = block.extractAttributeProps();
      if (nameStr === 'primary') return { isPrimaryKey: true, ...props };
      if (nameStr === 'foreign') return { isForeignKey: true, ...props };
    }

    return block.extractAttributeProps();
  },

});

// Операция для извлечения свойств самой entity (label, rank)
semantics.addOperation<Partial<Entity>>('extractEntityProps', {
  ...objectFallbacks<Partial<Entity>>('extractEntityProps'),

  // label "...";
  Entity_string(stringKeyword: any, stringValue: any, _semicolon: any): Partial<Entity> {
    if (LABEL_KEYWORDS.has(stringKeyword.sourceString)) {
      return { label: stringValue.sourceString.slice(1, -1) };
    }
    return {};
  },

  // rank 1;
  Entity_number(numberKeyword: any, numberValue: any, _semicolon: any): Partial<Entity> {
    if (RANK_KEYWORDS.has(numberKeyword.sourceString)) {
      return { rank: parseInt(numberValue.sourceString, 10) };
    }
    return {};
  },

});

// Операция для извлечения свойств схемы (separate, annotation)
semantics.addOperation<Partial<DatabaseSchema>>('extractSchemaProps', {
  ...objectFallbacks<Partial<DatabaseSchema>>('extractSchemaProps'),

  // annotation { ... };
  Entity_annotation(_keyword: any, _name: any, block: any, _semicolon: any): Partial<DatabaseSchema> {
    const blockContent = block.sourceString;
    const annotation = blockContent.slice(1, -1).replace(/^[\r\n]+|[\r\n]+$/g, '');
    return { annotation };
  },

  // separate 1.5;
  Entity_number(numberKeyword: any, numberValue: any, _semicolon: any): Partial<DatabaseSchema> {
    if (SEPARATE_KEYWORDS.has(numberKeyword.sourceString)) {
      return { separate: parseFloat(numberValue.sourceString) };
    }
    return {};
  },

});

/**
 * Создает internal relations между сущностями на основе навигационных свойств
 */
function buildInternalRelations(entities: Entity[]): EntityRelation[] {
  const entityMap = new Map(entities.map(e => [e.name, e]));
  const relationsMap = new Map<string, EntityRelation>();

  for (const entity of entities) {
    for (const attr of entity.attributes) {
      // Пропускаем атрибуты без типа
      if (!attr.type) continue;

      // Выделяем тип (имя целевой сущности)
      let type = attr.type;
      if (type.endsWith('[]')) {
        attr.isCollection = true;
        type = type.replace('[]', '');
      };
      const targetEntityName = type;
      const targetEntity = entityMap.get(targetEntityName);
      if (!targetEntity) {
        continue;
      }

      // Создаём канонический ключ связи (сортируем имена для инвариантности направления)
      const canonicalKey = [entity.name, targetEntity.name].sort().join('::');

      // Сохраняем связь в Map по ключу (первая встреченная)
      if (!relationsMap.has(canonicalKey)) {
        // Ищем обратный навигационный атрибут (используем первый подходящий)
        const reverseAttr = targetEntity.attributes.find(a =>
          a.type && (a.type.replace('[]', '') === entity.name) && a.name !== attr.name
        );
        if (!reverseAttr) {
          continue;
        }

        // Текущий размер Map = индекс новой связи
        const paletteIndex = relationsMap.size;

        attr.hasConnection = 'source';
        attr.isNavigation = true;
        attr.paletteIndex = paletteIndex;

        reverseAttr.hasConnection = 'target';
        reverseAttr.isNavigation = true;
        reverseAttr.paletteIndex = paletteIndex;

        relationsMap.set(canonicalKey, {
          source: entity.name,
          sourceNavigation: attr.name,
          target: targetEntity.name,
          targetNavigation: reverseAttr.name,
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
 * Создает external relations между сущностями на основе sync-атрибутов
 */
function buildExternalRelations(entities: Entity[]): EntityRelation[] {
  // Создаем Map всех атрибутов с полными путями: "EntityName.attributeName" -> {entity, attr}
  const attributesMap = new Map<string, { entity: Entity; attr: EntityAttribute }>();

  for (const entity of entities) {
    for (const attr of entity.attributes) {
      const fullPath = `${entity.name}.${attr.name}`;
      attributesMap.set(fullPath, { entity, attr });
    }
  }

  const relationsMap = new Map<string, EntityRelation>();

  // Перебираем все атрибуты и ищем sync
  for (const entity of entities) {
    for (const attr of entity.attributes) {
      if (!attr.sync) continue;

      // Ищем целевой атрибут по полному пути в Map
      const target = attributesMap.get(attr.sync);

      if (!target) {
        console.warn(`Sync target not found: ${attr.sync}`);
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
        sourceAttr.paletteIndex = paletteIndex;
        sourceAttr.sync = `${targetEntity.name}.${targetAttr.name}`;

        targetAttr.hasConnection = mergeConnectionRole(targetAttr.hasConnection, 'target');
        targetAttr.paletteIndex = paletteIndex;
        targetAttr.sync = `${sourceEntity.name}.${sourceAttr.name}`;

        // Создаем external связь
        relationsMap.set(canonicalKey, {
          source: sourceEntity.name,
          sourceNavigation: sourceAttr.name,
          target: targetEntity.name,
          targetNavigation: targetAttr.name,
          paletteIndex,
          type: 'external',
        });
      }
    }
  }

  return Array.from(relationsMap.values());
}

/**
 * Парсит DSL-контент (уже обработанный, без импортов) в схему базы данных
 */
export async function parseSchema(content: string): Promise<DatabaseSchema | null> {
  if (!content || content.trim() === '') {
    return null;
  }

  try {
    const match = dslGrammar.match(content);

    if (match.failed()) {
      const failurePos = match.getRightmostFailurePosition();
      const expected = match.getExpectedText();
      const lines = content.substring(0, failurePos).split('\n');
      const lineNumber = lines.length;

      console.error(`Schema parsing failed at line ${lineNumber}. Expected: ${expected}`);
      return null;
    }

    // Извлекаем сущности
    const adapter = semantics(match);
    const entities: Entity[] = adapter.extractEntities();

    // Извлекаем свойства схемы (напр., separate)
    const schemaProps = adapter.extractSchemaProps();

    // Устанавливаем значение по умолчанию для атрибутов без типа
    entities.forEach(entity => {
      entity.attributes.forEach(attr => {
        if (!attr.type) {
          attr.type = 'unknown';
        }
      });
    });

    // Строим internal relations
    const internalRelations = buildInternalRelations(entities);

    // Строим external relations
    const externalRelations = buildExternalRelations(entities);

    // Объединяем все связи
    const relations = [...internalRelations, ...externalRelations];

    return {
      entities,
      relations,
      hasExternalRelations: externalRelations.length > 0,
      separate: schemaProps.separate,
      annotation: schemaProps.annotation,
    };
  } catch (error) {
    console.error('Schema parsing error:', error);
    return null;
  }
}
