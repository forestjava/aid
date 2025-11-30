import type { Text } from '@codemirror/state';
import { dslGrammar } from './dsl-grammar';
import type { Node } from 'ohm-js';

/**
 * Тип токена для подсветки синтаксиса
 */
export type TokenType = 'keyword' | 'string' | 'comment' | 'identifier' | 'punctuation' | 'number';

/**
 * Токен с позицией в документе
 */
export interface Token {
  from: number;
  to: number;
  type: TokenType;
}

/**
 * Кэш результатов парсинга
 */
interface ParseCache {
  version: number;
  tokens: Token[];
}

let parseCache: ParseCache | null = null;

/**
 * Semantic visitor для извлечения токенов из Ohm дерева разбора
 * 
 * В Ohm semantics работает так:
 * 1. Создаём semantics и добавляем операцию
 * 2. Вызываем semantics(matchResult) для получения адаптера
 * 3. Вызываем операцию на адаптере: adapter.operationName()
 * 4. Внутри операции this - это текущий узел, а аргументы - это дочерние узлы (уже обёрнутые в адаптер)
 */
const semantics = dslGrammar.createSemantics();

semantics.addOperation<Token[]>('getTokens', {
  _terminal(this: Node): Token[] {
    // Терминальные узлы не обрабатываем напрямую
    return [];
  },

  _iter(...children: any[]): Token[] {
    // Итераторы (*, +, ?) - собираем токены от всех детей
    // Дочерние элементы уже обёрнуты в semantic adapter
    return children.flatMap(child => child.getTokens());
  },

  Program(entities: any): Token[] {
    // entities - это уже semantic adapter с операцией getTokens
    return entities.getTokens();
  },

  Entity_type(typeKeyword: any, typeRef: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем typeKeyword (терминальный узел)
    tokens.push({
      from: typeKeyword.source.startIdx,
      to: typeKeyword.source.endIdx,
      type: 'keyword'
    });

    // Добавляем typeRef (identifier с опциональными скобками)
    tokens.push(...typeRef.getTokens());

    // Добавляем пунктуацию (терминальный узел)
    tokens.push({
      from: _semicolon.source.startIdx,
      to: _semicolon.source.endIdx,
      type: 'punctuation'
    });

    return tokens;
  },

  Entity_import(importKeyword: any, importRef: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем importKeyword (терминальный узел)
    tokens.push({
      from: importKeyword.source.startIdx,
      to: importKeyword.source.endIdx,
      type: 'keyword'
    });

    // Добавляем importRef (stringLiteral)
    tokens.push(...importRef.getTokens());

    // Добавляем пунктуацию (терминальный узел)
    tokens.push({
      from: _semicolon.source.startIdx,
      to: _semicolon.source.endIdx,
      type: 'punctuation'
    });

    return tokens;
  },

  Entity_simple(keyword: any, name: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем keyword (терминальный узел)
    tokens.push({
      from: keyword.source.startIdx,
      to: keyword.source.endIdx,
      type: 'keyword'
    });

    // Добавляем name (может быть identifier или stringLiteral)
    tokens.push(...name.getTokens());

    // Добавляем пунктуацию (терминальный узел)
    tokens.push({
      from: _semicolon.source.startIdx,
      to: _semicolon.source.endIdx,
      type: 'punctuation'
    });

    return tokens;
  },

  Entity_options(keyword: any, name: any, block: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем keyword (терминальный узел)
    tokens.push({
      from: keyword.source.startIdx,
      to: keyword.source.endIdx,
      type: 'keyword'
    });

    // Добавляем name
    tokens.push(...name.getTokens());

    // Добавляем токены из блока
    tokens.push(...block.getTokens());

    // Добавляем пунктуацию (если есть - опциональный терминальный узел)
    if (_semicolon && _semicolon.source) {
      tokens.push({
        from: _semicolon.source.startIdx,
        to: _semicolon.source.endIdx,
        type: 'punctuation'
      });
    }

    return tokens;
  },

  Block(_open: any, items: any, _close: any): Token[] {
    const tokens: Token[] = [];

    // Открывающая скобка (терминальный узел)
    tokens.push({
      from: _open.source.startIdx,
      to: _open.source.endIdx,
      type: 'punctuation'
    });

    // Содержимое блока
    tokens.push(...items.getTokens());

    // Закрывающая скобка (терминальный узел)
    tokens.push({
      from: _close.source.startIdx,
      to: _close.source.endIdx,
      type: 'punctuation'
    });

    return tokens;
  },

  Item(entity: any): Token[] {
    return entity.getTokens();
  },

  // typeRef = identifier "[]"?
  // Арность: 2 (identifier + опциональные скобки)
  typeRef(identifier: any, brackets: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем идентификатор
    tokens.push(...identifier.getTokens());

    // Добавляем скобки [] если они есть (опциональный терминальный узел)
    if (brackets && brackets.source) {
      tokens.push({
        from: brackets.source.startIdx,
        to: brackets.source.endIdx,
        type: 'punctuation'
      });
    }

    return tokens;
  },

  // importRef = stringLiteral
  // Арность: 1 (только stringLiteral)
  importRef(stringLiteral: any): Token[] {
    // Делегируем обработку stringLiteral
    return stringLiteral.getTokens();
  },

  // identifier = simpleIdentifier ("." simpleIdentifier)*
  // Арность: 3 (первый simpleIdentifier + итератор точек + итератор simpleIdentifier'ов)
  identifier(this: Node, _firstIdentifier: any, _dots: any, _restIdentifiers: any): Token[] {
    return [{
      from: this.source.startIdx,
      to: this.source.endIdx,
      type: 'identifier'
    }];
  },

  // simpleIdentifier = letter (letter | digit)*
  // Арность: 2 (первая буква + итератор остальных)
  simpleIdentifier(this: Node, _firstLetter: any, _rest: any): Token[] {
    // Простой идентификатор не обрабатываем отдельно,
    // он является частью составного identifier
    return [];
  },

  // stringLiteral = "\"" (~"\"" any)* "\""
  // Арность: 3 (открывающая кавычка + содержимое + закрывающая кавычка)
  stringLiteral(this: Node, _openQuote: any, _content: any, _closeQuote: any): Token[] {
    return [{
      from: this.source.startIdx,
      to: this.source.endIdx,
      type: 'string'
    }];
  },

  // comment = multiLineComment | singleLineComment
  // Арность: 1 (выбор одного из вариантов)
  comment(this: Node, commentNode: any): Token[] {
    // Делегируем обработку конкретному типу комментария
    return commentNode.getTokens();
  },

  // singleLineComment = "//" (~"\n" any)*
  // Арность: 2 ("//" + содержимое до конца строки)
  singleLineComment(this: Node, _marker: any, _content: any): Token[] {
    return [{
      from: this.source.startIdx,
      to: this.source.endIdx,
      type: 'comment'
    }];
  },

  // multiLineComment = "/*" (~"*/" any)* "*/"
  // Арность: 3 (открывающий маркер + содержимое + закрывающий маркер)
  multiLineComment(this: Node, _openMarker: any, _content: any, _closeMarker: any): Token[] {
    return [{
      from: this.source.startIdx,
      to: this.source.endIdx,
      type: 'comment'
    }];
  }
});

