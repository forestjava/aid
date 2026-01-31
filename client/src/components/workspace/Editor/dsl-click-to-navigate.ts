import {
  ViewPlugin,
  ViewUpdate,
  EditorView,
  Decoration,
  type DecorationSet,
} from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder, Facet } from '@codemirror/state';
import { getHighlightTokens, type Token } from './dsl-highlighter';
import { navigateToRef } from '@/lib/navigation';

/**
 * Facet для хранения имени текущего файла
 */
export const sourceFacet = Facet.define<string, string>({
  combine: values => values[0] ?? ''
});

/**
 * StateEffect для установки hover-позиции ref
 */
const setHoveredRef = StateEffect.define<{ from: number; to: number } | null>();

/**
 * StateField для хранения текущего hover ref
 */
const hoveredRefField = StateField.define<{ from: number; to: number } | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHoveredRef)) {
        return effect.value;
      }
    }
    // Очищаем при изменении документа
    if (tr.docChanged) {
      return null;
    }
    return value;
  },
});

/**
 * Находит ref токен в указанной позиции документа
 */
function findRefTokenAtPosition(view: EditorView, pos: number): Token | null {
  const tokens = getHighlightTokens(view.state.doc, view.state.doc.length);

  for (const token of tokens) {
    if (token.type === 'ref' && token.from <= pos && pos <= token.to) {
      return token;
    }
  }

  return null;
}

/**
 * ViewPlugin для отслеживания Ctrl+hover и клика по ref
 */
const clickToNavigatePlugin = ViewPlugin.fromClass(
  class {
    private isCtrlPressed = false;
    private view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      // Добавляем глобальные обработчики для отслеживания Ctrl
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('keyup', this.handleKeyUp);
    }

    destroy() {
      document.removeEventListener('keydown', this.handleKeyDown);
      document.removeEventListener('keyup', this.handleKeyUp);
    }

    update(_update: ViewUpdate) {
      // Ничего не делаем при обновлении
    }

    private handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' && !this.isCtrlPressed) {
        this.isCtrlPressed = true;
        // При нажатии Ctrl обновляем состояние курсора
        this.view.contentDOM.style.cursor = '';
      }
    };

    private handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        this.isCtrlPressed = false;
        // Сбрасываем hover при отпускании Ctrl
        this.view.dispatch({
          effects: setHoveredRef.of(null),
        });
        this.view.contentDOM.style.cursor = '';
      }
    };
  },
  {
    eventHandlers: {
      mousemove(e: MouseEvent, view: EditorView) {
        // Проверяем, нажат ли Ctrl
        if (!e.ctrlKey) {
          // Сбрасываем hover если Ctrl не нажат
          const currentHover = view.state.field(hoveredRefField);
          if (currentHover !== null) {
            view.dispatch({
              effects: setHoveredRef.of(null),
            });
          }
          return;
        }

        // Получаем позицию курсора в документе
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) {
          view.dispatch({
            effects: setHoveredRef.of(null),
          });
          return;
        }

        // Ищем ref токен под курсором
        const refToken = findRefTokenAtPosition(view, pos);

        if (refToken) {
          // Устанавливаем hover на ref
          const currentHover = view.state.field(hoveredRefField);
          if (
            !currentHover ||
            currentHover.from !== refToken.from ||
            currentHover.to !== refToken.to
          ) {
            view.dispatch({
              effects: setHoveredRef.of({ from: refToken.from, to: refToken.to }),
            });
          }
        } else {
          // Сбрасываем hover если курсор не на ref
          const currentHover = view.state.field(hoveredRefField);
          if (currentHover !== null) {
            view.dispatch({
              effects: setHoveredRef.of(null),
            });
          }
        }
      },

      mousedown(e: MouseEvent, view: EditorView) {
        // Проверяем Ctrl+Click
        if (!e.ctrlKey) {
          return;
        }

        // Получаем позицию клика
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) {
          return;
        }

        // Ищем ref токен под курсором
        const refToken = findRefTokenAtPosition(view, pos);

        if (refToken) {
          // Получаем текст ссылки
          const refText = view.state.doc.sliceString(refToken.from, refToken.to);
          // Получаем имя текущего файла из Facet
          const source = view.state.facet(sourceFacet);

          // Выполняем навигацию
          const handled = navigateToRef({
            ref: refText,
            source,
          });

          if (handled) {
            // Предотвращаем стандартное поведение
            e.preventDefault();
          }
        }
      },

      mouseleave(_e: MouseEvent, view: EditorView) {
        // Сбрасываем hover при уходе курсора из редактора
        const currentHover = view.state.field(hoveredRefField);
        if (currentHover !== null) {
          view.dispatch({
            effects: setHoveredRef.of(null),
          });
        }
      },
    },
  }
);

/**
 * Декорация для подсветки ref как ссылки при Ctrl+hover
 */
const refLinkMark = Decoration.mark({ class: 'cm-ref-link' });

/**
 * ViewPlugin для отображения декорации hover ref
 */
const refLinkDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // Обновляем декорации при изменении hover состояния
      const oldHover = update.startState.field(hoveredRefField);
      const newHover = update.state.field(hoveredRefField);

      if (oldHover !== newHover || update.docChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const hoveredRef = view.state.field(hoveredRefField);

      if (hoveredRef) {
        builder.add(hoveredRef.from, hoveredRef.to, refLinkMark);
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/**
 * Расширение для навигации по ссылкам через Ctrl+Click
 */
export const dslClickToNavigate = [
  hoveredRefField,
  clickToNavigatePlugin,
  refLinkDecorations,
];
