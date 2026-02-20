import * as ohm from 'ohm-js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Информация об импорте
 */
export interface ImportInfo {
  keyword: string;
  path: string;
  fullText: string;
  position: {
    start: number;
    end: number;
  };
}

/**
 * Результат парсинга в JSON формате
 * Ключи - имена entities, значения - объекты с атрибутами (имя атрибута -> тип)
 */
export type ParsedEntities = Record<string, Record<string, string>>;

/**
 * Информация о найденном определении (entity или атрибут)
 */
export interface DefinitionInfo {
  name: string;
  line: number;
  column: number;
  type: 'entity' | 'attribute';
}

/**
 * Константы для ключевых слов DSL
 */
const ENTITY_KEYWORDS = new Set(['entity', 'сущность', 'class', 'класс', 'table', 'таблица', 'model', 'модель', 'json', 'dto', 'endpoint', 'enum', 'перечисление', 'store', 'ui']);
const ATTRIBUTE_KEYWORDS = new Set(['attribute', 'реквизит', 'method', 'метод', 'property', 'свойство']);

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
 * Helper: генерирует fallback-обработчики для операций, возвращающих первое найденное значение
 */
function firstMatchFallbacks<T>(opName: string) {
  return {
    _nonterminal(...children: any[]): T | null {
      for (const child of children) {
        const result = child[opName]();
        if (result) return result;
      }
      return null;
    },
    _iter(...children: any[]): T | null {
      for (const child of children) {
        const result = child[opName]();
        if (result) return result;
      }
      return null;
    },
    _terminal(): T | null {
      return null;
    },
  };
}

/**
 * Внутренний тип для информации о найденном определении с offset
 */
interface DefinitionMatch {
  name: string;
  offset: number;
  type: 'entity' | 'attribute';
}

/**
 * Конвертирует offset в line/column
 */
