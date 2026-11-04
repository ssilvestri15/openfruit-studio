import { useTranslation } from '../localization';
import React from 'react';
import { 
  Plus, FolderOpen, RefreshCw, AppWindow, Save, Settings, LogOut, XSquare, 
  ChevronRight, Check, GitBranch 
} from 'lucide-react';

interface FileMenuDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onCloneGit?: () => void;
  onChangeProject: (name: string) => void;
  onNewWindow: () => void;
  onSave: () => void;
  onSaveAll: () => void;
  onOpenSettings: () => void;
  onCloseProject: () => void;
  recentProjects: Array<{ name: string; path: string; branch: string }>;
  currentProjectName: string;
}

export const FileMenuDropdown: React.FC<FileMenuDropdownProps> = ({
  isOpen,
  onClose,
  onNewProject,
  onOpenProject,
  onCloneGit,
  onChangeProject,
  onNewWindow,
  onSave,
  onSaveAll,
  onOpenSettings,
  onCloseProject,
  recentProjects,
  currentProjectName
}) => {
  const t = useTranslation();
  const [showRecentSubmenu, setShowRecentSubmenu] = React.useState(false);

  if (!isOpen) return null;

  return (
    <>
      {/* Click outside backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div 
        className="absolute top-11 left-0 z-50 w-72 bg-fruit-surface border border-fruit-border rounded-xl shadow-popup py-1.5 text-xs font-syne select-none animate-fadeIn"
        onClick={e => e.stopPropagation()}
      >
        {/* Nuovo Progetto */}
        <button
          onClick={() => { onNewProject(); onClose(); }}
          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <Plus className="w-3.5 h-3.5 text-fruit-accent" />
            <span>{t("Nuovo progetto...")}</span>
          </div>
          <span className="font-mono text-[10px] text-fruit-textDim group-hover:text-fruit-textMuted">Ctrl+Shift+N</span>
        </button>

        {/* Apri Progetto */}
        <button
          onClick={() => { onOpenProject(); onClose(); }}
          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <FolderOpen className="w-3.5 h-3.5 text-fruit-textMuted" />
            <span>{t("Apri progetto...")}</span>
          </div>
          <span className="font-mono text-[10px] text-fruit-textDim group-hover:text-fruit-textMuted">Ctrl+O</span>
        </button>

        {/* Clona da Git */}
        <button
          onClick={() => { onCloneGit?.(); onClose(); }}
          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-3.5 h-3.5 text-fruit-textMuted" />
            <span>{t("Clona da Git...")}</span>
          </div>
        </button>

        {/* Cambia Progetto (con sottomenu) */}
        <div 
          className="relative"
          onMouseEnter={() => setShowRecentSubmenu(true)}
          onMouseLeave={() => setShowRecentSubmenu(false)}
        >
          <button
            className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <RefreshCw className="w-3.5 h-3.5 text-fruit-textMuted" />
              <span>{t("Cambia progetto")}</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-fruit-textDim" />
          </button>

          {/* Sottomenu Progetti Recenti */}
          {showRecentSubmenu && (
            <div className="absolute top-0 left-full ml-1 w-60 bg-fruit-surface border border-fruit-border rounded-xl shadow-popup py-1.5 animate-fadeIn">
              <div className="px-3 py-1 text-[10px] font-mono text-fruit-textDim tracking-wider uppercase border-b border-fruit-border/60 mb-1">
                {t("Progetti Recenti")}
              </div>
              {recentProjects.map(proj => {
                const isCurrent = proj.name === currentProjectName;
                return (
                  <button
                    key={proj.name}
                    onClick={() => {
                      onChangeProject(proj.path);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-fruit-surfaceHover text-left text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-fruit-accent' : 'bg-transparent'}`} />
                      <span className={`truncate ${isCurrent ? 'font-bold text-fruit-accent' : 'text-fruit-text'}`}>
                        {proj.name}
                      </span>
                    </div>
                    {isCurrent && <Check className="w-3.5 h-3.5 text-fruit-accent flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Nuova Finestra */}
        <button
          onClick={() => { onNewWindow(); onClose(); }}
          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <AppWindow className="w-3.5 h-3.5 text-fruit-textMuted" />
            <span>{t("Nuova finestra")}</span>
          </div>
          <span className="font-mono text-[10px] text-fruit-textDim group-hover:text-fruit-textMuted">Ctrl+Shift+W</span>
        </button>

        <div className="my-1.5 border-t border-fruit-border/60" />

        {/* Salva */}
        <button
          onClick={() => { onSave(); onClose(); }}
          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <Save className="w-3.5 h-3.5 text-fruit-textMuted" />
            <span>{t("Salva")}</span>
          </div>
          <span className="font-mono text-[10px] text-fruit-textDim group-hover:text-fruit-textMuted">Ctrl+S</span>
        </button>

        {/* Salva Tutto */}
        <button
          onClick={() => { onSaveAll(); onClose(); }}
          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <Save className="w-3.5 h-3.5 text-fruit-textMuted" />
            <span>{t("Salva tutto")}</span>
          </div>
          <span className="font-mono text-[10px] text-fruit-textDim group-hover:text-fruit-textMuted">Ctrl+Shift+S</span>
        </button>

        <div className="my-1.5 border-t border-fruit-border/60" />

        {/* Impostazioni e SDK */}
        <button
          onClick={() => { onOpenSettings(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-fruit-accent" />
          <span>{t("Impostazioni e SDK...")}</span>
        </button>

        <div className="my-1.5 border-t border-fruit-border/60" />

        {/* Chiudi Progetto */}
        <button
          onClick={() => { onCloseProject(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-text transition-colors"
        >
          <XSquare className="w-3.5 h-3.5 text-fruit-syntaxCoral" />
          <span>{t("Chiudi progetto")}</span>
        </button>

        {/* Esci */}
        <button
          onClick={() => { window.close(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-fruit-surfaceHover text-fruit-textDim hover:text-fruit-syntaxCoral transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{t("Esci da OpenFruit Studio")}</span>
        </button>
      </div>
    </>
  );
};
