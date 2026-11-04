import { useTranslation } from '../localization';
import { useEffect, useRef, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import type { OpenFruitDevice } from '../types';
import type { Preferences } from '../../shared/preferences';
import type { EnvironmentAction, EnvironmentSnapshot } from '../../shared/environment';
import { useDialog } from '../hooks/useDialog';
import { StudioUpdateSettings } from './StudioUpdateSettings';

interface Props {
  isOpen: boolean; onClose: () => void;
  preferences: Preferences; onSavePreferences: (value: Preferences) => Promise<void>;
  devices: OpenFruitDevice[]; onRefreshDevices: () => Promise<void>; onEnvironmentChanged: (value: EnvironmentSnapshot) => void;
}
export function SettingsModal(props: Props) {
  const t = useTranslation();
  const api = (window as any).openfruitApi;
  const [tab, setTab] = useState('environment'), [environment, setEnvironment] = useState<EnvironmentSnapshot>();
  const [baseline,setBaseline]=useState(props.preferences);
  const opened=useRef(false);
  const [draft, setDraft] = useState(props.preferences), [error, setError] = useState(''), [output, setOutput] = useState('');
  const [job, setJob] = useState(''), [loading, setLoading] = useState(false), [xcodeVersion, setXcodeVersion] = useState('');
  const [deviceUdid,setDeviceUdid]=useState(''),[wifiHost,setWifiHost]=useState(''),[recordDuration,setRecordDuration]=useState(10);
  const [gitName, setGitName] = useState(''), [gitEmail, setGitEmail] = useState('');
  const container = useRef<HTMLDivElement>(null), current = useRef(true), running = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const close = () => { if (!running.current && (!dirty || confirm(t("Scartare le preferenze non salvate?")))) props.onClose(); };
  useDialog(props.isOpen, container, close);
  useEffect(() => {
    if(!props.isOpen){opened.current=false;return;}
    if(!opened.current || !dirty || JSON.stringify(draft)===JSON.stringify(props.preferences)){setDraft(props.preferences);setBaseline(props.preferences);}
    else setError(t("Preferenze cambiate in un’altra finestra. La bozza è conservata: Salva preferenze applicherà i tuoi valori."));
    opened.current=true;
  }, [props.isOpen, props.preferences]);
  const refresh = async () => {
    setLoading(true); setError('');
    try {
      if (!api?.getEnvironment) throw new Error(t("Impostazioni disponibili nell’app desktop"));
      const snapshot: EnvironmentSnapshot = await api.getEnvironment();
      if (current.current) { setEnvironment(snapshot); setGitName(snapshot.git.name); setGitEmail(snapshot.git.email); props.onEnvironmentChanged(snapshot); }
    } catch (error: any) { if (current.current) setError(error.message); }
    finally { if (current.current) setLoading(false); }
  };
  useEffect(() => {
    current.current = true;
    if (!props.isOpen) return;
    void refresh();
    const unsubscribe = api?.onOpenFruitOutput((event: any) => {
      if (event.requestId?.startsWith('environment-')) setOutput(previous => (previous + event.text + '\n').slice(-100000));
    });
    return () => { current.current = false; unsubscribe?.(); };
  }, [props.isOpen]);
  const run = async (action: EnvironmentAction, value?: string) => {
    if (running.current) return;
    if (action === 'sdk-remove' && !confirm(t("Rimuovere la registrazione e gli SDK gestiti della versione {0}?", [value]))) return;
    if (action === 'sdk-download' && !confirm(t("Scaricare e installare l’SDK da Xcode {0}?", [value]))) return;
    running.current = true; setJob(action); setOutput(''); setError('');
    try {
      const result = await api.environmentAction(action, value);
      if (current.current) {
        if (!result.success && !result.cancelled) throw new Error(result.stderr || result.error || t("Operazione fallita"));
        setOutput(previous => previous || result.output || (result.cancelled ? t("Operazione interrotta") : t("Operazione completata")));
        await refresh();
      }
    } catch (error: any) { if (current.current) setError(error.message); }
    finally { running.current = false; if (current.current) setJob(''); }
  };
  const device = async (action: import('../../shared/device').DeviceAction) => {
    if(running.current||!deviceUdid)return;
    if(action==='install'&&!confirm(t("Selezionare un IPA firmato e installarlo sul dispositivo scelto?")))return;
    running.current=true;setJob('device-'+action);setError('');setOutput('');
    try{const result=await api.deviceAction({action,udid:deviceUdid,wifiHost,duration:recordDuration});if(current.current){if(!result.success&&!result.cancelled)throw new Error(result.stderr||result.error||t("Operazione dispositivo fallita"));setOutput(previous=>previous||result.output||t("Operazione terminata"));if(result.file)setOutput(previous=>previous+'\nOutput: '+result.file);}}
    catch(error:any){if(current.current)setError(error.message);}
    finally{running.current=false;if(current.current)setJob('');}
  };
  if (!props.isOpen) return null;
  const control = 'w-full rounded-lg border border-fruit-border bg-fruit-editor px-3 py-2 text-xs text-fruit-text';
  const button = 'px-3 py-2 rounded-lg border border-fruit-border text-xs disabled:opacity-40 hover:bg-fruit-surface';
  const number = (key: 'fontSize' | 'tabSize' | 'autoSaveDelay' | 'terminalFontSize' | 'terminalScrollback', label: string, min: number, max: number) => <label className="block text-sm space-y-2">{label}<input aria-label={label} type="number" min={min} max={max} value={draft[key]} onChange={event => setDraft(previous => ({ ...previous, [key]: Number(event.target.value) }))} className={control} /></label>;
  return <div ref={container} role="dialog" aria-modal="true" aria-label={t("Impostazioni IDE")} className="fixed inset-0 z-[10000] bg-black/70 p-6 flex items-center justify-center">
    <div className="max-w-5xl w-full h-full max-h-[800px] rounded-2xl border border-fruit-border bg-fruit-bg text-fruit-text flex flex-col overflow-hidden">
      <header className="p-5 border-b border-fruit-border flex items-center justify-between"><h2 className="font-syne text-xl font-bold">{t("Impostazioni")}</h2><button aria-label={t("Chiudi impostazioni")} disabled={!!job} onClick={close}><X size={18} /></button></header>
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <nav className="p-3 md:w-48 md:border-r border-fruit-border flex md:flex-col gap-1 overflow-auto">{[['general',t("Generali")],['updates',t("Aggiornamenti")],['environment',t("Ambiente")],['sdk','SDK'],['editor','Editor'],['terminal',t("Terminale")],['devices',t("Dispositivi")],['git','Git'],['help',t("Guida")]].map(([id,label]) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`px-3 py-2 text-sm rounded-lg text-left whitespace-nowrap ${tab === id ? 'text-fruit-accent bg-fruit-accent/10' : 'hover:bg-fruit-surface'}`}>{label}</button>)}</nav>
        <section className="flex-1 p-6 overflow-auto space-y-5">
          {tab === 'updates' && <StudioUpdateSettings key={props.preferences.updateChannel}
            preference={draft.updateChannel} savedPreference={props.preferences.updateChannel}
            onChannelChange={updateChannel => setDraft(previous => ({ ...previous, updateChannel }))} />}
          {tab === 'general' && <label className="block max-w-sm space-y-2 text-sm">
            {t("Lingua")}
            <select className={control} value={draft.language}
              onChange={event => setDraft(previous => ({ ...previous, language: event.target.value === 'en' ? 'en' : 'it' }))}>
              <option value="en" lang="en">English</option>
              <option value="it" lang="it">Italiano</option>
            </select>
          </label>}
          {(tab === 'environment' || tab === 'sdk' || tab === 'git') && <button className={button} disabled={loading || !!job} onClick={() => void refresh()}><RefreshCw size={13} className="inline mr-2" />{loading ? t("Lettura...") : t("Aggiorna dal sistema")}</button>}
          {tab === 'environment' && <><h3 className="font-bold">{t("Ambiente OpenFruit")}</h3>{environment && <dl className="text-xs space-y-3 font-mono"><dt>CLI</dt><dd className="break-all">{environment.cliPath}</dd><dt>{t("Home gestita")}</dt><dd className="break-all">{environment.home}</dd><dt>{t("Cache predefinita")}</dt><dd className="break-all">{environment.cachePath}</dd></dl>}<div className="flex flex-wrap gap-2"><button className={button} disabled={!!job} onClick={() => void run('doctor')}>{t("Verifica ambiente")}</button><button className={button} disabled={!!job} onClick={() => void run('cache-status')}>{t("Stato cache")}</button><button className={button} disabled={!!job} onClick={() => void run('auth-login')}>{t("Accedi ad Apple Developer")}</button></div><p className="text-xs text-fruit-textDim">{t("Le credenziali e la configurazione della toolchain sono gestite da OpenFruit. L’accesso Apple richiede il browser e l’interazione dell’utente.")}</p></>}
          {tab === 'sdk' && <><h3 className="font-bold">{t("SDK registrati nel motore")}</h3>{environment?.sdks.length === 0 && <p className="text-sm">{t("Nessun SDK registrato.")}</p>}{environment?.sdks.map(sdk => <article key={sdk.version} className="border border-fruit-border rounded-lg p-3 space-y-2"><div className="flex gap-3 items-center text-sm"><strong>iOS {sdk.version}</strong>{sdk.selected && <span className="text-fruit-accent">{t("Selezionato")}</span>}<span className="text-xs text-fruit-textDim">{sdk.usable ? t("Layout presente") : t("Layout incompleto")}</span></div><p className="text-xs font-mono break-all text-fruit-textMuted">{sdk.path}</p><div className="flex gap-2"><button className={button} disabled={!!job || !sdk.usable || sdk.selected} onClick={() => void run('sdk-select', sdk.version)}>{t("Usa SDK")}</button><button className={button} disabled={!!job || sdk.selected} onClick={() => void run('sdk-remove', sdk.version)}>{t("Rimuovi")}</button></div></article>)}<p className="text-xs text-fruit-textDim">{t("Inventario del layout sul disco; non certifica una build. La selezione e la rimozione vengono validate dal motore.")}</p><button className={button} disabled={!!job} onClick={() => void run('sdk-catalog')}>{t("Leggi catalogo Apple")}</button><div className="flex gap-2"><input aria-label={t("Versione Xcode da scaricare")} placeholder={t("Versione Xcode, es. 26.2")} value={xcodeVersion} onChange={event => setXcodeVersion(event.target.value)} className={control} /><button className={button} disabled={!!job || !/^\d+(?:\.\d+){0,2}$/.test(xcodeVersion)} onClick={() => void run('sdk-download', xcodeVersion)}>{t("Scarica SDK")}</button></div></>}
          {tab === 'editor' && <div className="grid md:grid-cols-2 gap-5"><label>{t("Tema")}<select aria-label={t("Tema IDE")} className={control} value={draft.theme} onChange={e=>setDraft(previous=>({...previous,theme:e.target.value as Preferences['theme']}))}><option value="dark">{t("Scuro")}</option><option value="light">{t("Chiaro")}</option></select></label>{number('fontSize',t("Dimensione font"),9,32)}{number('tabSize',t("Spazi per tab"),1,8)}<label><input type="checkbox" checked={draft.wordWrap} onChange={event => setDraft(previous => ({ ...previous, wordWrap: event.target.checked }))} /> {t("A capo automatico")}</label><label><input type="checkbox" checked={draft.minimap} onChange={event => setDraft(previous => ({ ...previous, minimap: event.target.checked }))} /> Minimap</label><label className="space-y-2">Autosave<select aria-label="Autosave" value={draft.autoSave} onChange={event => setDraft(previous => ({ ...previous, autoSave: event.target.value as Preferences['autoSave'] }))} className={control}><option value="off">{t("Disattivato")}</option><option value="afterDelay">{t("Dopo una pausa")}</option></select></label>{number('autoSaveDelay',t("Ritardo autosave (ms)"),500,30000)}<div className="md:col-span-2 space-y-2"><h4>{t("Scorciatoie globali")}</h4><p className="text-xs text-fruit-textDim">{t("Sintassi: Ctrl+Shift+P. Lascia vuoto per disattivare. Le combinazioni duplicate vengono rifiutate.")}</p>{Object.entries(draft.keybindings).map(([action,binding])=><label key={action} className="flex gap-3 items-center text-xs"><span className="w-32">{action}</span><input aria-label={t("Scorciatoia ")+action} className={control} value={binding} onChange={e=>setDraft(p=>({...p,keybindings:{...p.keybindings,[action]:e.target.value}}))}/></label>)}</div></div>}
          {tab === 'terminal' && <div className="space-y-5">{number('terminalFontSize',t("Dimensione font terminale"),9,32)}{number('terminalScrollback',t("Righe conservate nel terminale"),100,20000)}</div>}
          {tab === 'devices' && <><div className="space-y-3"><select aria-label={t("Dispositivo per strumenti")} className={control} disabled={!!job} value={deviceUdid} onChange={e=>setDeviceUdid(e.target.value)}><option value="">{t("Seleziona dispositivo")}</option>{props.devices.filter(d=>d.connected).map(d=><option key={d.udid} value={d.udid}>{d.name} · {d.udid}</option>)}</select><input aria-label={t("Host Wi-Fi diretto")} className={control} placeholder={t("Host Wi-Fi diretto (opzionale)")} value={wifiHost} disabled={!!job} onChange={e=>setWifiHost(e.target.value)}/><div className="flex flex-wrap gap-2">{(['info','log','screenshot','record','install'] as const).map(action=><button key={action} className={button} disabled={!!job||!deviceUdid} onClick={()=>void device(action)}>{({info:t("Informazioni"),log:t("Log live"),screenshot:'Screenshot',record:t("Registra fotogrammi"),install:t("Installa IPA")})[action]}</button>)}</div><label className="block text-xs">{t("Durata registrazione (secondi)")}<input aria-label={t("Durata registrazione")} disabled={!!job} className={control} type="number" min={1} max={300} value={recordDuration} onChange={e=>setRecordDuration(Number(e.target.value))}/></label><p className="text-xs text-fruit-textDim">{t("Le operazioni usano i servizi nativi OpenFruit. Pairing, trust e disponibilità dei servizi vengono verificati dal motore. La registrazione salva fotogrammi, non un video codificato. Usa Interrompi per fermare il log.")}</p></div><h3 className="font-bold">{t("Dispositivi rilevati da OpenFruit")}</h3><button className={button} onClick={() => props.onRefreshDevices().catch((error: Error) => setError(error.message))}>{t("Ripeti scansione USB / rete")}</button>{props.devices.filter(device => device.connected).map(device => <div key={device.udid} className="border border-fruit-border rounded-lg p-3 text-sm space-y-1"><strong>{device.name}</strong><p>{device.type === 'network' ? t("Wi-Fi / rete") : 'USB'} · {device.iosVersion || t("Versione iOS non disponibile")}</p><p className="text-xs font-mono">{device.udid}</p></div>)}{!props.devices.some(device => device.connected) && <p className="text-sm text-fruit-textMuted">{props.devices[0]?.name || t("Nessun dispositivo rilevato")}</p>}<p className="text-xs text-fruit-textDim">{t("Per la rete il dispositivo deve essere associato e raggiungibile dal backend OpenFruit. Gli errori della scansione compaiono nell’output dell’IDE.")}</p></>}
          {tab === 'git' && <><h3 className="font-bold">{t("Identità Git globale")}</h3><p className="text-xs font-mono">{environment?.git.version || t("Versione Git non disponibile")}</p><label className="block space-y-2">{t("Nome")}<input aria-label={t("Autore Git")} value={gitName} onChange={event => setGitName(event.target.value)} className={control} /></label><label className="block space-y-2">Email<input aria-label={t("Email Git")} value={gitEmail} onChange={event => setGitEmail(event.target.value)} className={control} /></label><button className={button} disabled={!!job || !gitName.trim() || !gitEmail.trim()} onClick={async () => { try { await api.saveGitIdentity(gitName,gitEmail); setOutput(t("Identità Git salvata")); await refresh(); } catch(error: any) {setError(error.message);} }}>{t("Salva identità Git")}</button><p className="text-xs text-fruit-textDim">{t("Questi valori sono globali. Un repository può definire un’identità locale diversa; le credenziali dei remoti restano gestite da Git e dal credential helper.")}</p></>}
          {tab === 'help' && <div className="space-y-3"><h3 className="font-bold">{t("Guida e comandi")}</h3><p className="text-sm">{t("Ctrl+O: apri progetto · Ctrl+P: file · Ctrl+Shift+P: comandi · Ctrl+S: salva · Ctrl+Shift+S: salva tutti · Ctrl+Alt+P: canvas · Ctrl+J: terminale.")}</p><p className="text-xs text-fruit-textDim">{t("Nel terminale le scorciatoie appartengono alla shell.")}</p><button className={button} onClick={() => api.openHelp('docs').catch((error: Error) => setError(error.message))}>{t("Apri documentazione locale")}</button></div>}
          {job && <div role="status" className="text-sm text-fruit-accent">{t("Operazione:")} {job} <button className={button} onClick={() => api.cancelOpenFruitCommand()}>{t("Interrompi")}</button></div>}
          {error && <p role="alert" className="text-sm text-rose-300 whitespace-pre-wrap">{error}</p>}
          {output && <pre className="text-xs text-fruit-textMuted font-mono whitespace-pre-wrap break-all max-h-64 overflow-auto border border-fruit-border rounded-lg p-3">{output}</pre>}
        </section>
      </div>
      <footer className="p-4 border-t border-fruit-border flex items-center justify-between"><span className="text-xs text-fruit-textDim">{dirty ? t("Preferenze non salvate") : t("Preferenze salvate sul dispositivo")}</span><button className="px-4 py-2 bg-fruit-accent text-fruit-accentDark rounded-lg text-sm disabled:opacity-40" disabled={!dirty || !!job} onClick={async () => { try { await props.onSavePreferences(draft); } catch(error: any) { setError(error.message); } }}>{t("Salva preferenze")}</button></footer>
    </div>
  </div>;
}
