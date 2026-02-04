import type { Node } from 'ohm-js';
import { dslGrammar } from '@/lib/grammar';
import { buildNavigationRelations, buildLinkRelations } from '@/lib/relations';
import type { DatabaseSchema, Entity, EntityAttribute, SyncTarget } from './types';

/**
 * Константы для ключевых слов DSL
 */
const ENTITY_KEYWORDS = new Set(['entity', 'сущность', 'class', 'класс', 'table', 'таблица', 'model', 'модель', 'json', 'dto']);
const ATTRIBUTE_KEYWORDS = new Set(['attribute', 'реквизит', 'method', 'метод', 'property', 'свойство']);
const EXTERNAL_LINK_KEYWORDS = new Set(['sync', 'обмен']);
const INTERNAL_LINK_KEYWORDS = new Set(['map', 'связь', 'relates', 'относится']);
const ALL_LINK_KEYWORDS = new Set([...EXTERNAL_LINK_KEYWORDS, ...INTERNAL_LINK_KEYWORDS]);
const IS_MODIFIERS = new Set(['navigation', 'nullable', 'required']); // used for UI
const KEY_MODIFIERS = new Set(['primary', 'foreign']);  // used for UI
const LABEL_KEYWORDS = new Set(['label', 'заголовок']);
const SEPARATE_KEYWORDS = new Set(['separate', 'промежуток']);
const RANK_KEYWORDS = new Set(['rank', 'позиция']);
const CONDITION_KEYWORDS = new Set(['through', 'через', 'using', 'используя', 'for', 'для', 'if', 'если', 'when', 'когда']);
const CLONE_KEYWORDS = new Set(['clone', 'клон']);

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
      const syncs = block.extractSyncs();
      return [{ 
        name: name.sourceString, 
        label: props.label || '', 
        ...props,
        sync: syncs.length > 0 ? syncs : undefined 
      }];
    }
    return [];
  },
});

// Операция для извлечения всех sync-связей атрибута
semantics.addOperation<SyncTarget[]>('extractSyncs', {
  ...arrayFallbacks<SyncTarget>('extractSyncs'),

  // sync Entity.attr;
  Entity_ref(refKeyword: any, ref: any, _semicolon: any): SyncTarget[] {
    const keyword = refKeyword.sourceString;
    if (ALL_LINK_KEYWORDS.has(keyword)) {
      return [{ 
        target: ref.sourceString,
        type: EXTERNAL_LINK_KEYWORDS.has(keyword) ? 'external' : 'internal'
      }];
    }
    return [];
  },

  // sync Entity.attr { clone shipping; using operation "SHIPPING"; };
  Entity_refOptions(refKeyword: any, ref: any, block: any, _semicolon: any): SyncTarget[] {
    const keyword = refKeyword.sourceString;
    if (ALL_LINK_KEYWORDS.has(keyword)) {
      const condition = block.extractCondition();
      const clone = block.extractClone();
      return [{ 
        target: ref.sourceString, 
        condition: condition || undefined,
        clone: clone || undefined,
        type: EXTERNAL_LINK_KEYWORDS.has(keyword) ? 'external' : 'internal'
      }];
    }
    return [];
  },

  // key foreign { attribute Entity.attr; } -> создаём internal sync
  Entity_options(keyword: any, name: any, block: any, _semicolon: any): SyncTarget[] {
    const keywordStr = keyword.sourceString;
    const nameStr = name.sourceString;

    // key foreign { attribute Entity.attr; } -> создаём internal sync
    if (keywordStr === 'key' && nameStr === 'foreign') {
      const target = block.extractForeignKeyTarget();
      if (target) {
        return [{ target, type: 'internal' }];
      }
    }

    // Рекурсивно обходим вложенные блоки
    return block.extractSyncs();
  },
});

