import type { Node } from 'ohm-js';
import { dslGrammar } from '@/lib/grammar';
import type { DatabaseSchema, Entity, EntityRelation } from './types';

/**
 * Временная структура для атрибута во время парсинга
 */
interface AttributeBuilder {
  name: string;
  type?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isNavigation?: boolean;
  isCollection?: boolean;
}

/**
 * Временная структура для сущности во время парсинга
 */
interface EntityBuilder {
  name: string;
  attributes: AttributeBuilder[];
}

/**
 * Семантика для парсинга DSL в схему БД
 */
const semantics = dslGrammar.createSemantics();

// Операция для извлечения сущностей
semantics.addOperation<EntityBuilder[]>('extractEntities', {
  _terminal(): EntityBuilder[] {
    return [];
  },

  _iter(...children: any[]): EntityBuilder[] {
    return children.flatMap(child => child.extractEntities());
  },

  Program(entities: any): EntityBuilder[] {
    return entities.extractEntities();
  },

  Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): EntityBuilder[] {
    return [];
  },

  Entity_import(_importKeyword: any, _importRef: any, _semicolon: any): EntityBuilder[] {
    return [];
  },

  Entity_simple(_keyword: any, _name: any, _semicolon: any): EntityBuilder[] {
    return [];
  },

  Entity_options(this: Node, keyword: any, name: any, block: any, _semicolon: any): EntityBuilder[] {
    const keywordStr = keyword.sourceString;
    const nameStr = name.sourceString;

    // Обрабатываем только entity
    if (keywordStr === 'entity' || keywordStr === 'сущность') {
      const attributes = block.extractAttributes();
      return [{
        name: nameStr,
        attributes,
      }];
    }

    // Для остальных (service, etc.) - рекурсивно извлекаем вложенные entity
    return block.extractEntities();
  },

  Block(_open: any, items: any, _close: any): EntityBuilder[] {
    return items.extractEntities();
  },

  Item(entity: any): EntityBuilder[] {
    return entity.extractEntities();
  },
});

// Операция для извлечения атрибутов внутри entity
semantics.addOperation<AttributeBuilder[]>('extractAttributes', {
  _terminal(): AttributeBuilder[] {
    return [];
  },

  _iter(...children: any[]): AttributeBuilder[] {
    return children.flatMap(child => child.extractAttributes());
  },

  Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): AttributeBuilder[] {
    return [];
  },

  Entity_import(_importKeyword: any, _importRef: any, _semicolon: any): AttributeBuilder[] {
    return [];
  },

  Entity_simple(keyword: any, name: any, _semicolon: any): AttributeBuilder[] {
    const keywordStr = keyword.sourceString;
    const nameStr = name.sourceString;

    // Обрабатываем только attribute без блока опций
    if (keywordStr === 'attribute' || keywordStr === 'реквизит') {
      return [{
        name: nameStr,
      }];
    }

    return [];
  },

  Entity_options(this: Node, keyword: any, name: any, block: any, _semicolon: any): AttributeBuilder[] {
    const keywordStr = keyword.sourceString;
    const nameStr = name.sourceString;

    // Обрабатываем только attribute с блоком опций
    if (keywordStr === 'attribute' || keywordStr === 'реквизит') {
      const props = block.extractAttributeProps();
      return [{
        name: nameStr,
        ...props,
      }];
    }

    return [];
  },

  Block(_open: any, items: any, _close: any): AttributeBuilder[] {
    return items.extractAttributes();
  },

  Item(entity: any): AttributeBuilder[] {
    return entity.extractAttributes();
  },
});

