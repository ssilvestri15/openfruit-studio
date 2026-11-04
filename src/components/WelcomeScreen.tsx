import { useTranslation } from '../localization';
import React from 'react';
import { Plus, FolderOpen, GitBranch, Settings, ChevronRight, Clock, ArrowUpRight, Trash2 } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface WelcomeScreenProps {
  onNewProject: () => void;
  onOpenProject: (proj?: any) => void;
  onImportGit: () => void;
  onOpenSettings: () => void;
  recentProjects: Array<{
    name: string;
    path: string;
    framework: string;
    branch: string;
    lastModified: string;
    bundleId: string;
  }>;
  onRemoveRecentProject?: (name: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onNewProject,
  onOpenProject,
  onImportGit,
  onOpenSettings,
  recentProjects,
  onRemoveRecentProject
}) => {
  const t = useTranslation();
  const handleMinimize = () => {
    (window as any).openfruitApi?.minimizeWindow?.();
  };

  const handleClose = () => {
    (window as any).openfruitApi?.closeWindow?.() || window.close();
  };

  return (
    <div className="relative w-full min-h-0 flex-1 bg-fruit-bg text-fruit-text flex flex-col justify-between p-6 md:p-8 overflow-hidden select-none">
      {/* Background subtle noise and gradient highlights */}
      <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-fruit-accent/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-[350px] h-[350px] bg-[#3E4935]/15 rounded-full blur-[90px] pointer-events-none" />

      {/* Top Banner: STUDIO / 01 + Window Controls */}
      <div 
        style={{ WebkitAppRegion: 'drag' } as any}
        className="relative z-10 flex items-center justify-between border-b border-fruit-border/60 pb-3"
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center gap-3">
          <span className="font-mono text-xs text-fruit-accent font-semibold tracking-widest uppercase">
            STUDIO / 01
          </span>
        </div>

        {/* Minimal Window Controls */}
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center gap-1">
          <button
            onClick={handleMinimize}
            className="p-1 rounded-md hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-text transition-colors"
            title={t("Riduci a icona")}
          >
            <span className="w-2.5 h-0.5 bg-current block" />
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded-md hover:bg-fruit-syntaxCoral/20 hover:text-fruit-syntaxCoral text-fruit-textDim transition-colors"
            title={t("Chiudi")}
          >
            <span className="text-xs font-bold leading-none block">✕</span>
          </button>
        </div>
      </div>

      {/* Main Center Grid (Compact & Proportional) */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-8 my-auto py-4 items-center max-w-5xl mx-auto w-full">
        {/* Left Column: Brand & Actions */}
        <div className="md:col-span-6 flex flex-col space-y-6 pr-0 md:pr-4">
          <BrandLogo size="lg" />

          {/* Action Buttons */}
          <div className="flex flex-col space-y-2.5 max-w-sm pt-1">
            {/* Create New Project Button */}
            <button
              onClick={onNewProject}
              className="group flex items-center justify-between w-full px-4 py-3 bg-fruit-accent hover:bg-fruit-accentHover text-fruit-accentDark rounded-xl font-syne font-bold text-sm transition-all duration-200 shadow-luxury transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-fruit-accentDark/15 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-fruit-accentDark stroke-[2.5]" />
                </div>
                <span>{t("Crea nuovo progetto")}</span>
              </div>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Open Project Button */}
            <button
              onClick={() => onOpenProject()}
              className="group flex items-center justify-between w-full px-4 py-3 bg-fruit-surface hover:bg-fruit-surfaceHover border border-fruit-border hover:border-fruit-borderLight rounded-xl font-syne font-semibold text-fruit-text text-sm transition-all duration-200 shadow-subtle transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-fruit-bg flex items-center justify-center text-fruit-textMuted">
                  <FolderOpen className="w-4 h-4 stroke-[1.8]" />
                </div>
                <span>{t("Apri un progetto esistente")}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-fruit-textDim group-hover:text-fruit-text group-hover:translate-x-1 transition-all" />
            </button>

            {/* Import Git Button */}
            <button
              onClick={onImportGit}
              className="group flex items-center justify-between w-full px-4 py-3 bg-fruit-surface hover:bg-fruit-surfaceHover border border-fruit-border hover:border-fruit-borderLight rounded-xl font-syne font-semibold text-fruit-text text-sm transition-all duration-200 shadow-subtle transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-fruit-bg flex items-center justify-center text-fruit-textMuted">
                  <GitBranch className="w-4 h-4 stroke-[1.8]" />
                </div>
                <span>{t("Importa da Git")}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-fruit-textDim group-hover:text-fruit-text group-hover:translate-x-1 transition-all" />
            </button>

            {/* Settings & SDK Management Button */}
            <button
              onClick={onOpenSettings}
              className="group flex items-center justify-between w-full px-4 py-2.5 bg-transparent hover:bg-fruit-surface/50 border border-fruit-border/80 hover:border-fruit-accent/40 rounded-xl font-syne font-medium text-fruit-textMuted hover:text-fruit-accent text-xs transition-all duration-200 mt-1"
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-3.5 h-3.5 text-fruit-accent stroke-[2]" />
                <span>{t("Impostazioni e SDK / Gestisci toolchain")}</span>
              </div>
              <span className="font-mono text-[11px] text-fruit-textDim group-hover:text-fruit-accent">
                {t("Configura →")}
              </span>
            </button>
          </div>
        </div>

        {/* Right Column: Recent Projects List */}
        <div className="md:col-span-6 flex flex-col bg-fruit-surface/85 backdrop-blur-md rounded-2xl border border-fruit-border p-5 shadow-luxury">
          <div className="flex items-center justify-between border-b border-fruit-border pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-fruit-accent" />
              <h2 className="font-syne font-bold text-xs tracking-wide text-fruit-text">
                {t("RIPRENDI DA QUI")}
              </h2>
            </div>
            <span className="font-mono text-[10px] text-fruit-textMuted bg-fruit-bg px-2 py-0.5 rounded border border-fruit-border">
              {String(recentProjects.length).padStart(2, '0')} {t("PROGETTI")}
            </span>
          </div>

          <div className="space-y-2">
            {recentProjects.map((proj) => (
              <div
                key={proj.path}
                onClick={() => onOpenProject(proj)}
                className="group relative flex items-center justify-between p-3 rounded-xl bg-fruit-bg/60 hover:bg-fruit-surfaceHover/80 border border-transparent hover:border-fruit-borderLight cursor-pointer transition-all duration-150"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#222520] border border-fruit-border flex items-center justify-center font-syne font-bold text-fruit-accent group-hover:border-fruit-accent/50 transition-colors text-sm">
                    {proj.name.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-syne font-bold text-fruit-text text-xs group-hover:text-fruit-accent transition-colors">
                        {proj.name}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-fruit-surface border border-fruit-border text-fruit-accent">
                        {proj.framework}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-fruit-textDim font-mono">
                        {proj.branch}
                      </span>
                      <span className="text-fruit-borderLight text-xs">•</span>
                      <span className="text-[11px] text-fruit-textMuted font-mono">
                        {proj.lastModified}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRemoveRecentProject) {
                        onRemoveRecentProject(proj.path);
                      }
                    }}
                    className="p-1 rounded-lg text-fruit-textDim hover:text-fruit-syntaxCoral hover:bg-fruit-syntaxCoral/10 transition-colors"
                    title={t("Rimuovi {0} dai recenti", [proj.name])}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center text-fruit-accent text-[11px] font-mono font-medium ml-1">
                    <span>{t("Apri")}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="relative z-10 flex items-center justify-between pt-3 border-t border-fruit-border/60 text-[11px] text-fruit-textDim font-mono">
        <div className="flex items-center gap-3">
          <span className="text-fruit-textMuted font-semibold font-syne text-xs">
            OpenFruit Studio
          </span>
          <span>Build 2406</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#" onClick={event => { event.preventDefault(); (window as any).openfruitApi?.openHelp('docs').catch(console.error); }} className="hover:text-fruit-text transition-colors">
            {t("Documentazione")}
          </a>
          <a href="#" onClick={event => { event.preventDefault(); (window as any).openfruitApi?.openHelp('news').catch(console.error); }} className="hover:text-fruit-text transition-colors">
            {t("Novità della versione")}
          </a>
          <div className="flex items-center gap-1.5 text-fruit-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-fruit-accent"></span>
            <span>{t("Servizi operativi")}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
