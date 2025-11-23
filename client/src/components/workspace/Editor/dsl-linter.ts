import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { dslGrammar } from './dsl-grammar';

// Функция линтинга на основе Ohm
export const dslLinter = linter(view => {
  const diagnostics: Diagnostic[] = [];
  const doc = view.state.doc.toString();

  // Пустой документ - не ошибка
  if (doc.trim() === '') {
    return diagnostics;
  }

  // Пробуем распарсить весь документ
  const match = dslGrammar.match(doc);

  if (match.failed()) {
    // Получаем позицию ошибки
    const pos = match.getRightmostFailurePosition();

    // Получаем ожидаемые правила
    const expected = match.getExpectedText();

    // Находим конец строки для подчеркивания
    const lineEnd = doc.indexOf('\n', pos);

    diagnostics.push({
      from: pos,
      to: lineEnd !== -1 ? lineEnd : doc.length,
      severity: 'error',
      message: `Синтаксическая ошибка. Ожидается: ${expected}`
    });
  }

  return diagnostics;
});

