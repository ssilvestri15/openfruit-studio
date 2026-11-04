import { useTranslation } from '../localization';
import { useDialog } from '../hooks/useDialog';
import React, { useState, useEffect, useRef } from 'react';
import { X, Folder, GitBranch } from 'lucide-react';
import { ProjectConfig, SdkItem } from '../types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (config: ProjectConfig) => Promise<void>;
  availableSdks: SdkItem[];
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  availableSdks
}) => {
  const t = useTranslation();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [template,setTemplate]=useState<'xcode'|'swift-package'>('xcode');
  const dialog=useRef<HTMLDivElement>(null);
  useDialog(isOpen,dialog,()=>{if(!busy)onClose();});
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [minIosVersion, setMinIosVersion] = useState('iOS 18.0');
  const [sdkVersion, setSdkVersion] = useState('Automatico');
  const [language, setLanguage] = useState('Swift 6.0');
  const [interfaceType, setInterfaceType] = useState('SwiftUI');
  const [projectPath, setProjectPath] = useState('');
  const [baseDirectory, setBaseDirectory] = useState('');
  const automaticPath = useRef(true);
  const [gitInit, setGitInit] = useState(true);

  useEffect(() => {
    if (!isOpen || baseDirectory) return;
    let active = true;
    (window as any).openfruitApi?.defaultProjectsDirectory?.().then((directory: string) => {
      if (!active) return;
      setBaseDirectory(directory);
      if (automaticPath.current) setProjectPath(directory + '\\' + name);
    });
    return () => { active = false; };
  }, [isOpen, baseDirectory, name]);

  if (!isOpen) return null;

  // Suggest a reverse-DNS identifier only from what the user typed.
  const suggestedBundleId = (org: string, app: string) => {
    const sanitizedOrg = org.toLowerCase().replace(/[^a-z0-9]/g, '');
    const sanitizedName = app.toLowerCase().replace(/[^a-z0-9]/g, '');
    return sanitizedOrg && sanitizedName ? `com.${sanitizedOrg}.${sanitizedName}` : '';
  };

  const handleNameChange = (val: string) => {
    setName(val);
    setBundleId(suggestedBundleId(organization, val));
    if (automaticPath.current && baseDirectory) setProjectPath(val.trim() ? `${baseDirectory}\\${val.trim()}` : '');
  };

  const handleOrgChange = (val: string) => {
    setOrganization(val);
    setBundleId(suggestedBundleId(val, name));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return; setBusy(true); setError('');
    try { await onCreate({
      name: name.trim(),
      bundleId: bundleId.trim(),
      organization: organization.trim(),
      minIosVersion,
      sdkVersion,
      language,
      interfaceType,
      projectPath,
      gitInit, template
    }); } catch(error:any) {setError(error.message);} finally {setBusy(false);}
  };

  const handleBrowseFolder = async () => {
    if ((window as any).openfruitApi?.selectDirectory) {
      const selected = await (window as any).openfruitApi.selectDirectory();
      if (selected) {
        automaticPath.current = false;
        setProjectPath(selected);
      }
    }
  };

  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t("Nuovo progetto")} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-fruit-overlay/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl bg-fruit-surface border border-fruit-border rounded-2xl shadow-luxury overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-5 border-b border-fruit-border/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-fruit-accent font-semibold tracking-widest uppercase">
                {t("NUOVO PROGETTO / 01")}
              </span>
              <span className="text-fruit-borderLight text-xs">•</span>
              <span className="text-xs text-fruit-textMuted font-mono">
                {t("Diamo forma alla tua idea")}
              </span>
            </div>
            <h2 className="text-2xl font-bold font-syne text-fruit-text mt-1">
              {t("Nuovo Progetto iOS")}
            </h2>
            <p className="text-xs text-fruit-textMuted font-syne mt-0.5">
              {t("Un punto di partenza essenziale, con compilazione nativa e interfaccia SwiftUI.")}
            </p>
          </div>
          <button
            disabled={busy} onClick={onClose}
            className="w-8 h-8 rounded-lg bg-fruit-bg/80 border border-fruit-border flex items-center justify-center text-fruit-textMuted hover:text-fruit-text hover:border-fruit-borderLight transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          {/* App Name and Org */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-fruit-text font-syne mb-1.5">
                {t("Nome dell'app")}
              </label>
              <input
                type="text"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                required
                placeholder={t("Nome dell'app")}
                className="w-full px-3.5 py-2.5 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent focus:ring-1 focus:ring-fruit-accent text-fruit-text font-syne text-sm outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-fruit-text font-syne mb-1.5">
                {t("Organizzazione")}
              </label>
              <input
                type="text"
                value={organization}
                onChange={e => handleOrgChange(e.target.value)}
                placeholder={t("Nome della tua organizzazione")}
                className="w-full px-3.5 py-2.5 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent focus:ring-1 focus:ring-fruit-accent text-fruit-text font-syne text-sm outline-none transition-all"
              />
            </div>
          </div>

          {/* Bundle ID */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-fruit-text font-syne">
                Bundle Identifier
              </label>
              <span className="font-mono text-[10px] text-fruit-textDim">
                {t("formato reverse-DNS, es. com.azienda.app")}
              </span>
            </div>
            <input
              type="text"
              value={bundleId}
              onChange={e => setBundleId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent focus:ring-1 focus:ring-fruit-accent text-fruit-accent font-mono text-sm outline-none transition-all"
            />
            <p className="text-[11px] text-fruit-textDim mt-1 font-syne">
              {t("Identificatore univoco della tua applicazione per il provisioning Apple. Potrai modificarlo successivamente.")}
            </p>
          </div>

          {/* Versions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-fruit-text font-syne mb-1.5">
                {t("Versione iOS Minima")}
              </label>
              <select
                value={minIosVersion}
                onChange={e => setMinIosVersion(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent text-fruit-text font-syne text-sm outline-none transition-all cursor-pointer"
              >
                <option value="iOS 18.0">iOS 18.0 (Modern Swift 6)</option>
                <option value="iOS 17.5">iOS 17.5</option>
                <option value="iOS 16.0">{t("iOS 16.0 (Massima compatibilità)")}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fruit-text font-syne mb-1.5">
                {t("SDK di Compilazione (OpenFruit)")}
              </label>
              <select
                value={sdkVersion}
                onChange={e => setSdkVersion(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent text-fruit-text font-syne text-sm outline-none transition-all cursor-pointer"
              >
                <option value="Automatico">{t("Automatico — SDK configurato in OpenFruit")}</option>
              {availableSdks.filter(s=>s.status==='installed').map(s=><option key={s.id} value={s.version}>iOS {s.version}</option>)}
              </select>
            </div>
          </div>

          {/* Language & UI Paradigm */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-fruit-text font-syne mb-1.5">
                {t("Linguaggio")}
              </label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent text-fruit-text font-syne text-sm outline-none transition-all cursor-pointer"
              >
                <option value="Swift 6.0">Swift 6.0 (Concurrency & Macro Native)</option>
                <option value="Swift 5.10" disabled>{t("Swift 5.10 — scaffold non disponibile")}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fruit-text font-syne mb-1.5">
                {t("Interfaccia Utente")}
              </label>
              <select
                value={interfaceType}
                onChange={e => setInterfaceType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent text-fruit-text font-syne text-sm outline-none transition-all cursor-pointer"
              >
                <option value="SwiftUI">SwiftUI</option>
                <option value="Storyboard" disabled>{t("Storyboard & UIKit — scaffold non disponibile")}</option>
              </select>
            </div>
          </div>

          {/* Project Path */}
          <div className="pt-1">
            <label className="block text-xs font-semibold text-fruit-text font-syne mb-1.5">
              {t("Posizione del progetto")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={projectPath}
                onChange={e => { automaticPath.current = false; setProjectPath(e.target.value); }}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent text-fruit-text font-mono text-xs outline-none transition-all"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                className="px-3 py-2.5 rounded-xl bg-fruit-surfaceHover border border-fruit-border text-fruit-textMuted hover:text-fruit-text text-xs font-syne font-medium flex items-center gap-1.5 transition-colors"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>{t("Sfoglia...")}</span>
              </button>
            </div>
          </div>

          <label className="block text-xs text-fruit-text">{t("Formato progetto")}<select disabled={busy} aria-label={t("Template progetto")} className="block w-full bg-fruit-bg border border-fruit-border rounded p-2 mt-2" value={template} onChange={e=>setTemplate(e.target.value as typeof template)}><option value="xcode">{t("Xcode · applicazione SwiftUI")}</option><option value="swift-package">{t("Swift Package · eseguibile SwiftUI")}</option></select></label>
          {/* Git repo checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-3 p-3 rounded-xl bg-fruit-bg/70 border border-fruit-border cursor-pointer hover:border-fruit-borderLight transition-colors">
              <input
                type="checkbox"
                checked={gitInit}
                onChange={e => setGitInit(e.target.checked)}
                className="w-4 h-4 rounded text-fruit-accent focus:ring-fruit-accent bg-fruit-surface border-fruit-border"
              />
              <div className="flex items-center gap-2 text-xs font-syne text-fruit-text">
                <GitBranch className="w-3.5 h-3.5 text-fruit-accent" />
                <span>{t("Inizializza un repository Git locale (branch principale:")} <span className="font-mono text-fruit-accent">main</span>)</span>
              </div>
            </label>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-fruit-border/60 bg-fruit-surface">
<span role={error ? 'alert' : 'status'} className="text-[11px] text-fruit-textDim font-mono">{error || (busy ? t("Creazione progetto…") : t("Nessuna compilazione automatica"))}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy} onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-fruit-textMuted hover:text-fruit-text font-syne text-sm font-medium transition-colors"
            >
              {t("Annulla")}
            </button>
            <button
              type="button"
              disabled={busy} onClick={handleSubmit}
              className="px-6 py-2.5 rounded-xl bg-fruit-accent hover:bg-fruit-accentHover text-fruit-accentDark font-syne font-bold text-sm shadow-luxury transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {busy ? 'Creazione…' : t("Crea progetto")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
