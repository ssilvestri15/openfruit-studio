import { useTranslation } from '../localization';
import { useEffect, useState } from 'react';
import type { ProjectSettingsSnapshot, ProjectSettingsBridge, ProjectSettings } from '../../shared/projectSettings';
export function BuildSelection({root}:{root:string}){
  const t = useTranslation();
  const api=(window as unknown as {openfruitApi:ProjectSettingsBridge}).openfruitApi;
  const [snapshot,setSnapshot]=useState<ProjectSettingsSnapshot>(),[settings,setSettings]=useState<ProjectSettings>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{let current=true;api.readProjectSettings(root).then(s=>{if(current){setSnapshot(s);setSettings(s.settings);}}).catch(e=>{if(current)setMessage(e.message);});return()=>{current=false;};},[root]);
  if(!snapshot||!settings)return <p role="status">{message||t("Lettura scheme e target…")}</p>;
  const key=settings.scheme?'scheme:'+settings.scheme:settings.targetId?'target:'+settings.targetProject+'::'+settings.targetId:'';
  const selectedScheme=snapshot.schemes?.find(s=>s.path===settings.scheme),selectedTarget=snapshot.buildTargets?.find(t=>t.id===settings.targetId&&t.project===settings.targetProject);
  const configs=[...new Set([...(selectedScheme?.configurations||[]),...(selectedTarget?.configurations||[]),...(!key?(snapshot.buildTargets||[]).flatMap(t=>t.configurations):[]),'Debug','Release'])];
  const change=(value:string)=>{if(value.startsWith('scheme:'))setSettings({...settings,scheme:value.slice(7),targetId:'',targetProject:''});else if(value.startsWith('target:')){const t=snapshot.buildTargets!.find(t=>'target:'+t.project+'::'+t.id===value)!;setSettings({...settings,scheme:'',targetId:t.id,targetProject:t.project});}else setSettings({...settings,scheme:'',targetId:'',targetProject:''});};
  const input='w-full bg-fruit-editor border border-fruit-border p-2 rounded text-xs';
  return <form className="space-y-4 text-fruit-text" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{const result=await api.saveProjectSettings(root,settings,snapshot.revision);setSnapshot(result);setSettings(result.settings);setMessage(t("Selezione salvata. Nessuna build avviata."));}catch(error:any){setMessage(error.message);}finally{setBusy(false);}}}>
    <p className="text-xs text-fruit-textDim">{t("Selezione usata dal pulsante Build. Le modifiche ai target e alle build settings restano nel progetto Xcode; queste preferenze sono salvate in .openfruit-studio.json.")}</p>
    <fieldset disabled={busy} className="space-y-4">
      <label className="block text-sm">{t("Scheme o target")}<select className={input} aria-label={t("Scheme o target build")} value={key} onChange={e=>change(e.target.value)}><option value="">{t("Selezione automatica OpenFruit")}</option><optgroup label="Schemes">{snapshot.schemes?.map(s=><option key={s.path} value={'scheme:'+s.path}>{s.name} · {s.container.split(/[\\/]/).at(-1)}</option>)}</optgroup><optgroup label="Targets">{snapshot.buildTargets?.map(t=><option key={t.project+t.id} value={'target:'+t.project+'::'+t.id}>{t.name} · {t.project.split(/[\\/]/).at(-1)}</option>)}</optgroup></select></label>
      <label className="block text-sm">{t("Configurazione")}<input required list="xcode-configurations" aria-label={t("Configurazione da compilare")} className={input} value={settings.configuration} onChange={e=>setSettings({...settings,configuration:e.target.value})}/><datalist id="xcode-configurations">{configs.map(c=><option key={c} value={c}/>)}</datalist></label>
      <label className="block text-sm">{t("SDK installato")}<input aria-label={t("SDK per build")} className={input} placeholder={t("Predefinito OpenFruit")} value={settings.sdkVersion} onChange={e=>setSettings({...settings,sdkVersion:e.target.value})}/></label>
      <label className="block text-sm">{t("Processi paralleli")}<input type="number" min={0} max={256} aria-label={t("Processi build")} className={input} value={settings.jobs} onChange={e=>setSettings({...settings,jobs:Number(e.target.value)})}/></label>
      <button className="border border-fruit-border rounded p-2 text-xs">{t("Salva selezione build")}</button>
    </fieldset>
    {snapshot.workspaces?.map(w=><div key={w.path} className="text-xs text-fruit-textDim"><p>{w.path} · {w.projects.length} {t("progetti")}</p>{w.warnings.map((v,i)=><p key={i} className="text-amber-300">{v}</p>)}</div>)}
    {message&&<p role="status" className="text-xs">{message}</p>}
  </form>;
}
