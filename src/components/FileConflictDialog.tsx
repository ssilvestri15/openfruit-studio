import { useTranslation } from '../localization';
import { assertMergeResolved } from '../utils/merge';
import { useEffect, useRef } from 'react';
import type { DiffOnMount } from '@monaco-editor/react';
import { SafeDiffEditor } from './SafeDiffEditor';
import type { TabItem } from '../types';
import type { FileConflict } from '../../shared/files';
import '../utils/monaco';

export function FileConflictDialog(props: {
  tab: TabItem; conflict: FileConflict; busy: boolean;
  onEdit: (text: string) => void; onClose: () => void; onSave: () => void;
}) {
  const t = useTranslation();
  let unresolved = false;
  try { assertMergeResolved(props.tab); } catch { unresolved = true; }
  const subscription = useRef<{ dispose: () => void }>();
  const container = useRef<HTMLDivElement>(null);
  const actions = useRef(props); actions.current = props;
  const onEdit = useRef(props.onEdit); onEdit.current = props.onEdit;
  useEffect(() => () => subscription.current?.dispose(), []);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); actions.current.onClose(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!actions.current.busy && actions.current.conflict.disk) actions.current.onSave();
      } else if (event.key === 'Tab') {
        const focusable = [...(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input, [tabindex="0"]') || [])].filter(node => node.getClientRects().length);
        const target = event.shiftKey ? focusable.at(-1) : focusable[0];
        if (document.activeElement === (event.shiftKey ? focusable[0] : focusable.at(-1))) { event.preventDefault(); target?.focus(); }
      }
    };
    window.addEventListener('keydown', keyboard, true);
    return () => {
      window.removeEventListener('keydown', keyboard, true);
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLElement>('main .monaco-editor textarea')?.focus();
    };
  }, []);
  const mount: DiffOnMount = editor => {
    subscription.current?.dispose();
    const modified = editor.getModifiedEditor();
    subscription.current = modified.onDidChangeModelContent(() => onEdit.current(modified.getValue()));
    modified.focus();
  };
  const model = 'inmemory:///conflict/' + encodeURIComponent(props.tab.id);
  return <div ref={container} className="fixed inset-0 z-[10000] p-5 bg-black/80 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("Confronto del conflitto")}>
    <div className="w-full h-full max-w-6xl bg-fruit-bg border border-fruit-border rounded-xl flex flex-col overflow-hidden">
      <div className="p-3 flex justify-between items-center text-fruit-text text-sm">
        <span>{props.tab.name} {t("— riconcilia le differenze modificando la colonna destra")}</span>
        <button onClick={props.onClose} className="px-3 py-1 border rounded">{t("Chiudi confronto")}</button>
      </div>
      <p role="status" className="px-3 py-2 text-xs text-amber-200">{props.conflict.message}</p>
      <div className="grid grid-cols-2 px-3 py-2 text-xs text-fruit-textMuted border-y border-fruit-border"><span>{t("Versione sul disco")}</span><span>{t("Le tue modifiche — modificabile")}</span></div>
      <div className="flex-1 min-h-0">
        <SafeDiffEditor original={props.conflict.disk?.content || ''} modified={props.tab.content}
          originalModelPath={model + '/disk'} modifiedModelPath={model + '/editor'}
          language={props.tab.name.endsWith('.swift') ? 'swift' : 'plaintext'} theme="openfruit-dark" onMount={mount}
          options={{ readOnly: props.busy, originalEditable: false, automaticLayout: true, renderSideBySide: true, minimap: { enabled: false } }} />
      </div>
      <div className="p-3 flex justify-between items-center gap-3 text-xs text-fruit-text">
        <span>{props.conflict.disk ? t("Il salvataggio verifica che la versione sul disco non sia cambiata di nuovo.") : t("File sul disco non disponibile: chiudi il confronto e salva una copia.")}</span>
        <button disabled={props.busy || !props.conflict.disk || unresolved} onClick={props.onSave} className="px-3 py-2 rounded bg-fruit-accent text-fruit-accentDark disabled:opacity-40">{t("Salva la versione a destra")}</button>
      </div>
    </div>
  </div>;
}
