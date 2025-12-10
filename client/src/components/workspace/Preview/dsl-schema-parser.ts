import type { Node } from 'ohm-js';
import { dslGrammar } from '@/lib/grammar';
import type { DatabaseSchema, Entity, EntityAttribute, EntityRelation } from './types';

/**
 * Константы для ключевых слов DSL
 */
const ENTITY_KEYWORDS = new Set(['entity', 'сущность', 'class']);
const ATTRIBUTE_KEYWORDS = new Set(['attribute', 'реквизит', 'method', 'метод']);
const SYNC_KEYWORDS = new Set(['sync', 'обмен']);
const IS_MODIFIERS = new Set(['navigation', 'nullable', 'required']);
const KEY_MODIFIERS = new Set(['primary', 'foreign']);

/**
 * Семантика для парсинга DSL в схему БД
 */
const semantics = dslGrammar.createSemantics();

// Операция для извлечения сущностей
semantics.addOperation<Entity[]>('extractEntities', {
  _terminal(): Entity[] {
    return [];
  },

  _iter(...children: any[]): Entity[] {
    return children.flatMap(child => child.extractEntities());
  },

  Program(entities: any): Entity[] {
    return entities.extractEntities();
  },

  Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): Entity[] {
    return [];
  },

  Entity_import(_importKeyword: any, _importRef: any, _semicolon: any): Entity[] {
    return [];
  },

  Entity_label(_labelKeyword: any, _labelRef: any, _semicolon: any): Entity[] {
    return [];
  },

  Entity_simple(_keyword: any, _name: any, _semicolon: any): Entity[] {
    return [];
  },

  Entity_options(this: Node, keyword: any, name: any, block: any, _semicolon: any): Entity[] {
    const keywordStr = keyword.sourceString;
    const nameStr = name.sourceString;

    // Обрабатываем только entity
    if (ENTITY_KEYWORDS.has(keywordStr)) {
      const attributes = block.extractAttributes();
      const entityProps = block.extractEntityProps();
      return [{
        name: nameStr,
        label: entityProps.label || '',
        attributes,
      }];
    }

    // Для остальных (service, etc.) - рекурсивно извлекаем вложенные entity
    return block.extractEntities();
  },

  Block(_open: any, items: any, _close: any): Entity[] {
    return items.extractEntities();
  },

  Item(entity: any): Entity[] {
    return entity.extractEntities();
  },
});

// Операция для извлечения атрибутов внутри entity
semantics.addOperation<EntityAttribute[]>('extractAttributes', {
  _terminal(): EntityAttribute[] {
    return [];
  },

  _iter(...children: any[]): EntityAttribute[] {
    return children.flatMap(child => child.extractAttributes());
  },

  Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): EntityAttribute[] {
    return [];
  },

  Entity_import(_importKeyword: any, _importRef: any, _semicolon: any): EntityAttribute[] {
    return [];
  },

  Entity_label(_labelKeyword: any, _labelRef: any, _semicolon: any): EntityAttribute[] {
    return [];
  },

  Entity_simple(keyword: any, name: any, _semicolon: any): EntityAttribute[] {
    const keywordStr = keyword.sourceString;
    const nameStr = name.sourceString;

    // Обрабатываем только attribute без блока опций
    if (ATTRIBUTE_KEYWORDS.has(keywordStr)) {
      return [{
        name: nameStr,
        label: '',
      }];
    }

    return [];
  },

  Entity_options(this: Node, keyword: any, name: any, block: any, _semicolon: any): EntityAttribute[] {
    const keywordStr = keyword.sourceString;
    const nameStr = name.sourceString;

    // Обрабатываем только attribute с блоком опций
    if (ATTRIBUTE_KEYWORDS.has(keywordStr)) {
      const props = block.extractAttributeProps();
      return [{
        name: nameStr,
        label: props.label || '',
        ...props,
      }];
    }

    return [];
  },

  Block(_open: any, items: any, _close: any): EntityAttribute[] {
    return items.extractAttributes();
  },

  Item(entity: any): EntityAttribute[] {
    return entity.extractAttributes();
  },
});