// Операция для извлечения условия из блока sync (through/using/for/if/when)
semantics.addOperation<string | null>('extractCondition', {
  _nonterminal(...children: any[]): string | null {
    for (const child of children) {
      const result = child.extractCondition();
      if (result) return result;
    }
    return null;
  },
  _iter(...children: any[]): string | null {
    for (const child of children) {
      const result = child.extractCondition();
      if (result) return result;
    }
    return null;
  },
  _terminal(): string | null {
    return null;
  },

  // through operation "SHIPPING"; / using operation "SHIPPING";
  Entity_condition(condKeyword: any, ref: any, value: any, _semicolon: any): string | null {
    if (CONDITION_KEYWORDS.has(condKeyword.sourceString)) {
      const refStr = ref.sourceString;
      let valueStr = value.sourceString;
      // Убираем кавычки если это строка
      if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
        valueStr = valueStr.slice(1, -1);
      }
      return `${refStr}:${valueStr}`;
    }
    return null;
  },
});

// Операция для извлечения имени клона из блока sync (clone shipping;)
semantics.addOperation<string | null>('extractClone', {
  _nonterminal(...children: any[]): string | null {
    for (const child of children) {
      const result = child.extractClone();
      if (result) return result;
    }
    return null;
  },
  _iter(...children: any[]): string | null {
    for (const child of children) {
      const result = child.extractClone();
      if (result) return result;
    }
    return null;
  },
  _terminal(): string | null {
    return null;
  },

  // clone shipping;
  Entity_value(valueKeyword: any, value: any, _semicolon: any): string | null {
    if (CLONE_KEYWORDS.has(valueKeyword.sourceString)) {
      return value.sourceString;
    }
    return null;
  },
});

// Операция для извлечения ссылки на атрибут из блока key foreign
semantics.addOperation<string | null>('extractForeignKeyTarget', {
  _nonterminal(...children: any[]): string | null {
    for (const child of children) {
      const result = child.extractForeignKeyTarget();
      if (result) return result;
    }
    return null;
  },
  _iter(...children: any[]): string | null {
    for (const child of children) {
      const result = child.extractForeignKeyTarget();
      if (result) return result;
    }
    return null;
  },
  _terminal(): string | null {
    return null;
  },

  // attribute Entity.attr;
  Entity_simple(keyword: any, name: any, _semicolon: any): string | null {
    if (ATTRIBUTE_KEYWORDS.has(keyword.sourceString)) {
      return name.sourceString;
    }
    return null;
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

  // sync обрабатывается в extractSyncs, здесь пропускаем
  Entity_ref(_refKeyword: any, _ref: any, _semicolon: any): Partial<EntityAttribute> {
    return {};
  },

  // sync с блоком обрабатывается в extractSyncs, здесь рекурсивно обрабатываем блок для других свойств
  Entity_refOptions(_refKeyword: any, _ref: any, block: any, _semicolon: any): Partial<EntityAttribute> {
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
      const lines = content.split('\n');
      const linesBefore = content.substring(0, failurePos).split('\n');
      const lineNumber = linesBefore.length;
      const column = linesBefore[linesBefore.length - 1].length + 1;

      // Формируем контекст: 2 строки до, проблемная строка, 2 строки после
      const contextRadius = 2;
      const startLine = Math.max(0, lineNumber - 1 - contextRadius);
      const endLine = Math.min(lines.length - 1, lineNumber - 1 + contextRadius);

      let contextStr = '\nContext:\n';
      for (let i = startLine; i <= endLine; i++) {
        const prefix = i === lineNumber - 1 ? '>' : ' ';
        const lineNum = String(i + 1).padStart(6);
        contextStr += `${prefix}${lineNum} | ${lines[i]}\n`;
        if (i === lineNumber - 1) {
          contextStr += `       | ${' '.repeat(column - 1)}^\n`;
        }
      }

      console.error(
        `Schema parsing failed at line ${lineNumber}, column ${column}. Expected: ${expected}${contextStr}`
      );
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

    // Строим relations по навигационным свойствам
    const navigationRelations = buildNavigationRelations(entities);

    // Строим relations по односторонним ссылкам (sync/map)
    const linkRelations = buildLinkRelations(entities);

    // Объединяем все связи
    const relations = [...navigationRelations, ...linkRelations];

    return {
      entities,
      relations,
      hasExternalRelations: relations.some(r => r.type === 'external'),
      separate: schemaProps.separate,
      annotation: schemaProps.annotation,
    };
  } catch (error) {
    console.error('Schema parsing error:', error);
    return null;
  }
}
