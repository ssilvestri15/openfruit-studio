import { useTranslation } from '../localization';
import { useEffect, useRef, useState } from 'react';
import { X, AppWindow, Shield, Package, Hammer, Save } from 'lucide-react';
import { defaultProjectSettings, validateProjectSettings, type ProjectSettings, type ProjectSettingsBridge } from '../../shared/projectSettings';
import type { FileBridge, FileSnapshot } from '../../shared/files';

type Manifest = FileSnapshot & { draft: string };
export function ProjectSettingsDialog({ root, name, onClose, onSaved }: {
  root: string; name: string; onClose: () => void; onSaved: (paths: string[]) => void;
}) {
  const t = useTranslation();
  const api = (window as unknown as { openfruitApi: ProjectSettingsBridge & FileBridge }).openfruitApi;
  const [section, setSection] = useState('general');
  const [settings, setSettings] = useState<ProjectSettings>(defaultProjectSettings);
  const [baseline, setBaseline] = useState<ProjectSettings>(defaultProjectSettings);
  const [revision, setRevision] = useState<string | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [manifests, setManifests] = useState<Record<string, Manifest>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const alive = useRef(true), saving = useRef(false);
  const dirty = JSON.stringify(settings) !== JSON.stringify(baseline) || Object.values(manifests).some(file => file.draft !== file.content);
  const close = () => { if (!saving.current && (!dirty || confirm(t("Chiudere la configurazione e scartare le modifiche non salvate?")))) onClose(); };
  const actions = useRef({ close, save: () => {} });
  useEffect(() => {
    alive.current = true;
    let current = true;
    api.readProjectSettings(root).then(snapshot => {
      if (!current) return;
      setSettings(snapshot.settings); setBaseline(snapshot.settings); setRevision(snapshot.revision);
      setPaths(snapshot.manifests); setSelected(snapshot.manifests[0] || '');
    }).catch(error => { if (current) setError(error.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; alive.current = false; };
  }, [root]);
  useEffect(() => {
    if (section !== 'dependencies' || !selected || manifests[selected]) return;
    let current = true;
    api.readFileSnapshot(selected).then(file => {
      if (current) setManifests(previous => ({ ...previous, [selected]: { ...file, draft: file.content } }));
    }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [section, selected, !!manifests[selected]]);
  const save = async () => {
    if (loading || saving.current) return;
    saving.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const valid = validateProjectSettings(settings);
      for (const [path, file] of Object.entries(manifests)) if (file.draft !== file.content) {
        const result = await api.saveFile(path, file.draft, file.revision);
        if (!result.success || !result.revision) throw new Error(`${path.split(/[\\/]/).at(-1)}: ${result.error || t("salvataggio fallito")}. ${t("Le modifiche restano in questa schermata.")}`);
        if (alive.current) setManifests(previous => ({ ...previous, [path]: { content: file.draft, draft: file.draft, revision: result.revision! } }));
      }
      const result = await api.saveProjectSettings(root, valid, revision);
      if (!alive.current) return;
      setSettings(result.settings); setBaseline(result.settings); setRevision(result.revision);
      setStatus(t("Configurazione salvata")); onSaved([...Object.entries(manifests).filter(([, file]) => file.draft !== file.content).map(([path]) => path), root + '/.openfruit-studio.json']);
    } catch (error: any) { if (alive.current) setError(error.message); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  actions.current = { close, save: () => { void save(); } };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); actions.current.close(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopImmediatePropagation(); actions.current.save(); }
      else if (event.key === 'Tab') {
        const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') || [])].filter(node => node.getClientRects().length);
        if (document.activeElement === (event.shiftKey ? focusable[0] : focusable.at(-1))) { event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus(); }
      }
    };
    window.addEventListener('keydown', keyboard, true);
    return () => { window.removeEventListener('keydown', keyboard, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  const field = (key: keyof ProjectSettings, label: string, placeholder = '', description = '') => <label className="block space-y-1.5 text-sm text-fruit-text">
    <span className="font-medium">{label}</span>
    <input aria-label={label} value={settings[key]} type={key === 'jobs' ? 'number' : 'text'} min={0} max={256}
      placeholder={placeholder} onChange={event => { setStatus(''); setSettings(previous => ({ ...previous, [key]: key === 'jobs' ? Number(event.target.value) : event.target.value })); }}
      className="w-full rounded-lg border border-fruit-border bg-fruit-editor px-3 py-2 outline-none focus:border-fruit-accent font-mono text-xs" />
    {description && <span className="block text-xs text-fruit-textDim leading-relaxed">{description}</span>}
  </label>;
  return <div className="fixed inset-0 z-[10000] bg-black/70 p-4 md:p-8 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("Configurazione progetto")} ref={dialog}>
    <div className="w-full max-w-5xl h-full max-h-[760px] rounded-2xl border border-fruit-border bg-fruit-bg shadow-2xl flex flex-col overflow-hidden">
      <header className="flex items-center justify-between p-5 border-b border-fruit-border">
        <div><p className="text-xs text-fruit-accent font-mono mb-1">{t("PROGETTO")}</p><h2 className="font-syne font-bold text-xl text-fruit-text">{name}</h2><p className="text-xs text-fruit-textDim mt-1 break-all">{root}</p></div>
        <button aria-label={t("Chiudi configurazione progetto")} onClick={close} disabled={busy} className="p-2 rounded-lg hover:bg-fruit-surface text-fruit-textMuted"><X size={18} /></button>
      </header>
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <nav aria-label={t("Sezioni configurazione")} className="flex md:flex-col gap-1 p-3 border-b md:border-b-0 md:border-r border-fruit-border md:w-48 shrink-0 overflow-auto">
          {([['general', 'Generale', AppWindow], ['signing', t("Firma e team"), Shield], ['dependencies', t("Dipendenze"), Package], ['build', 'Build', Hammer]] as const).map(([id, label, Icon]) =>
            <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left whitespace-nowrap ${section === id ? 'bg-fruit-accent/10 text-fruit-accent' : 'text-fruit-textMuted hover:bg-fruit-surface'}`}><Icon size={16} />{label}</button>)}
        </nav>
        <div className="flex-1 overflow-auto p-5 md:p-7">
          {loading ? <p role="status" className="text-fruit-textMuted">{t("Caricamento configurazione...")}</p> : <fieldset disabled={busy} className="space-y-6 min-w-0">
            {section === 'general' && <>
              <div><h3 className="text-lg font-syne font-semibold text-fruit-text">{t("Identità dell’app")}</h3><p className="text-xs text-fruit-textDim mt-1">{t("I campi vuoti mantengono i valori del progetto originale.")}</p></div>
              {field('displayName', t("Nome visualizzato"), name, t("Nome dell’app sul dispositivo."))}
              {field('bundleId', 'Bundle ID', 'com.example.app', t("Identificatore usato per la build e la firma."))}
              <div className="rounded-lg bg-fruit-surface border border-fruit-border p-3 text-xs text-fruit-textDim">{t("Le preferenze vengono salvate nel progetto in")} <span className="font-mono">.openfruit-studio.json</span>.</div>
            </>}
            {section === 'signing' && <>
              <h3 className="text-lg font-syne font-semibold text-fruit-text">{t("Firma e team")}</h3>
              {field('teamId', t("Team ID di riferimento"), 'ABCDE12345', t("Il team effettivo della firma è determinato dal certificato e dal provisioning profile. Questo campo è un riferimento del progetto."))}
              {field('certificatePath', t("Certificato P12"), 'C:\\Certificati\\developer.p12')}
              {field('provisioningProfilePath', 'Provisioning profile', 'C:\\Certificati\\app.mobileprovision', t("Lascia vuoti i percorsi per usare la configurazione di firma di OpenFruit. La password resta nelle credenziali di OpenFruit."))}
            </>}
            {section === 'dependencies' && <>
              <div><h3 className="text-lg font-syne font-semibold text-fruit-text">{t("Dipendenze")}</h3><p className="text-xs text-fruit-textDim mt-1">{t("Modifica i manifesti originali. OpenFruit li legge durante la build.")}</p></div>
              {paths.length ? <>
                <label className="block text-sm text-fruit-text">{t("Manifesto")}<select aria-label={t("Manifesto dipendenze")} value={selected} onChange={event => setSelected(event.target.value)} className="block w-full mt-2 p-2 rounded-lg bg-fruit-surface border border-fruit-border">{paths.map(path => <option key={path} value={path}>{path.slice(root.length + 1)}</option>)}</select></label>
                {manifests[selected] ? <textarea aria-label={t("Contenuto manifesto dipendenze")} spellCheck={false} value={manifests[selected].draft} onChange={event => { const draft = event.target.value; setStatus(''); setManifests(previous => ({ ...previous, [selected]: { ...previous[selected], draft } })); }} className="w-full h-64 min-h-48 resize-y p-3 bg-fruit-editor text-fruit-text rounded-lg border border-fruit-border focus:border-fruit-accent outline-none text-xs font-mono leading-relaxed" /> : <p className="text-xs text-fruit-textDim">{t("Lettura manifesto...")}</p>}
              </> : <p className="text-sm text-fruit-textMuted">{t("Nessun Package.swift, Podfile, Cartfile o progetto Xcode nella cartella aperta. Aggiungi il manifesto del gestore di dipendenze che vuoi usare.")}</p>}
            </>}
            {section === 'build' && <>
              <h3 className="text-lg font-syne font-semibold text-fruit-text">{t("Configurazione della build")}</h3>
              <label className="block text-sm text-fruit-text">{t("Configurazione")}<select aria-label={t("Configurazione build")} value={settings.configuration} onChange={event => setSettings(previous => ({ ...previous, configuration: event.target.value as 'debug' | 'release' }))} className="block w-full mt-2 p-2 rounded-lg bg-fruit-editor border border-fruit-border"><option value="debug">Debug</option><option value="release">Release</option></select></label>
              {field('sdkVersion', t("Versione SDK iOS"), t("Predefinita di OpenFruit"), t("Seleziona una versione già installata nel motore, per esempio 18 o 26."))}
              {field('jobs', t("Processi paralleli"), '', t("0 lascia a OpenFruit il rilevamento automatico."))}
            </>}
          </fieldset>}
        </div>
      </div>
      <footer className="border-t border-fruit-border px-5 py-4 flex items-center justify-between gap-4">
        <div className="text-xs min-w-0">{error ? <p role="alert" className="text-rose-300 break-words">{error}</p> : <p role="status" className="text-fruit-textDim">{status || (dirty ? t("Modifiche non salvate") : t("Configurazione del progetto"))}</p>}</div>
        <button disabled={loading || busy} onClick={() => void save()} className="flex items-center gap-2 shrink-0 bg-fruit-accent text-fruit-accentDark px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"><Save size={15} />{busy ? 'Salvataggio...' : t("Salva configurazione")}</button>
      </footer>
    </div>
  </div>;
}