/**
 * Парсит документ и извлекает токены для подсветки синтаксиса
 * Использует кэш для избежания повторного парсинга
 */
export function getHighlightTokens(doc: Text, version: number): Token[] {
  // Проверяем кэш
  if (parseCache && parseCache.version === version) {
    return parseCache.tokens;
  }

  const text = doc.toString();
  const tokens: Token[] = [];

  // Пустой документ
  if (text.trim() === '') {
    parseCache = { version, tokens: [] };
    return tokens;
  }

  try {
    // Парсим через Ohm
    const match = dslGrammar.match(text);

    if (match.succeeded()) {
      // Извлекаем токены через semantic visitor
      // semantics(match) возвращает адаптер с нашими операциями
      const adapter: any = semantics(match);
      const extractedTokens = adapter.getTokens();
      tokens.push(...extractedTokens);
    } else {
      // Парсинг не удался - выводим подробную информацию
      const failurePos = match.getRightmostFailurePosition();
      const expected = match.getExpectedText();

      // Находим строку и позицию в строке
      const lines = text.substring(0, failurePos).split('\n');
      const lineNumber = lines.length;
      const columnNumber = lines[lines.length - 1].length + 1;

      // Получаем контекст ошибки
      const lineStart = text.lastIndexOf('\n', failurePos - 1) + 1;
      const lineEnd = text.indexOf('\n', failurePos);
      const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);

      console.error(
        `DSL syntax highlighting failed - parsing error:\n` +
        `  Position: line ${lineNumber}, column ${columnNumber} (offset ${failurePos})\n` +
        `  Expected: ${expected}\n` +
        `  Line content: "${line}"\n` +
        `  Error marker: ${' '.repeat(columnNumber - 1)}^`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error
      ? `DSL syntax highlighting failed - unexpected error during parsing:\n` +
      `  Error: ${error}\n` +
      `  Message: ${error.message}\n` +
      `  Stack: ${error.stack}`
      : `DSL syntax highlighting failed - unexpected error during parsing:\n` +
      `  Error: ${error}`;
    console.error(errorMessage);
  }

  // Сортируем токены по позиции
  tokens.sort((a, b) => a.from - b.from);

  // Кэшируем результат
  parseCache = { version, tokens };

  return tokens;
}


/**
 * Инвалидирует кэш (для тестирования или принудительного обновления)
 */
export function invalidateCache(): void {
  parseCache = null;
}

