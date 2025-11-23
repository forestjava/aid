import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { dslSupport } from './dsl-support';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  readOnly = false
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!editorRef.current) return;

    // Создаём состояние редактора
    const startState = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        ...dslSupport,
        EditorView.lineWrapping, // Перенос строк
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !readOnly) {
            const newValue = update.state.doc.toString();
            onChange(newValue);
          }
        }),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
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
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // Обновляем режим readOnly
  useEffect(() => {
    if (!viewRef.current) return;

    viewRef.current.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly)
      ),
    });
  }, [readOnly]);

  return (
    <div
      ref={editorRef}
      className="flex-1 w-full h-full overflow-hidden"
    />
  );
};

