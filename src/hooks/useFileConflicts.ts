import { useTranslation } from '../localization';
import { assertMergeResolved } from '../utils/merge';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { FileBridge, FileConflict, SaveFileResult } from '../../shared/files';
import type { TabItem } from '../types';
import type { WorkspaceRequests } from '../utils/workspaceRequests';
import { markSaved } from '../utils/editorState';
import { reloadUnchanged, siblingCopyPath } from '../utils/fileConflicts';

export function useFileConflicts(options: {
  tabs: TabItem[]; setTabs: Dispatch<SetStateAction<TabItem[]>>;
  requests: WorkspaceRequests;
  reportError: (error: unknown) => void;
  reportSavedCopy: (path: string) => void;
  refresh: () => Promise<void>;
}) {
  const t = useTranslation();
  const [conflicts, setConflicts] = useState<Record<string, FileConflict>>({});
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const pending = useRef(new Set<string>());
  const currentTabs = useRef(options.tabs); currentTabs.current = options.tabs;
  const clear = (id: string) => {
    setConflicts(previous => { if (!previous[id]) return previous; const next = { ...previous }; delete next[id]; return next; });
    setComparisonId(current => current === id ? null : current);
  };
  const record = (tab: TabItem, result: SaveFileResult) => {
    if (result.success) clear(tab.id);
    else if (result.conflict) setConflicts(previous => ({ ...previous, [tab.id]: {
      disk: result.disk || null, message: result.error || t("Conflitto con il file sul disco")
    } }));
    else setConflicts(previous => previous[tab.id] ? { ...previous, [tab.id]: {
      ...previous[tab.id], message: result.error || t("Salvataggio fallito: le modifiche sono conservate nell’editor")
    } } : previous);
  };
  useEffect(() => {
    const open = new Set(options.tabs.map(tab => tab.id));
    setConflicts(previous => {
      const entries = Object.entries(previous).filter(([id]) => open.has(id));
      return entries.length === Object.keys(previous).length ? previous : Object.fromEntries(entries);
    });
    setComparisonId(current => current && !open.has(current) ? null : current);
  }, [options.tabs]);

  const run = async (id: string, action: (tab: TabItem, api: FileBridge, current: () => boolean) => Promise<void>) => {
    const tab = currentTabs.current.find(tab => tab.id === id);
    if (!tab || pending.current.has(id)) return;
    const api = (window as unknown as { openfruitApi?: FileBridge }).openfruitApi;
    if (!api) return;
    const current = options.requests.ticket('resolve-file-' + id);
    pending.current.add(id); setBusy(previous => ({ ...previous, [id]: true }));
    try { await action(tab, api, () => current() && currentTabs.current.some(t => t.id === tab.id && t.path === tab.path)); }
    catch (error) { if (current()) options.reportError(error); }
    finally {
      pending.current.delete(id);
      setBusy(previous => { const next = { ...previous }; delete next[id]; return next; });
    }
  };
  const compare = (id: string) => run(id, async (tab, api, current) => {
    const disk = await api.readFileSnapshot(tab.path).catch(() => null);
    if (!current()) return;
    setConflicts(previous => ({ ...previous, [id]: { disk, message: disk ? t("Confronta la versione sul disco con le tue modifiche") : t("File sul disco non disponibile: puoi salvare una copia") } }));
    setComparisonId(id);
  });
  const reload = (id: string) => run(id, async (tab, api, current) => {
    const disk = await api.readFileSnapshot(tab.path);
    if (!current()) return;
    if (currentTabs.current.find(t => t.id === id)?.content !== tab.content) throw new Error(t("Il contenuto è cambiato durante la lettura: ricaricamento annullato"));
    options.setTabs(previous => reloadUnchanged(previous, tab, disk));
    clear(id);
  });
  const saveCopy = (id: string, name: string) => run(id, async (tab, api, current) => {
    const target = siblingCopyPath(tab.path, name);
    const result = await api.createFile(target, tab.content);
    if (!result.success) throw new Error(result.error || t("Salvataggio della copia fallito"));
    if (!current()) return;
    options.reportSavedCopy(target);
    await options.refresh();
  });
  const autoMerge = (id: string) => run(id, async (tab, api, current) => {
    if (tab.baseContent === undefined || !tab.revision) throw new Error(t("Versione originale non disponibile: usa il confronto manuale"));
    assertMergeResolved(tab);
    const result = await api.mergeFile(tab.path, tab.baseContent, tab.revision, tab.content);
    if (!current()) return;
    if (currentTabs.current.find(t => t.id === id)?.content !== tab.content) throw new Error(t("Il contenuto è cambiato durante il merge: riprova"));
    options.setTabs(previous => previous.map(t => t.id === id && t.content === tab.content ? {
      ...t, content: result.content, baseContent: result.disk.content, revision: result.disk.revision,
      unresolvedMerge: result.conflicts > 0, isDirty: true
    } : t));
    setConflicts(previous => ({ ...previous, [id]: { disk: result.disk,
      message: result.conflicts ? 'Modifiche sovrapposte: risolvi i marcatori <<<<<<<, |||||||, ======= e >>>>>>> nella colonna destra.' : t("Merge completato. Controlla il risultato e salva la versione a destra.")
    } }));
    setComparisonId(id);
  });
  const saveReconciled = (id: string) => run(id, async (tab, api, current) => {
    assertMergeResolved(tab);
    const disk = conflicts[id]?.disk;
    if (!disk) throw new Error(t("Versione sul disco non disponibile: salva una copia"));
    const result = await api.saveFile(tab.path, tab.content, disk.revision);
    if (!current()) return;
    record(tab, result);
    if (!result.success) throw new Error(result.error || 'Salvataggio fallito');
    options.setTabs(previous => markSaved(previous, [{ ...tab, revision: result.revision }]));
    await options.refresh();
  });
  return { conflicts, comparisonId, closeComparison: () => setComparisonId(null), busy, record, compare, autoMerge, reload, saveCopy, saveReconciled,
    reset: () => { setConflicts({}); setComparisonId(null); } };
}
