import type { StringStream, StreamParser } from '@codemirror/language';

// Ключевые слова для быстрой проверки
const KEYWORDS = new Set([
  'service', 'entity', 'type', 'attribute', 'import',
  'сервис', 'сущность', 'тип', 'реквизит', 'из'
]);

interface ParserState {
  inString: boolean;
  inComment: boolean;
  commentType: 'line' | 'block' | null;
}

// StreamParser для CodeMirror
export const dslStreamParser: StreamParser<ParserState> = {
  name: 'dsl',

  startState(): ParserState {
    return {
      inString: false,
      inComment: false,
      commentType: null
    };
  },

  token(stream: StringStream, state: ParserState): string | null {
    // Обработка многострочного комментария
    if (state.inComment && state.commentType === 'block') {
      if (stream.match('*/')) {
        state.inComment = false;
        state.commentType = null;
        return 'comment';
      }
      stream.next();
      return 'comment';
    }

    // Пропускаем пробелы
    if (stream.eatSpace()) {
      return null;
    }

    // Однострочный комментарий
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Многострочный комментарий
    if (stream.match('/*')) {
      state.inComment = true;
      state.commentType = 'block';
      return 'comment';
    }

    // Строковый литерал
    if (stream.peek() === '"') {
      stream.next(); // Открывающая кавычка

      while (!stream.eol()) {
        const char = stream.next();
        if (char === '"') {
          return 'string';
        }
        if (char === '\\') {
          stream.next(); // Экранированный символ
        }
      }

      return 'string'; // Незакрытая строка
    }

    // Операторы и пунктуация
    if (stream.match(/[{};]/)) {
      return 'punctuation';
    }

    // Идентификаторы и ключевые слова
    // Поддержка кириллицы и латиницы
    if (stream.match(/[a-zA-Zа-яА-ЯёЁ_][a-zA-Zа-яА-ЯёЁ0-9_]*/)) {
      const word = stream.current();

      // Проверяем, является ли слово ключевым
      if (KEYWORDS.has(word)) {
        return 'keyword';
      }

      return 'variableName';
    }

    // Числа (на случай расширения грамматики)
    if (stream.match(/\d+/)) {
      return 'number';
    }

    // Неизвестный символ
    stream.next();
    return null;
  },

  // Настройки отступов (опционально)
  // indent(_state: ParserState, _textAfter: string): number {
  //   return 0;
  // },

  languageData: {
    commentTokens: {
      line: '//',
      block: { open: '/*', close: '*/' }
    }
  }
};

