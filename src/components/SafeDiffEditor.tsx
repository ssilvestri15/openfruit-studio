import { useEffect, useRef } from 'react';
import { DiffEditor, type DiffEditorProps, type DiffOnMount, type MonacoDiffEditor } from '@monaco-editor/react';

// Model identities stay fixed during a mount; callers key the component by document.
export function SafeDiffEditor(props: Omit<DiffEditorProps, 'keepCurrentOriginalModel' | 'keepCurrentModifiedModel'>) {
  const state = useRef<{ editor: MonacoDiffEditor; models: NonNullable<ReturnType<MonacoDiffEditor['getModel']>>; disposed: boolean }>();
  const onMount = useRef(props.onMount); onMount.current = props.onMount;
  useEffect(() => () => {
    const current = state.current;
    if (!current) return;
    // The upstream React wrapper otherwise disposes models before detaching them.
    if (!current.disposed) current.editor.setModel(null);
    // Monaco releases the previous diff view-model in a zero-delay timer. Let
    // that cancel its worker request before removing the underlying text models.
    setTimeout(() => { current.models.original.dispose(); current.models.modified.dispose(); }, 0);
  }, []);
  const mount: DiffOnMount = (editor, monaco) => {
    const current = { editor, models: editor.getModel()!, disposed: false };
    state.current = current;
    editor.onDidDispose(() => { current.disposed = true; });
    onMount.current?.(editor, monaco);
  };
  return <DiffEditor {...props} keepCurrentOriginalModel keepCurrentModifiedModel onMount={mount} />;
}
