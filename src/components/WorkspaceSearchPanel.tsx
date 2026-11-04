import { useTranslation } from '../localization';
import {VirtualList} from './VirtualList';
import { useEffect, useRef, useState } from 'react';
import type { SearchMatch, SearchResult, SearchReplacement } from '../../shared/search';
export function WorkspaceSearchPanel({ root, onClose, onSelect, hasDirtyFiles }: {
  root: string; onClose: () => void; onSelect: (match: SearchMatch) => void; hasDirtyFiles: boolean;
}) {
  const t = useTranslation();
  const api = (window as any).openfruitApi;
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('');
  const [regex, setRegex] = useState(false), [caseSensitive, setCase] = useState(false), [wholeWord, setWhole] = useState(false);
  const [result, setResult] = useState<SearchResult>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current++; api?.cancelWorkspaceSearch(); }; }, [root]);
  const search = async () => {
    const request = ++generation.current; setBusy(true); setError('');
    try { const result = await api.searchWorkspace({ root, query, regex, caseSensitive, wholeWord }); if (active.current && request === generation.current) setResult(result); }
    catch (error: any) { if (active.current && request === generation.current) setError(error.message); }
    finally { if (active.current && request === generation.current) setBusy(false); }
  };
  const replace = async () => {
    if (!result || !confirm(t("Sostituire {0} occorrenze nei file sul disco?", [result.matches.length]))) return;
    const files = new Map<string, SearchReplacement>();
    for (const match of result.matches) {
      if (!files.has(match.path)) files.set(match.path, { path: match.path, revision: match.revision, matches: [] });
      files.get(match.path)!.matches.push({ start: match.start, end: match.end });
    }
    setBusy(true); setError('');
    try { await api.replaceWorkspaceMatches([...files.values()], replacement); if (active.current) await search(); }
    catch (error: any) { if (active.current) setError(error.message); }
    finally { if (active.current) setBusy(false); }
  };
  const invalidate = () => { generation.current++; api.cancelWorkspaceSearch(); setBusy(false); setResult(undefined); };
  const input = 'bg-fruit-editor border border-fruit-border rounded px-2 py-1.5 text-xs w-full text-fruit-text';
  return <aside className="w-80 shrink-0 border-r border-fruit-border flex flex-col min-h-0 bg-fruit-bg text-fruit-text">
    <header className="p-3 flex justify-between items-center text-sm"><strong>{t("Cerca nel progetto")}</strong><button aria-label={t("Torna ai file")} onClick={onClose}>×</button></header>
    <form onSubmit={event => { event.preventDefault(); void search(); }} className="p-3 space-y-2 border-b border-fruit-border">
      <input autoFocus aria-label={t("Cerca nel workspace")} placeholder={t("Testo o espressione regolare")} value={query} onChange={event => { setQuery(event.target.value); invalidate(); }} className={input} />
      <div className="flex gap-3 text-xs"><label><input type="checkbox" checked={caseSensitive} onChange={event => { setCase(event.target.checked); invalidate(); }} /> Aa</label><label><input type="checkbox" checked={wholeWord} onChange={event => { setWhole(event.target.checked); invalidate(); }} /> {t("Parola")}</label><label><input type="checkbox" checked={regex} onChange={event => { setRegex(event.target.checked); invalidate(); }} /> Regex</label></div>
      <button disabled={!query || busy} className="text-xs text-fruit-accent disabled:opacity-40">{t("Cerca")}</button>{busy && <button type="button" onClick={() => api.cancelWorkspaceSearch()} className="ml-3 text-xs">{t("Interrompi")}</button>}
      <input aria-label={t("Sostituisci nel workspace")} placeholder={t("Testo sostitutivo letterale")} value={replacement} onChange={event => setReplacement(event.target.value)} className={input} />
      <button type="button" disabled={busy || !result?.matches.length || result.truncated || hasDirtyFiles} onClick={() => void replace()} className="text-xs text-fruit-accent disabled:opacity-40">{t("Sostituisci risultati")}</button>
      {hasDirtyFiles && <p className="text-[10px] text-fruit-textDim">{t("Salva le modifiche aperte prima di sostituire sul disco.")}</p>}
    </form>
    {error && <p role="alert" className="p-3 text-xs text-rose-300">{error}</p>}
    {result && <p role="status" className="p-3 text-xs text-fruit-textDim">{result.matches.length} {t("risultati ·")} {result.scanned} file{result.truncated ? t(" · Risultati limitati: restringi la ricerca") : ''}</p>}
    <VirtualList items={result?.matches || []} rowHeight={58} render={(match, index) => <button key={index} onClick={() => onSelect(match)} className="block h-full w-full p-2 text-left border-b border-fruit-border hover:bg-fruit-surface"><span className="block text-[10px] text-fruit-accent truncate">{match.path.slice(root.length + 1)}:{match.line}:{match.column}</span><span className="block text-xs font-mono truncate">{match.text}</span></button>} />
  </aside>;
}
