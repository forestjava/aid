import { ViewPlugin, ViewUpdate, EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { getHighlightTokens, type TokenType } from './dsl-highlighter';

/**
 * Маппинг типов токенов на CSS классы CodeMirror
 */
const TOKEN_CLASS_MAP: Record<TokenType, string> = {
  keyword: 'tok-keyword',
  string: 'tok-string',
  comment: 'tok-comment',
  identifier: 'tok-variableName',
  punctuation: 'tok-punctuation',
  number: 'tok-number'
};

/**
 * ViewPlugin для подсветки синтаксиса DSL через Ohm
 * Использует decorations на основе кэшированных токенов
 */
export const dslSyntaxHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // Обновляем decorations только если документ изменился
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();

      try {
        // Получаем токены из кэша или парсим заново
        const tokens = getHighlightTokens(view.state.doc, view.state.doc.length);

        // Строим decorations для видимого диапазона
        const { from, to } = view.viewport;

        for (const token of tokens) {
          // Пропускаем токены вне видимого диапазона для оптимизации
          if (token.to < from) continue;
          if (token.from > to) break;

          // Получаем CSS класс для типа токена
          const cssClass = TOKEN_CLASS_MAP[token.type];
          if (!cssClass) continue;

          // Создаем decoration
          const decoration = Decoration.mark({
            class: cssClass
          });

          // Добавляем в builder
          builder.add(token.from, token.to, decoration);
        }
      } catch (error) {
        console.error('Error building decorations:', error);
      }

      return builder.finish();
    }
  },
  {
    decorations: v => v.decorations
  }
);

