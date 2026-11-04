import { useTranslation } from '../localization';
import { ResolvedBuildSettings } from './ResolvedBuildSettings';
import { BuildSelection } from './BuildSelection';
import { XcodeStructureEditor } from './XcodeStructureEditor';
import { useEffect, useRef, useState } from 'react';
import { X, Save, Layers, Box } from 'lucide-react';
import type { XcodeOperation, BuildSetting, XcodeBridge, XcodeProjectSnapshot } from '../../shared/xcode';

type Drafts = Record<string, Record<string, BuildSetting | null>>;
export function XcodeProjectEditor({ root, projects, initialProject, onClose, onSaved }: {
  root: string; projects: string[]; initialProject?: string; onClose: () => void; onSaved: (paths: string[]) => void;
}) {
  const t = useTranslation();
  const api = (window as unknown as { openfruitApi: XcodeBridge }).openfruitApi;
  const [projectPath, setProjectPath] = useState(initialProject || projects[0]);
  const [snapshot, setSnapshot] = useState<XcodeProjectSnapshot>();
  const [ownerId, setOwnerId] = useState(''), [configurationId, setConfigurationId] = useState('');
  const [section, setSection] = useState('general'), [drafts, setDrafts] = useState<Drafts>({});
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(''), [newKey, setNewKey] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const dialog = useRef<HTMLDivElement>(null), saving = useRef(false), alive = useRef(true);
  const dirty = Object.values(drafts).some(values => Object.keys(values).length > 0);
  useEffect(() => {
    let current = true; alive.current = true; setLoading(true); setError(''); setSnapshot(undefined);
    api.readXcodeProject(projectPath).then(project => {
      if (!current) return;
      setSnapshot(project); const owner = project.targets[0] || project.project;
      setOwnerId(owner.id); setConfigurationId(owner.configurations[0]?.id || ''); setDrafts({});
    }).catch(error => { if (current) setError(error.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; alive.current = false; };
  }, [projectPath, reloadVersion]);
  const owner = [snapshot?.project, ...(snapshot?.targets || [])].find(owner => owner?.id === ownerId);
  const config = owner?.configurations.find(config => config.id === configurationId);
  const inherited = owner?.id === snapshot?.project.id ? undefined : snapshot?.project.configurations.find(c => c.name === config?.name);
  const own = (key: string) => {
    const draft = drafts[configurationId];
    return draft && Object.hasOwn(draft, key) ? draft[key] ?? undefined : config?.settings[key];
  };
  const value = (key: string) => own(key) ?? inherited?.settings[key];
  const change = (key: string, value: BuildSetting | null) => {
    setStatus(''); setDrafts(previous => {
      const next = { ...(previous[configurationId] || {}) };
      const original = config?.settings[key];
      if (JSON.stringify(value) === JSON.stringify(original) || value === null && original === undefined) delete next[key];
      else next[key] = value;
      return { ...previous, [configurationId]: next };
    });
  };
  const close = () => { if (!saving.current && (!dirty || confirm(t("Scartare le modifiche al progetto non salvate?")))) onClose(); };
  const save = async () => {
    if (!snapshot || saving.current || !dirty) return;
    const edits = Object.entries(drafts).flatMap(([configurationId, entries]) => Object.entries(entries).map(([key, value]) => ({ configurationId, key, value })));
    saving.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const project = await api.saveXcodeProject(projectPath, snapshot.revision, edits);
      if (alive.current) { setSnapshot(project); setDrafts({}); setStatus(t("Progetto salvato")); onSaved([project.file]); }
    } catch (error: any) { if (alive.current) setError(error.message); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  const mutate = async (operation: XcodeOperation) => {
    if (!snapshot || saving.current) return;
    if (dirty) { setError(t("Salva prima le modifiche alle build settings.")); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      const updated = await api.mutateXcodeProject(projectPath, snapshot.revision, operation);
      if (alive.current) { setSnapshot(updated); setStatus(t("Struttura progetto salvata."));
        const selected = [updated.project, ...updated.targets].find(t => t.id === ownerId) || updated.targets[0] || updated.project;
        setOwnerId(selected.id);
        if (!selected?.configurations.some(c => c.id === configurationId)) setConfigurationId(selected?.configurations[0]?.id || '');
        onSaved([updated.file]);
      }
    } catch (error: any) { if (alive.current) setError(error.message); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  const actions = useRef({ close, save }); actions.current = { close, save };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saving.current || dirty && !confirm(t("Chiudere l’IDE e scartare le modifiche al progetto non salvate?"))) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); actions.current.close(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopImmediatePropagation(); void actions.current.save(); }
      else if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])].filter(control => control.getClientRects().length);
        if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) { event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls[0])?.focus(); }
      }
    };
    window.addEventListener('keydown', keyboard, true);
    return () => { window.removeEventListener('keydown', keyboard, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  const inputClass = 'w-full bg-fruit-editor border border-fruit-border rounded-lg px-3 py-2 text-xs font-mono text-fruit-text outline-none focus:border-fruit-accent';
  const field = (key: string, label: string) => <label key={key} className="block space-y-1.5 text-sm text-fruit-text">
    <span>{label}</span><input aria-label={label} value={own(key) === undefined ? '' : String(own(key))} onChange={event => change(key, event.target.value)} placeholder={inherited?.settings[key] ? t("Ereditato dal progetto: {0}", [String(inherited.settings[key])]) : t("Non impostato")} className={inputClass} />
    <span className="block text-[10px] text-fruit-textDim font-mono">{key}</span>
    {own(key) !== undefined && <button type="button" onClick={() => change(key, null)} className="text-xs text-fruit-accent">{t("Rimuovi override")}</button>}
  </label>;
  const selectOwner = (id: string) => {
    const next = [snapshot?.project, ...(snapshot?.targets || [])].find(owner => owner?.id === id);
    const nextConfig = next?.configurations.find(c => c.name === config?.name) || next?.configurations[0];
    setOwnerId(id); setConfigurationId(nextConfig?.id || '');
  };
  const entries = [...new Set([...Object.keys(inherited?.settings || {}), ...Object.keys(config?.settings || {}), ...Object.keys(drafts[configurationId] || {})])].sort().filter(key => key.toLowerCase().includes(filter.toLowerCase()));
  return <div role="dialog" aria-modal="true" aria-label={t("Editor progetto Xcode")} ref={dialog} className="fixed inset-0 z-[10000] bg-black/70 p-4 md:p-7 flex items-center justify-center">
    <div className="w-full max-w-6xl h-full max-h-[850px] rounded-2xl border border-fruit-border bg-fruit-bg flex flex-col overflow-hidden shadow-2xl">
      <header className="flex items-center justify-between gap-4 p-4 border-b border-fruit-border text-fruit-text">
        <div><h2 className="font-syne font-bold text-lg">{snapshot?.name || t("Progetto Xcode")}</h2><p className="text-xs text-fruit-textDim break-all">{projectPath}</p></div>
        <div className="flex items-center gap-3"><button disabled={busy || loading} onClick={() => { if (!dirty || confirm(t("Scartare le modifiche locali e rileggere il progetto dal disco?"))) { setDrafts({}); setReloadVersion(version => version + 1); } }} className="text-xs text-fruit-textMuted">{t("Ricarica progetto")}</button><button aria-label={t("Chiudi editor progetto")} onClick={close} disabled={busy} className="p-2 hover:bg-fruit-surface rounded-lg"><X size={18} /></button></div>
      </header>
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="md:w-56 shrink-0 md:border-r border-b md:border-b-0 border-fruit-border overflow-auto p-3 text-sm text-fruit-text">
          {projects.length > 1 && <select aria-label={t("Progetto Xcode")} disabled={busy} value={projectPath} onChange={event => { if (!dirty || confirm(t("Scartare le modifiche prima di cambiare progetto?"))) setProjectPath(event.target.value); }} className={inputClass}>{projects.map(path => <option key={path} value={path}>{path.split(/[\\/]/).at(-1)}</option>)}</select>}
          {snapshot && <>
            <p className="text-[10px] tracking-widest text-fruit-textDim mt-4 mb-2">PROJECT</p>
            <button aria-pressed={ownerId === snapshot.project.id} onClick={() => selectOwner(snapshot.project.id)} className={`w-full flex gap-2 p-2 rounded-lg text-left ${ownerId === snapshot.project.id ? 'bg-fruit-accent/15 text-fruit-accent' : 'hover:bg-fruit-surface'}`}><Layers size={16} />{snapshot.project.name}</button>
            <p className="text-[10px] tracking-widest text-fruit-textDim mt-5 mb-2">TARGETS</p>
            {snapshot.targets.map(target => <button key={target.id} aria-pressed={ownerId === target.id} data-xcode-target={target.id} onClick={() => selectOwner(target.id)} className={`w-full flex gap-2 p-2 rounded-lg text-left ${ownerId === target.id ? 'bg-fruit-accent/15 text-fruit-accent' : 'hover:bg-fruit-surface'}`}><Box size={16} />{target.name}</button>)}
          </>}
        </aside>
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <nav aria-label={t("Sezioni progetto Xcode")} className="flex shrink-0 gap-1 p-3 overflow-auto border-b border-fruit-border">
            {[['general', 'General'], ['targets','Targets'], ['signing', 'Signing'], ['dependencies', 'Dependencies'], ['build', 'Build Settings'], ['phases', 'Build Phases'], ['selection', t("Build OpenFruit")], ['resolved', t("Valori risolti")]].map(([id, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)} className={`whitespace-nowrap px-3 py-2 text-xs rounded-lg ${section === id ? 'bg-fruit-accent/15 text-fruit-accent' : 'text-fruit-textMuted hover:bg-fruit-surface'}`}>{label}</button>)}
          </nav>
          <div className="overflow-auto flex-1 p-5 space-y-5 text-fruit-text">
            {loading ? <p role="status">{t("Lettura progetto...")}</p> : snapshot && <>
              <div className="flex items-center gap-3 flex-wrap"><h3 className="font-syne font-semibold">{owner?.name}</h3><label className="ml-auto text-xs text-fruit-textMuted">{t("Configurazione")} <select aria-label={t("Configurazione Xcode")} value={configurationId} disabled={busy} onChange={event => setConfigurationId(event.target.value)} className="ml-2 bg-fruit-surface border border-fruit-border rounded px-2 py-1">{owner?.configurations.map(config => <option key={config.id} value={config.id}>{config.name}</option>)}</select></label></div>
              <p className="text-xs text-fruit-textDim">{t("Valori del progetto originale ·")} {config?.name || t("Nessuna configurazione")}{config?.baseConfiguration ? ` · Base: ${config.baseConfiguration}` : ''}{t(". Le definizioni originali sono modificabili qui; la sezione Valori risolti mostra include e variabili supportati.")}</p>
              <fieldset disabled={busy || !config} className="space-y-5 min-w-0">
                {section === 'resolved' && <ResolvedBuildSettings project={projectPath} ownerId={ownerId} configurationId={configurationId} revision={snapshot.revision} />}
                {section === 'selection' && <BuildSelection root={root} />}
                {section === 'general' && <div className="grid gap-5 md:grid-cols-2">{field('PRODUCT_BUNDLE_IDENTIFIER', 'Bundle ID')}{field('PRODUCT_NAME', 'Product Name')}{field('INFOPLIST_KEY_CFBundleDisplayName', 'Display Name')}{field('IPHONEOS_DEPLOYMENT_TARGET', 'Minimum iOS')}{field('MARKETING_VERSION', 'Version')}{field('CURRENT_PROJECT_VERSION', 'Build')}</div>}
                {section === 'signing' && <div className="grid gap-5 md:grid-cols-2">{field('DEVELOPMENT_TEAM', 'Development Team')}{field('CODE_SIGN_STYLE', 'Signing Style')}{field('CODE_SIGN_IDENTITY', 'Signing Certificate')}{field('PROVISIONING_PROFILE_SPECIFIER', 'Provisioning Profile')}{field('CODE_SIGN_ENTITLEMENTS', t("File entitlements"))}{field('INFOPLIST_FILE', 'Info.plist')}</div>}
                {section === 'build' && <>
                  <input aria-label={t("Filtra build settings")} value={filter} onChange={event => setFilter(event.target.value)} placeholder={t("Filtra impostazioni...")} className={inputClass} />
                  <div className="flex gap-2"><input aria-label={t("Nuova build setting")} value={newKey} onChange={event => setNewKey(event.target.value)} placeholder={t("NOME_IMPOSTAZIONE")} className={inputClass} /><button disabled={!newKey.trim()} onClick={() => { change(newKey.trim(), ''); setNewKey(''); }} className="px-3 border border-fruit-border rounded-lg text-xs">{t("Aggiungi")}</button></div>
                  <div className="space-y-3">{entries.map(key => <div key={key} className="grid gap-2 md:grid-cols-2 border-b border-fruit-border pb-3"><div className="font-mono text-xs break-all">{key}<p className="text-[10px] text-fruit-textDim mt-1">{own(key) === undefined ? t("Ereditato dal progetto") : t("Valore della configurazione")}</p></div><div className="space-y-1">{Array.isArray(value(key)) ? <textarea aria-label={key} value={(value(key) as string[]).join('\n')} onChange={event => change(key, event.target.value ? event.target.value.split('\n') : [])} className={inputClass} rows={3} /> : <input aria-label={key} value={value(key) || ''} onChange={event => change(key, event.target.value)} className={inputClass} />}{own(key) !== undefined && <button onClick={() => change(key, null)} className="text-xs text-fruit-accent">{t("Rimuovi override")}</button>}</div></div>)}</div>
                </>}
                {section === 'dependencies' && <div className="space-y-5"><div><h4 className="text-sm font-semibold mb-2">Target Dependencies</h4>{owner?.dependencies.length ? owner.dependencies.map((name, i) => <p key={i} className="text-sm p-2 border-b border-fruit-border">{name}</p>) : <p className="text-xs text-fruit-textDim">{t("Nessuna dipendenza tra target.")}</p>}</div><div><h4 className="text-sm font-semibold mb-2">Package Dependencies</h4>{owner?.packages.length ? owner.packages.map((name, i) => <p key={i} className="text-xs font-mono p-2 border-b border-fruit-border break-all">{name}</p>) : <p className="text-xs text-fruit-textDim">{t("Nessun pacchetto associato alla selezione.")}</p>}</div><p className="text-xs text-fruit-textDim">{t("Elenco letto dai riferimenti del progetto. Usa i controlli sottostanti per modificare i riferimenti.")}</p></div>}
                {section === 'phases' && <div className="space-y-3">{owner?.phases.length ? owner.phases.map(phase => <details key={phase.id} open className="border border-fruit-border rounded-lg p-3"><summary className="text-sm cursor-pointer font-semibold">{phase.name} <span className="text-fruit-textDim">({phase.files.length})</span></summary><ul className="text-xs text-fruit-textMuted font-mono mt-3 space-y-2">{phase.files.map((file, i) => <li key={i} className="break-all">{file}</li>)}</ul></details>) : <p className="text-xs text-fruit-textDim">{t("Nessuna build phase per la selezione.")}</p>}<p className="text-xs text-fruit-textDim">{t("I file delle fasi sono elencati sopra; script e fasi sono gestiti sotto.")}</p></div>}
              </fieldset>
              {['dependencies','phases','build','targets'].includes(section) && <XcodeStructureEditor key={ownerId+section} snapshot={snapshot} ownerId={ownerId} configurationId={configurationId} section={section} disabled={busy || dirty} onMutate={mutate} />}
            </>}
          </div>
        </main>
      </div>
      <footer className="border-t border-fruit-border p-4 flex justify-between items-center gap-3"><p role={error ? 'alert' : 'status'} className={`text-xs ${error ? 'text-rose-300' : 'text-fruit-textDim'}`}>{error || status || (dirty ? t("Modifiche non salvate nel progetto") : t("Impostazioni del progetto Xcode"))}</p><button disabled={busy || loading || !dirty} onClick={() => void save()} className="flex gap-2 items-center bg-fruit-accent text-fruit-accentDark px-4 py-2 rounded-lg text-sm disabled:opacity-40"><Save size={15} />{busy ? 'Salvataggio...' : t("Salva progetto")}</button></footer>
    </div>
  </div>;
}
