import { useTranslation } from '../localization';
import {useDialog} from '../hooks/useDialog';
import React, { useState } from 'react';
import { GitBranch, Folder, X, Loader2, AlertCircle } from 'lucide-react';

interface CloneGitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCloneSuccess: (clonedProjectPath: string, projectName: string) => void;
}

export const CloneGitModal: React.FC<CloneGitModalProps> = ({
  isOpen,
  onClose,
  onCloneSuccess
}) => {
  const t = useTranslation();
  const container=React.useRef<HTMLDivElement>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [targetDir, setTargetDir] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cloneLog, setCloneLog] = useState<string | null>(null);

  useDialog(isOpen,container,()=>{if(!isCloning)onClose();});
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isCloning) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, isCloning]);

  React.useEffect(() => {
    if (!isOpen || targetDir) return;
    let active = true;
    (window as any).openfruitApi?.defaultProjectsDirectory?.().then((directory: string) => { if (active) setTargetDir(directory); });
    return () => { active = false; };
  }, [isOpen, targetDir]);

  if (!isOpen) return null;

  const derivedName = (repoUrl.trim().split('/').pop()?.replace(/\.git$/i, '') || 'repo');

  const handlePickDirectory = async () => {
    if ((window as any).openfruitApi?.selectDirectory) {
      const selected = await (window as any).openfruitApi.selectDirectory();
      if (selected) {
        setTargetDir(selected);
      }
    }
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || isCloning) return;
    if (/[<>:\"/\\|?*]/.test(derivedName) || derivedName === '.' || derivedName === '..') { setErrorMsg(t("Nome cartella non valido")); return; }

    setErrorMsg(null);
    setIsCloning(true);
    setCloneLog(t("Connessione al repository remoto..."));

    const finalPath = `${targetDir.replace(/[\\/]+$/, '')}\\${derivedName}`;

    try {
      if ((window as any).openfruitApi?.gitClone) {
        setCloneLog(t("git clone {0} \"{1}\" in corso...", [repoUrl.trim(), finalPath]));
        const res = await (window as any).openfruitApi.gitClone(repoUrl.trim(), finalPath);
        if (res?.success) {
          setCloneLog(t("Clonazione completata con successo! Apertura workspace..."));
          setIsCloning(false);
          onCloneSuccess(finalPath, derivedName);
          onClose();
        } else {
          setIsCloning(false);
          setErrorMsg(res?.cancelled ? t("Clonazione interrotta. La cartella può contenere file parziali.") : res?.error || res?.output || t("Errore durante la clonazione Git."));
        }
      } else {
        setIsCloning(false);
        setErrorMsg(t("Clonazione disponibile solo nell’app desktop."));
      }
    } catch (err: any) {
      setIsCloning(false);
      setErrorMsg(err.message || t("Errore imprevisto."));
    }
  };

  return (
    <div ref={container} role="dialog" aria-modal="true" aria-label={t("Clona repository")} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs select-none">
      <div className="w-full max-w-lg rounded-2xl bg-fruit-surface border border-fruit-border p-6 shadow-luxury space-y-5 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-fruit-border/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-fruit-accent/15 text-fruit-accent border border-fruit-accent/30">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-syne font-bold text-base text-fruit-text">{t("Clona Repository Git")}</h2>
              <p className="text-xs text-fruit-textDim font-syne">{t("Scarica un progetto Swift/iOS da GitHub o GitLab")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isCloning}
            className="p-1 rounded-lg hover:bg-fruit-bg text-fruit-textDim hover:text-fruit-text transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleClone} className="space-y-4 font-syne">
          {/* Repository URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-fruit-textMuted uppercase tracking-wider">
              {t("URL Repository")}
            </label>
            <input
              type="text"
              required
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/apple/swift-argument-parser.git"
              className="w-full px-3.5 py-2 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent/80 text-fruit-text font-mono text-xs outline-none transition-colors"
            />
          </div>

          {/* Target Directory */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-fruit-textMuted uppercase tracking-wider">
              {t("Cartella Locale di Destinazione")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={targetDir}
                onChange={e => setTargetDir(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-xl bg-fruit-bg border border-fruit-border focus:border-fruit-accent/80 text-fruit-text font-mono text-xs outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handlePickDirectory}
                className="px-3 py-2 rounded-xl bg-fruit-surface hover:bg-fruit-surfaceHover border border-fruit-border text-fruit-textMuted hover:text-fruit-text text-xs flex items-center gap-1.5 transition-colors"
                title={t("Sfoglia cartella")}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>{t("Sfoglia")}</span>
              </button>
            </div>
          </div>

          {/* Result path preview */}
          <div className="p-3 rounded-xl bg-fruit-card/80 border border-fruit-border/60 text-xs">
            <span className="text-fruit-textDim">{t("Cartella finale:")} </span>
            <span className="font-mono text-fruit-accent font-semibold">{targetDir}\{derivedName}</span>
          </div>

          {/* Error / Status */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="font-mono break-all">{errorMsg}</div>
            </div>
          )}

          {isCloning && (
            <div className="p-3 rounded-xl bg-fruit-bg/80 border border-fruit-accent/30 text-xs text-fruit-text flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 text-fruit-accent animate-spin shrink-0" />
              <span className="font-mono text-[11px] truncate text-fruit-accent">{cloneLog}</span>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => isCloning ? (window as any).openfruitApi?.cancelGitOperation?.('clone') : onClose()}
              className="px-4 py-2 rounded-xl bg-fruit-bg hover:bg-fruit-surface border border-fruit-border text-xs text-fruit-text transition-colors disabled:opacity-40"
            >
              {isCloning ? t("Interrompi clonazione") : t("Annulla")}
            </button>
            <button
              type="submit"
              disabled={!repoUrl.trim() || isCloning}
              className="px-5 py-2 rounded-xl bg-fruit-accent hover:bg-fruit-accentHover text-fruit-card font-bold text-xs shadow-subtle flex items-center gap-2 transition-all disabled:opacity-40"
            >
              {isCloning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("Clonazione...")}</span>
                </>
              ) : (
                <>
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>{t("Clona Repository")}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