// Операция для извлечения свойств атрибута (type, is navigation, key primary, etc.)
semantics.addOperation<Partial<AttributeBuilder>>('extractAttributeProps', {
  _terminal(): Partial<AttributeBuilder> {
    return {};
  },

  _iter(...children: any[]): Partial<AttributeBuilder> {
    return children.reduce((acc, child) => ({ ...acc, ...child.extractAttributeProps() }), {});
  },

  Entity_type(_typeKeyword: any, typeRef: any, _semicolon: any): Partial<AttributeBuilder> {
    const typeStr = typeRef.sourceString;
    // Проверяем, является ли тип коллекцией (заканчивается на [])
    const isCollection = typeStr.endsWith('[]');
    const cleanType = isCollection ? typeStr.slice(0, -2) : typeStr;

    return {
      type: cleanType,
      isCollection,
    };
  },

  Entity_import(_importKeyword: any, _importRef: any, _semicolon: any): Partial<AttributeBuilder> {
    return {};
  },

  Entity_simple(_keyword: any, name: any, _semicolon: any): Partial<AttributeBuilder> {
    const keywordStr = _keyword.sourceString;
    const nameStr = name.sourceString;

    // Обрабатываем "is navigation", "is nullable"
    if (keywordStr === 'is') {
      if (nameStr === 'navigation') {
        return { isNavigation: true };
      }
      if (nameStr === 'nullable') {
        return { isNullable: true };
      }
    }

    // Обрабатываем "key primary", "key foreign"
    if (keywordStr === 'key') {
      if (nameStr === 'primary') {
        return { isPrimaryKey: true };
      }
      if (nameStr === 'foreign') {
        return { isForeignKey: true };
      }
    }

    return {};
  },

  Entity_options(_keyword: any, _name: any, block: any, _semicolon: any): Partial<AttributeBuilder> {
    // Рекурсивно собираем свойства из вложенных блоков
    return block.extractAttributeProps();
  },

  Block(_open: any, items: any, _close: any): Partial<AttributeBuilder> {
    return items.extractAttributeProps();
  },

  Item(entity: any): Partial<AttributeBuilder> {
    return entity.extractAttributeProps();
  },
});

/**
 * Создает relations между сущностями на основе навигационных свойств
 */
function buildRelations(entities: Entity[]): EntityRelation[] {
  const relations: EntityRelation[] = [];
  const entityMap = new Map(entities.map(e => [e.name.toLowerCase(), e]));

  for (const entity of entities) {
    for (const attr of entity.attributes) {
      // Пропускаем не-навигационные атрибуты
      if (!attr.isNavigation) continue;

      // Находим целевую сущность по типу атрибута
      const targetEntityName = attr.type.replace('[]', '');
      const targetEntity = entityMap.get(targetEntityName.toLowerCase());

      if (!targetEntity) continue;

      // Ищем обратное навигационное свойство в целевой сущности
      const reverseAttr = targetEntity.attributes.find(a =>
        a.isNavigation && a.type.replace('[]', '').toLowerCase() === entity.name.toLowerCase()
      );

      // Добавляем relation только для одной стороны связи (чтобы не дублировать)
      // Условие: добавляем, если это коллекция, или если обратного свойства нет
      if (attr.isCollection || !reverseAttr) {
        relations.push({
          source: entity.id,
          sourceNavigation: attr.name,
          target: targetEntity.id,
          targetNavigation: reverseAttr?.name || '',
        });
      }
    }
  }

  return relations;
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
    const entityBuilders: EntityBuilder[] = adapter.extractEntities();

    // Преобразуем в финальную структуру
    const entities: Entity[] = entityBuilders.map(builder => ({
      id: builder.name.toLowerCase(),
      name: builder.name,
      attributes: builder.attributes.map(attr => ({
        name: attr.name,
        type: attr.type || 'Unknown',
        isPrimaryKey: attr.isPrimaryKey,
        isForeignKey: attr.isForeignKey,
        isNullable: attr.isNullable,
        isNavigation: attr.isNavigation,
        isCollection: attr.isCollection,
      })),
    }));

    // Строим relations
    const relations = buildRelations(entities);

    console.log(`Built ${relations.length} relations`);
    console.log('Entities:', entities.map(e => e.name).join(', '));

    return { entities, relations };
  } catch (error) {
    console.error('Schema parsing error:', error);
    return null;
  }
}