function offsetToLineColumn(content: string, offset: number): { line: number; column: number } {
  const lines = content.substring(0, offset).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

/**
 * DSL Parser - парсер грамматики DSL
 */
export class DslParser {
  private readonly grammar: ohm.Grammar;
  private readonly importSemantics: ohm.Semantics;
  private readonly parseSemantics: ohm.Semantics;

  constructor() {
    // Загружаем грамматику из shared
    const grammarPath = path.resolve(process.cwd(), '../shared/grammar.ohm');
    const grammarSource = fs.readFileSync(grammarPath, 'utf-8');
    this.grammar = ohm.grammar(grammarSource);

    // Создаем семантики
    this.importSemantics = this.createImportSemantics();
    this.parseSemantics = this.createParseSemantics();
  }

  /**
   * Создает семантику для извлечения импортов
   */
  private createImportSemantics(): ohm.Semantics {
    const semantics = this.grammar.createSemantics();

    semantics.addOperation<ImportInfo[]>('findImports', {
      ...arrayFallbacks<ImportInfo>('findImports'),

      // import "path";
      Entity_importString(this: ohm.Node, importKeyword: any, stringValue: any, _semicolon: any): ImportInfo[] {
        return [{
          keyword: importKeyword.sourceString,
          path: stringValue.sourceString.slice(1, -1),
          fullText: this.sourceString,
          position: { start: this.source.startIdx, end: this.source.endIdx },
        }];
      },

      // import Demo/Post;
      Entity_importRef(this: ohm.Node, importKeyword: any, ref: any, _semicolon: any): ImportInfo[] {
        return [{
          keyword: importKeyword.sourceString,
          path: ref.sourceString,
          fullText: this.sourceString,
          position: { start: this.source.startIdx, end: this.source.endIdx },
        }];
      },
    });

    return semantics;
  }

  /**
   * Создает семантику для парсинга entities в JSON формат
   */
  private createParseSemantics(): ohm.Semantics {
    const semantics = this.grammar.createSemantics();

    // Операция для извлечения entities с атрибутами
    semantics.addOperation<ParsedEntities>('extractEntities', {
      ...objectFallbacks<ParsedEntities>('extractEntities'),

      // entity Name { ... };
      Entity_options(keyword: any, name: any, block: any, _semicolon: any): ParsedEntities {
        if (ENTITY_KEYWORDS.has(keyword.sourceString)) {
          return { [name.sourceString]: block.extractAttributes() };
        }
        return block.extractEntities();
      },
    });

    // Операция для извлечения атрибутов внутри entity
    semantics.addOperation<Record<string, string>>('extractAttributes', {
      ...objectFallbacks<Record<string, string>>('extractAttributes'),

      // attribute name;
      Entity_simple(keyword: any, name: any, _semicolon: any): Record<string, string> {
        if (ATTRIBUTE_KEYWORDS.has(keyword.sourceString)) {
          return { [name.sourceString]: '' };
        }
        return {};
      },

      // attribute name { type SomeType; };
      Entity_options(keyword: any, name: any, block: any, _semicolon: any): Record<string, string> {
        if (ATTRIBUTE_KEYWORDS.has(keyword.sourceString)) {
          return { [name.sourceString]: block.extractType() || '' };
        }
        return {};
      },

    });

    // Операция для извлечения типа из блока атрибута
    semantics.addOperation<string | null>('extractType', {
      ...firstMatchFallbacks<string>('extractType'),

      // type SomeType { clone X; };
      Entity_typeOptions(_typeKeyword: any, typeRef: any, _block: any, _semicolon: any): string | null {
        return typeRef.sourceString;
      },

      // type SomeType;
      Entity_type(_typeKeyword: any, typeRef: any, _semicolon: any): string | null {
        return typeRef.sourceString;
      },

    });

    return semantics;
  }

  /**
   * Извлекает импорты из контента
   */
  extractImports(content: string): ImportInfo[] {
    if (!content || content.trim() === '') {
      return [];
    }

    const match = this.grammar.match(content);

    if (match.failed()) {
      return [];
    }

    const adapter = this.importSemantics(match);
    return adapter.findImports();
  }

  /**
   * Парсит контент и извлекает entities с атрибутами
   * @returns ParsedEntities или null при ошибке парсинга
   */
  parseEntities(content: string): { entities: ParsedEntities } | { error: string; line: number } {
    if (!content || content.trim() === '') {
      return { entities: {} };
    }

    const match = this.grammar.match(content);

    if (match.failed()) {
      const failurePos = match.getRightmostFailurePosition();
      const expected = match.getExpectedText();
      const lines = content.substring(0, failurePos).split('\n');
      const lineNumber = lines.length;

      return {
        error: `Expected: ${expected}`,
        line: lineNumber,
      };
    }

    const adapter = this.parseSemantics(match);
    const entities: ParsedEntities = adapter.extractEntities();

    return { entities };
  }

  /**
   * Ищет позицию определения entity или атрибута по пути
   * @param content - контент файла
   * @param targetPath - путь к определению, например ['Post'] или ['Post', 'author']
   * @returns DefinitionInfo или null если не найдено
   */
  findDefinitionPosition(content: string, targetPath: string[]): DefinitionInfo | null {
    if (!content || content.trim() === '' || targetPath.length === 0) {
      return null;
    }

    const match = this.grammar.match(content);

    if (match.failed()) {
      return null;
    }

    // Создаём семантику для поиска определений
    const semantics = this.grammar.createSemantics();

    // Операция для сбора всех определений с их позициями
    semantics.addOperation<DefinitionMatch[]>('collectDefinitions', {
      ...arrayFallbacks<DefinitionMatch>('collectDefinitions'),

      // entity Name { ... };
      Entity_options(this: ohm.Node, keyword: any, name: any, block: any, _semicolon: any): DefinitionMatch[] {
        const results: DefinitionMatch[] = [];

        if (ENTITY_KEYWORDS.has(keyword.sourceString)) {
          // Это entity - добавляем его
          results.push({
            name: name.sourceString,
            offset: name.source.startIdx,
            type: 'entity',
          });

          // Собираем атрибуты внутри entity
          const attributes: DefinitionMatch[] = block.collectAttributes();
          results.push(...attributes);
        } else {
          // Для не-entity рекурсивно ищем внутри блока
          results.push(...block.collectDefinitions());
        }

        return results;
      },

      // entity Name;
      Entity_simple(this: ohm.Node, keyword: any, name: any, _semicolon: any): DefinitionMatch[] {
        if (ENTITY_KEYWORDS.has(keyword.sourceString)) {
          return [{
            name: name.sourceString,
            offset: name.source.startIdx,
            type: 'entity',
          }];
        }
        return [];
      },
    });

    // Операция для сбора атрибутов внутри entity
    semantics.addOperation<DefinitionMatch[]>('collectAttributes', {
      ...arrayFallbacks<DefinitionMatch>('collectAttributes'),

      // attribute name;
      Entity_simple(this: ohm.Node, keyword: any, name: any, _semicolon: any): DefinitionMatch[] {
        if (ATTRIBUTE_KEYWORDS.has(keyword.sourceString)) {
          return [{
            name: name.sourceString,
            offset: name.source.startIdx,
            type: 'attribute',
          }];
        }
        return [];
      },

      // attribute name { ... };
      Entity_options(this: ohm.Node, keyword: any, name: any, block: any, _semicolon: any): DefinitionMatch[] {
        if (ATTRIBUTE_KEYWORDS.has(keyword.sourceString)) {
          return [{
            name: name.sourceString,
            offset: name.source.startIdx,
            type: 'attribute',
          }];
        }
        return [];
      },
    });

    const adapter = semantics(match);
    const definitions: DefinitionMatch[] = adapter.collectDefinitions();

    // Ищем по targetPath
    // targetPath[0] - имя entity
    // targetPath[1+] - путь к атрибуту внутри entity
    const entityName = targetPath[0];
    const entityDef = definitions.find(d => d.name === entityName && d.type === 'entity');

    if (!entityDef) {
      return null;
    }

    // Если нужен только entity
    if (targetPath.length === 1) {
      const pos = offsetToLineColumn(content, entityDef.offset);
      return {
        name: entityDef.name,
        line: pos.line,
        column: pos.column,
        type: 'entity',
      };
    }

    // Ищем атрибут
    // Для простоты сейчас поддерживаем только один уровень вложенности (entity.attribute)
    const attrName = targetPath[1];
    const attrDef = definitions.find(d => d.name === attrName && d.type === 'attribute');

    if (!attrDef) {
      return null;
    }

    const pos = offsetToLineColumn(content, attrDef.offset);
    return {
      name: attrDef.name,
      line: pos.line,
      column: pos.column,
      type: 'attribute',
    };
  }
}

// Singleton instance
let parserInstance: DslParser | null = null;

/**
 * Получает singleton экземпляр парсера
 */
export function getDslParser(): DslParser {
  if (!parserInstance) {
    parserInstance = new DslParser();
  }
  return parserInstance;
}
