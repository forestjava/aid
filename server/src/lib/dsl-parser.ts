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
 * Константы для ключевых слов DSL
 */
const IMPORT_MODIFIERS = new Set(['import', 'из']);
const ENTITY_KEYWORDS = new Set(['entity', 'сущность', 'class']);
const ATTRIBUTE_KEYWORDS = new Set(['attribute', 'реквизит', 'method', 'метод']);

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
      Entity_string(this: ohm.Node, stringKeyword: any, stringValue: any, _semicolon: any): ImportInfo[] {
        if (IMPORT_MODIFIERS.has(stringKeyword.sourceString)) {
          return [{
            keyword: stringKeyword.sourceString,
            path: stringValue.sourceString.slice(1, -1),
            fullText: this.sourceString,
            position: { start: this.source.startIdx, end: this.source.endIdx },
          }];
        }
        return [];
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
          return { [name.sourceString]: 'unknown' };
        }
        return {};
      },

      // attribute name { type SomeType; };
      Entity_options(keyword: any, name: any, block: any, _semicolon: any): Record<string, string> {
        if (ATTRIBUTE_KEYWORDS.has(keyword.sourceString)) {
          return { [name.sourceString]: block.extractType() || 'unknown' };
        }
        return {};
      },
    });

    // Операция для извлечения типа из блока атрибута
    semantics.addOperation<string | null>('extractType', {
      ...firstMatchFallbacks<string>('extractType'),

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
