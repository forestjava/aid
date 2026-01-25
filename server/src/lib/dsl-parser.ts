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
      _terminal(): ImportInfo[] {
        return [];
      },

      _iter(...children: any[]): ImportInfo[] {
        return children.flatMap(child => child.findImports());
      },

      Program(entities: any): ImportInfo[] {
        return entities.findImports();
      },

      Entity_annotation(_keyword: any, _name: any, _block: any, _semicolon: any): ImportInfo[] {
        return [];
      },

      Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): ImportInfo[] {
        return [];
      },

      Entity_string(this: ohm.Node, stringKeyword: any, stringValue: any, _semicolon: any): ImportInfo[] {
        const keywordStr = stringKeyword.sourceString;

        if (IMPORT_MODIFIERS.has(keywordStr)) {
          const importPath = stringValue.sourceString.slice(1, -1);

          return [{
            keyword: keywordStr,
            path: importPath,
            fullText: this.sourceString,
            position: {
              start: this.source.startIdx,
              end: this.source.endIdx,
            },
          }];
        }

        return [];
      },

      Entity_number(_numberKeyword: any, _numberValue: any, _semicolon: any): ImportInfo[] {
        return [];
      },

      Entity_simple(_keyword: any, _name: any, _semicolon: any): ImportInfo[] {
        return [];
      },

      Entity_options(_keyword: any, _name: any, block: any, _semicolon: any): ImportInfo[] {
        return block.findImports();
      },

      Block(_open: any, items: any, _close: any): ImportInfo[] {
        return items.findImports();
      },

      Item(entity: any): ImportInfo[] {
        return entity.findImports();
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
      _terminal(): ParsedEntities {
        return {};
      },

      _iter(...children: any[]): ParsedEntities {
        return children.reduce((acc, child) => ({ ...acc, ...child.extractEntities() }), {});
      },

      Program(entities: any): ParsedEntities {
        return entities.extractEntities();
      },

      Entity_annotation(_keyword: any, _name: any, _block: any, _semicolon: any): ParsedEntities {
        return {};
      },

      Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): ParsedEntities {
        return {};
      },

      Entity_string(_stringKeyword: any, _stringValue: any, _semicolon: any): ParsedEntities {
        return {};
      },

      Entity_number(_numberKeyword: any, _numberValue: any, _semicolon: any): ParsedEntities {
        return {};
      },

      Entity_simple(_keyword: any, _name: any, _semicolon: any): ParsedEntities {
        return {};
      },

      Entity_options(keyword: any, name: any, block: any, _semicolon: any): ParsedEntities {
        const keywordStr = keyword.sourceString;
        const nameStr = name.sourceString;

        // Обрабатываем только entity
        if (ENTITY_KEYWORDS.has(keywordStr)) {
          const attributes = block.extractAttributes();
          return { [nameStr]: attributes };
        }

        // Для остальных (service, etc.) - рекурсивно извлекаем вложенные entities
        return block.extractEntities();
      },

      Block(_open: any, items: any, _close: any): ParsedEntities {
        return items.extractEntities();
      },

      Item(entity: any): ParsedEntities {
        return entity.extractEntities();
      },
    });

    // Операция для извлечения атрибутов внутри entity
    semantics.addOperation<Record<string, string>>('extractAttributes', {
      _terminal(): Record<string, string> {
        return {};
      },

      _iter(...children: any[]): Record<string, string> {
        return children.reduce((acc, child) => ({ ...acc, ...child.extractAttributes() }), {});
      },

      Entity_annotation(_keyword: any, _name: any, _block: any, _semicolon: any): Record<string, string> {
        return {};
      },

      Entity_type(_typeKeyword: any, _typeRef: any, _semicolon: any): Record<string, string> {
        return {};
      },

      Entity_string(_stringKeyword: any, _stringValue: any, _semicolon: any): Record<string, string> {
        return {};
      },

      Entity_number(_numberKeyword: any, _numberValue: any, _semicolon: any): Record<string, string> {
        return {};
      },

      Entity_simple(keyword: any, name: any, _semicolon: any): Record<string, string> {
        const keywordStr = keyword.sourceString;
        const nameStr = name.sourceString;

        // Обрабатываем только attribute без блока опций
        if (ATTRIBUTE_KEYWORDS.has(keywordStr)) {
          return { [nameStr]: 'unknown' };
        }

        return {};
      },

      Entity_options(keyword: any, name: any, block: any, _semicolon: any): Record<string, string> {
        const keywordStr = keyword.sourceString;
        const nameStr = name.sourceString;

        // Обрабатываем только attribute с блоком опций
        if (ATTRIBUTE_KEYWORDS.has(keywordStr)) {
          const type = block.extractType();
          return { [nameStr]: type || 'unknown' };
        }

        return {};
      },

      Block(_open: any, items: any, _close: any): Record<string, string> {
        return items.extractAttributes();
      },

      Item(entity: any): Record<string, string> {
        return entity.extractAttributes();
      },
    });

    // Операция для извлечения типа из блока атрибута
    semantics.addOperation<string | null>('extractType', {
      _terminal(): string | null {
        return null;
      },

      _iter(...children: any[]): string | null {
        for (const child of children) {
          const type = child.extractType();
          if (type) return type;
        }
        return null;
      },

      Entity_annotation(_keyword: any, _name: any, _block: any, _semicolon: any): string | null {
        return null;
      },

      Entity_type(_typeKeyword: any, typeRef: any, _semicolon: any): string | null {
        return typeRef.sourceString;
      },

      Entity_string(_stringKeyword: any, _stringValue: any, _semicolon: any): string | null {
        return null;
      },

      Entity_number(_numberKeyword: any, _numberValue: any, _semicolon: any): string | null {
        return null;
      },

      Entity_simple(_keyword: any, _name: any, _semicolon: any): string | null {
        return null;
      },

      Entity_options(_keyword: any, _name: any, block: any, _semicolon: any): string | null {
        return block.extractType();
      },

      Block(_open: any, items: any, _close: any): string | null {
        return items.extractType();
      },

      Item(entity: any): string | null {
        return entity.extractType();
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