// Операция для извлечения свойств атрибута (type, is navigation, key primary, etc.)
semantics.addOperation<Partial<EntityAttribute>>('extractAttributeProps', {
  _terminal(): Partial<EntityAttribute> {
    return {};
  },

  _iter(...children: any[]): Partial<EntityAttribute> {
    return children.reduce((acc, child) => ({ ...acc, ...child.extractAttributeProps() }), {});
  },

  Entity_type(_typeKeyword: any, typeRef: any, _semicolon: any): Partial<EntityAttribute> {
    const typeStr = typeRef.sourceString;
    // Проверяем, является ли тип коллекцией (заканчивается на [])
    const isCollection = typeStr.endsWith('[]');

    return {
      type: typeStr,
      isCollection,
    };
  },

  Entity_import(_importKeyword: any, _importRef: any, _semicolon: any): Partial<EntityAttribute> {
    return {};
  },

  Entity_label(_labelKeyword: any, labelRef: any, _semicolon: any): Partial<EntityAttribute> {
    const labelStr = labelRef.sourceString;
    // Убираем кавычки из строкового литерала
    const label = labelStr.slice(1, -1);
    return { label };
  },

  Entity_simple(_keyword: any, name: any, _semicolon: any): Partial<EntityAttribute> {
    const keywordStr = _keyword.sourceString;
    const nameStr = name.sourceString;

    // Обрабатываем "is navigation", "is nullable", "is required"
    if (keywordStr === 'is' && IS_MODIFIERS.has(nameStr)) {
      if (nameStr === 'navigation') {
        return { isNavigation: true };
      }
      if (nameStr === 'nullable') {
        return { isNullable: true };
      }
      if (nameStr === 'required') {
        return { isRequired: true };
      }
    }

    // Обрабатываем "key primary", "key foreign"
    if (keywordStr === 'key' && KEY_MODIFIERS.has(nameStr)) {
      if (nameStr === 'primary') {
        return { isPrimaryKey: true };
      }
      if (nameStr === 'foreign') {
        return { isForeignKey: true };
      }
    }

    // Обрабатываем "sync ExternalEntity.externalAttr"
    if (SYNC_KEYWORDS.has(keywordStr)) {
      return { syncTarget: nameStr };
    }

    return {};
  },

  Entity_options(_keyword: any, _name: any, block: any, _semicolon: any): Partial<EntityAttribute> {
    const keywordStr = _keyword.sourceString;
    const nameStr = _name.sourceString;

    // Обрабатываем "key primary" и "key foreign" с блоком опций
    if (keywordStr === 'key' && KEY_MODIFIERS.has(nameStr)) {
      if (nameStr === 'primary') {
        return { isPrimaryKey: true, ...block.extractAttributeProps() };
      }
      if (nameStr === 'foreign') {
        return { isForeignKey: true, ...block.extractAttributeProps() };
      }
    }

    // Рекурсивно собираем свойства из вложенных блоков
    return block.extractAttributeProps();
  },

  Block(_open: any, items: any, _close: any): Partial<EntityAttribute> {
    return items.extractAttributeProps();
  },

  Item(entity: any): Partial<EntityAttribute> {
    return entity.extractAttributeProps();
  },
});

// Операция для извлечения свойств самой entity (label, и т.д.)
semantics.addOperation<Partial<Pick<Entity, 'label'>>>('extractEntityProps', {
  _terminal(): Partial<Pick<Entity, 'label'>> {
    return {};
  },

  _iter(...children: any[]): Partial<Pick<Entity, 'label'>> {
    return children.reduce((acc, child) => ({ ...acc, ...child.extractEntityProps() }), {});
  },

  Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): Partial<Pick<Entity, 'label'>> {
    return {};
  },

  Entity_import(_importKeyword: any, _importRef: any, _semicolon: any): Partial<Pick<Entity, 'label'>> {
    return {};
  },

  Entity_label(_labelKeyword: any, labelRef: any, _semicolon: any): Partial<Pick<Entity, 'label'>> {
    const labelStr = labelRef.sourceString;
    // Убираем кавычки из строкового литерала
    const label = labelStr.slice(1, -1);
    return { label };
  },

  Entity_simple(_keyword: any, _name: any, _semicolon: any): Partial<Pick<Entity, 'label'>> {
    return {};
  },

  Entity_options(_keyword: any, _name: any, block: any, _semicolon: any): Partial<Pick<Entity, 'label'>> {
    return block.extractEntityProps();
  },

  Block(_open: any, items: any, _close: any): Partial<Pick<Entity, 'label'>> {
    return items.extractEntityProps();
  },

  Item(entity: any): Partial<Pick<Entity, 'label'>> {
    return entity.extractEntityProps();
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
 * Создает external relations между сущностями на основе sync-атрибутов
 */
function buildExternalRelations(entities: Entity[], startPaletteIndex: number): EntityRelation[] {
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
      if (!attr.syncTarget) continue;

      // Ищем целевой атрибут по полному пути в Map
      const target = attributesMap.get(attr.syncTarget);
      
      if (!target) {
        console.warn(`Sync target not found: ${attr.syncTarget}`);
        continue;
      }

      // Создаём канонический ключ связи (сортируем имена для инвариантности направления)
      const canonicalKey = [entity.name, target.entity.name].sort().join('::');

      // Сохраняем связь в Map по ключу (первая встреченная)
      if (!relationsMap.has(canonicalKey)) {
        // Текущий размер relationsMap как paletteIndex новой связи
        const paletteIndex = relationsMap.size + startPaletteIndex;

        // Помечаем атрибуты
        attr.hasConnection = 'source';
        attr.paletteIndex = paletteIndex;
        
        target.attr.hasConnection = 'target';
        target.attr.paletteIndex = paletteIndex;

        // Создаем external связь
        relationsMap.set(canonicalKey, {
          source: entity.name,
          sourceNavigation: attr.name,
          target: target.entity.name,
          targetNavigation: target.attr.name,
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

    // Строим external relations (начиная с индекса после internal)
    const externalRelations = buildExternalRelations(entities, internalRelations.length);

    // Объединяем все связи
    const relations = [...internalRelations, ...externalRelations];

    return { entities, relations };
  } catch (error) {
    console.error('Schema parsing error:', error);
    return null;
  }
}
