import type { Text } from '@codemirror/state';
import { dslGrammar } from '@/lib/grammar';
import type { Node } from 'ohm-js';

/**
 * Тип токена для подсветки синтаксиса
 */
export type TokenType = 'keyword' | 'string' | 'comment' | 'identifier' | 'punctuation' | 'number' | 'ref';

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
  ...arrayFallbacks<Token>('getTokens'),

  Entity_annotation(this: Node, keyword: any, name: any, block: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем keyword (терминальный узел)
    tokens.push({
      from: keyword.source.startIdx,
      to: keyword.source.endIdx,
      type: 'keyword'
    });

    // Добавляем name (если есть - опциональный)
    if (name && name.source && name.source.endIdx > name.source.startIdx) {
      tokens.push(...name.getTokens());
    }

    // Добавляем токены из блока (как комментарий - содержимое аннотации)
    tokens.push({
      from: block.source.startIdx + 1,
      to: block.source.endIdx - 1,
      type: 'comment'
    });

    // Добавляем пунктуацию (если есть - опциональный терминальный узел)
    if (_semicolon && _semicolon.source && _semicolon.source.endIdx > _semicolon.source.startIdx) {
      tokens.push({
        from: _semicolon.source.startIdx,
        to: _semicolon.source.endIdx,
        type: 'punctuation'
      });
    }

    return tokens;
  },

  Entity_translate(translateKeyword: any, typeRef: any, stringValue: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];
    tokens.push({ from: translateKeyword.source.startIdx, to: translateKeyword.source.endIdx, type: 'keyword' });
    tokens.push(...typeRef.getTokens());
    if (stringValue.source.endIdx > stringValue.source.startIdx) {
      tokens.push(...stringValue.getTokens());
    }
    tokens.push({ from: _semicolon.source.startIdx, to: _semicolon.source.endIdx, type: 'punctuation' });
    return tokens;
  },

  Entity_typeOptions(typeKeyword: any, typeRef: any, block: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];
    tokens.push({ from: typeKeyword.source.startIdx, to: typeKeyword.source.endIdx, type: 'keyword' });
    tokens.push(...typeRef.getTokens());
    tokens.push(...block.getTokens());
    if (_semicolon && _semicolon.source && _semicolon.source.endIdx > _semicolon.source.startIdx) {
      tokens.push({ from: _semicolon.source.startIdx, to: _semicolon.source.endIdx, type: 'punctuation' });
    }
    return tokens;
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

  Entity_ref(refKeyword: any, ref: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];
    tokens.push({ from: refKeyword.source.startIdx, to: refKeyword.source.endIdx, type: 'keyword' });
    tokens.push(...ref.getTokens());
    tokens.push({ from: _semicolon.source.startIdx, to: _semicolon.source.endIdx, type: 'punctuation' });
    return tokens;
  },

  Entity_refOptions(refKeyword: any, ref: any, block: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];
    tokens.push({ from: refKeyword.source.startIdx, to: refKeyword.source.endIdx, type: 'keyword' });
    tokens.push(...ref.getTokens());
    tokens.push(...block.getTokens());
    if (_semicolon && _semicolon.source && _semicolon.source.endIdx > _semicolon.source.startIdx) {
      tokens.push({ from: _semicolon.source.startIdx, to: _semicolon.source.endIdx, type: 'punctuation' });
    }
    return tokens;
  },

  Entity_importRef(importKeyword: any, ref: any, _semicolon: any): Token[] {
    return [
      { from: importKeyword.source.startIdx, to: importKeyword.source.endIdx, type: 'keyword' },
      ...ref.getTokens(),
      { from: _semicolon.source.startIdx, to: _semicolon.source.endIdx, type: 'punctuation' },
    ];
  },

  Entity_importString(importKeyword: any, stringValue: any, _semicolon: any): Token[] {
    return [
      { from: importKeyword.source.startIdx, to: importKeyword.source.endIdx, type: 'keyword' },
      { from: stringValue.source.startIdx, to: stringValue.source.endIdx, type: 'string' },
      { from: _semicolon.source.startIdx, to: _semicolon.source.endIdx, type: 'punctuation' },
    ];
  },

  Entity_string(stringKeyword: any, stringValue: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем stringKeyword (терминальный узел)
    tokens.push({
      from: stringKeyword.source.startIdx,
      to: stringKeyword.source.endIdx,
      type: 'keyword'
    });

    // Добавляем stringValue (stringLiteral)
    tokens.push(...stringValue.getTokens());

    // Добавляем пунктуацию (терминальный узел)
    tokens.push({
      from: _semicolon.source.startIdx,
      to: _semicolon.source.endIdx,
      type: 'punctuation'
    });

    return tokens;
  },

  Entity_number(this: Node, numberKeyword: any, numberValue: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем numberKeyword (терминальный узел)
    tokens.push({
      from: numberKeyword.source.startIdx,
      to: numberKeyword.source.endIdx,
      type: 'keyword'
    });

    // Добавляем numberValue (число - терминальный узел)
    tokens.push({
      from: numberValue.source.startIdx,
      to: numberValue.source.endIdx,
      type: 'number'
    });

    // Добавляем пунктуацию (терминальный узел)
    tokens.push({
      from: _semicolon.source.startIdx,
      to: _semicolon.source.endIdx,
      type: 'punctuation'
    });

    return tokens;
  },

  Entity_value(valueKeyword: any, anyValue: any, _semicolon: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем valueKeyword (терминальный узел)
    tokens.push({
      from: valueKeyword.source.startIdx,
      to: valueKeyword.source.endIdx,
      type: 'keyword'
    });

    // Добавляем anyValue (делегируем обработку string/number/ref)
    tokens.push(...anyValue.getTokens());

    // Добавляем пунктуацию (терминальный узел)
    tokens.push({
      from: _semicolon.source.startIdx,
      to: _semicolon.source.endIdx,
      type: 'punctuation'
    });

    return tokens;
  },

  Entity_condition(throughKeyword: any, ref: any, anyValue: any, _semicolon: any): Token[] {
    return [
      { from: throughKeyword.source.startIdx, to: throughKeyword.source.endIdx, type: 'keyword' },
      ...ref.getTokens(),
      ...anyValue.getTokens(),
      { from: _semicolon.source.startIdx, to: _semicolon.source.endIdx, type: 'punctuation' },
    ];
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

  // typeRef = ref ("(" digit+ ("," digit+)* ")")? "[]"?
  // Арность: 7 (ref + размерность + квадратные скобки)
  typeRef(ref: any, openParen: any, firstDigits: any, commas: any, additionalDigits: any, closeParen: any, brackets: any): Token[] {
    const tokens: Token[] = [];

    // Добавляем ref (универсальная ссылка)
    tokens.push(...ref.getTokens());

    // Все остальное обрабатываем пока как пунктуацию
    const all_the_rest = [openParen, firstDigits, commas, additionalDigits, closeParen, brackets];

    for (const node of all_the_rest) {
      if (node && node.source) {
        tokens.push({
          from: node.source.startIdx,
          to: node.source.endIdx,
          type: 'punctuation'
        });
      } else if (node && node.children) {
        // Если это итератор, обрабатываем его дочерние узлы
        for (const child of node.children) {
          if (child && child.source) {
            tokens.push({
              from: child.source.startIdx,
              to: child.source.endIdx,
              type: 'punctuation'
            });
          }
        }
      }
    }

    return tokens;
  },


  // ref = relativePrefix? pathBody
  // Универсальная ссылка на идентификатор - подсвечивается как единый токен
  ref(this: Node, _relativePrefix: any, _pathBody: any): Token[] {
    return [{
      from: this.source.startIdx,
      to: this.source.endIdx,
      type: 'ref'
    }];
  },

  // relativePrefix = "./" | ("../")+
  // Подсвечиваем как пунктуацию (путевые символы)
  relativePrefix(this: Node, _content: any): Token[] {
    return [{
      from: this.source.startIdx,
      to: this.source.endIdx,
      type: 'punctuation'
    }];
  },

  // pathBody = identifier ("/" identifier)*
  // Арность: 3 (первый идентификатор + итератор слэшей + итератор остальных идентификаторов)
  pathBody(firstIdentifier: any, slashes: any, restIdentifiers: any): Token[] {
    const tokens: Token[] = [];

    // Первый идентификатор
    tokens.push(...firstIdentifier.getTokens());

    // Слэши как пунктуация
    if (slashes && slashes.children) {
      for (const slash of slashes.children) {
        if (slash && slash.source) {
          tokens.push({
            from: slash.source.startIdx,
            to: slash.source.endIdx,
            type: 'punctuation'
          });
        }
      }
    }

    // Остальные идентификаторы
    if (restIdentifiers && restIdentifiers.children) {
      for (const identifier of restIdentifiers.children) {
        tokens.push(...identifier.getTokens());
      }
    }

    return tokens;
  },

  // numberValue = "-"? digit+ ("." digit+)?
  // Арность: 4 (опциональный минус + целая часть + опциональная точка + опциональная дробная часть)
  numberValue(this: Node, _minus: any, _integerPart: any, _dot: any, _fractionalPart: any): Token[] {
    return [{
      from: this.source.startIdx,
      to: this.source.endIdx,
      type: 'number'
    }];
  },

  // anyValue = stringValue | numberValue | ref
  // Делегируем обработку дочернему узлу
  anyValue(content: any): Token[] {
    return content.getTokens();
  },

  // identifier = identifierPart ("." identifierPart)*
  // Арность: 3 (первый identifierPart + итератор точек + итератор identifierPart'ов)
  identifier(this: Node, _firstPart: any, _dots: any, _restParts: any): Token[] {
    return [{
      from: this.source.startIdx,
      to: this.source.endIdx,
      type: 'identifier'
    }];
  },

  // identifierPart = simpleIdentifier cloneSuffix?
  // Арность: 2 (simpleIdentifier + опциональный cloneSuffix)
  identifierPart(this: Node, _simpleName: any, _cloneSuffix: any): Token[] {
    // Часть идентификатора не обрабатываем отдельно,
    // она является частью составного identifier
    return [];
  },

  // simpleIdentifier = ("_" | letter) (letter | digit | "_")*
  // Арность: 2 (первый символ + итератор остальных)
  simpleIdentifier(this: Node, _firstLetter: any, _rest: any): Token[] {
    // Простой идентификатор не обрабатываем отдельно,
    // он является частью составного identifier
    return [];
  },

  // cloneSuffix = "(" name ")"
  // Арность: 3 (открывающая скобка + имя клона + закрывающая скобка)
  cloneSuffix(this: Node, _openParen: any, _name: any, _closeParen: any): Token[] {
    // Суффикс клона не обрабатываем отдельно,
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

