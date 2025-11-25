import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { dslSupport } from './dsl-support';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isLoading = useRef(false);

  useEffect(() => {
    if (!editorRef.current) return;

    // Создаём состояние редактора
    const startState = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        ...dslSupport,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isLoading.current) {
            const newValue = update.state.doc.toString();
            onChange(newValue);
          }
        }),
        // Стилизация редактора
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
          },
          '.cm-scroller': {
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            overflow: 'auto',
          },
          '.cm-content': {
            padding: '8px 0',
            caretColor: 'hsl(var(--foreground))',
          },
          '.cm-line': {
            padding: '0 8px',
          },
          '&.cm-focused': {
            outline: 'none',
          },
          '.cm-gutters': {
            backgroundColor: 'hsl(var(--muted))',
            color: 'hsl(var(--muted-foreground))',
            border: 'none',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'hsl(var(--accent))',
          },
          '.cm-activeLine': {
            backgroundColor: 'hsl(var(--accent) / 0.1)',
          },
          '.cm-selectionMatch': {
            backgroundColor: 'hsl(var(--accent) / 0.3)',
          },
          '.cm-cursor': {
            borderLeftColor: 'hsl(var(--foreground))',
          },
        }),
        // Синтаксическая подсветка
        EditorView.theme({
          '.tok-keyword': {
            color: 'hsl(263, 70%, 50%)',
            fontWeight: 'bold',
          },
          '.tok-string': {
            color: 'hsl(119, 34%, 47%)',
          },
          '.tok-variableName': {
            color: 'hsl(221, 87%, 60%)',
          },
          '.tok-comment': {
            color: 'hsl(0, 0%, 50%)',
            fontStyle: 'italic',
          },
          '.tok-punctuation': {
            color: 'hsl(0, 0%, 40%)',
          },
          '.tok-number': {
            color: 'hsl(30, 80%, 50%)',
          },
        }),
      ],
    });

    // Создаём редактор
    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Очистка при размонтировании
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Создаём редактор только один раз

  // Обновляем содержимое редактора при изменении value извне
  useEffect(() => {
    if (!viewRef.current) return;

    const currentValue = viewRef.current.state.doc.toString();
    if (currentValue !== value) {
      // Блокируем вызов onChange во время программного обновления
      isLoading.current = true;
      try {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value,
          },
        });
      } finally {
        // Сбрасываем флаг после завершения обновления
        isLoading.current = false;
      }
    }
  }, [value]);

  return (
    <div
      ref={editorRef}
      className="flex-1 w-full h-full overflow-hidden"
    />
  );
};

