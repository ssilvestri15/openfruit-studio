import { useTranslation } from '../localization';
import {TreeNavigator} from './TreeNavigator';
import { RepositoryManager } from './RepositoryManager';
import React, { useState } from 'react';
import { 
  Folder, Search, FilePlus, FolderPlus, GitBranch 
} from 'lucide-react';
import { FileNode, GitCommit, GitDiffItem, GitFileStatus } from '../types';
import { GitSidebarView } from './GitSidebarView';

export interface LeftPanelProps {
  files: FileNode;
  hasDirtyFiles: boolean;
  onOpenCommitComparison:(hash:string,parentIndex:number,path:string)=>void;
  onRepositoryChanged: () => void;
  logicalNavigator: boolean;
  onToggleNavigator: () => void;
  onSearchWorkspace: () => void;
  onOpenProjectSettings: (path?: string) => void;
  activeFilePath: string | null;
  onSelectFile: (file: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onNewFileRoot: () => void;
  onNewFolderRoot: () => void;

  // View Mode
  activeView?: 'files' | 'git';
  onChangeView?: (view: 'files' | 'git') => void;

  // Git Props
  branch?: string;
  projectName?: string;
  stagedFiles?: GitFileStatus[];
  unstagedFiles?: GitFileStatus[];
  diffs?: GitDiffItem[];
  commits?: GitCommit[];
  onCommit?: (message: string) => Promise<void>;
  onStageFile?: (filename: string) => Promise<void>;
  onUnstageFile?: (filename: string) => Promise<void>;
  onStageAll?: () => Promise<void>;
  onUnstageAll?: () => Promise<void>;
  onDiscardFile?: (filename: string, isUntracked: boolean) => Promise<void>;
  onDiscardAll?: () => Promise<void>;
  onPush?: () => Promise<void>;
  onFetch?: () => Promise<void>;
  onOpenFileByPath?: (filename: string) => void;
  onOpenDiffView?: (filename: string, staged?:boolean) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  files, onOpenCommitComparison, hasDirtyFiles, onRepositoryChanged, logicalNavigator, onToggleNavigator,
  onSearchWorkspace,
  onOpenProjectSettings,
  activeFilePath,
  onSelectFile,
  onContextMenu,
  onNewFileRoot,
  onNewFolderRoot,
  activeView = 'files',
  onChangeView,
  branch = 'main',
  projectName,
  stagedFiles = [],
  unstagedFiles = [],
  diffs = [],
  commits = [],
  onCommit = async () => {},
  onStageFile = async () => {},
  onUnstageFile = async () => {},
  onStageAll = async () => {},
  onUnstageAll = async () => {},
  onDiscardFile = async () => {},
  onDiscardAll = async () => {},
  onPush,
  onFetch,
  onOpenFileByPath,
  onOpenDiffView
}) => {
  const t = useTranslation();
  const [manageRepository, setManageRepository] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const totalChanges = stagedFiles.length + unstagedFiles.length;

  return (
    <aside 
      className={`${
        activeView === 'git' ? 'w-[320px]' : 'w-64'
      } h-full bg-fruit-bg border-r border-fruit-border flex flex-col select-none transition-all duration-200 shrink-0`}
    >
      {manageRepository && <RepositoryManager root={files.path} hasDirtyFiles={hasDirtyFiles} onClose={() => setManageRepository(false)} onChanged={onRepositoryChanged} onOpenComparison={onOpenCommitComparison} onOpenFile={onOpenFileByPath} />}
      {/* Top Activity Switcher: Esplora vs Git */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-fruit-border/70 bg-fruit-surface/20">
        <div className="flex items-center gap-1 bg-fruit-bg p-0.5 rounded-lg border border-fruit-border/60">
          <button
            onClick={() => onChangeView && onChangeView('files')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-syne font-semibold transition-all ${
              activeView === 'files'
                ? 'bg-fruit-surface text-fruit-text shadow-xs border border-fruit-border/50'
                : 'text-fruit-textDim hover:text-fruit-text border border-transparent'
            }`}
            title={t("Mostra Esplora File")}
          >
            <Folder className="w-3.5 h-3.5 text-fruit-accent" />
            <span>{t("Esplora")}</span>
          </button>
          
          <button
            onClick={() => onChangeView && onChangeView('git')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-syne font-semibold transition-all ${
              activeView === 'git'
                ? 'bg-fruit-surface text-fruit-accent shadow-xs border border-fruit-border/50'
                : 'text-fruit-textDim hover:text-fruit-text border border-transparent'
            }`}
            title={t("Mostra Controllo Versione Git")}
          >
            <GitBranch className="w-3.5 h-3.5 text-fruit-accent" />
            <span>Git</span>
            {totalChanges > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-fruit-accent/20 text-fruit-accent text-[9px] font-mono font-bold">
                {totalChanges}
              </span>
            )}
          </button>
        </div>

        <button onClick={onSearchWorkspace} title={t("Cerca nel progetto (Ctrl+Shift+F)")} className="p-1 text-fruit-textMuted hover:text-fruit-accent"><Search className="w-4 h-4" /></button>
        {activeView === 'files' && (
          <div className="flex items-center gap-1">
            <button
              onClick={onNewFileRoot}
              className="p-1 rounded hover:bg-fruit-surface text-fruit-textMuted hover:text-fruit-accent transition-colors"
              title={t("Nuovo file nella radice")}
            >
              <FilePlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onNewFolderRoot}
              className="p-1 rounded hover:bg-fruit-surface text-fruit-textMuted hover:text-fruit-accent transition-colors"
              title={t("Nuova cartella nella radice")}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Content depending on activeView */}
      {activeView === 'git' ? (
        <div className="flex-1 overflow-hidden flex flex-col">
<button onClick={() => setManageRepository(true)} className="p-2 text-xs text-fruit-accent">{t("Branch, remoti, conflitti e cronologia")}</button>
          <GitSidebarView repositoryPath={files.path} onRepositoryChanged={onRepositoryChanged} onOpenCommitComparison={onOpenCommitComparison}
            branch={branch}
            projectName={projectName ?? t("Progetto")}
            stagedFiles={stagedFiles}
            unstagedFiles={unstagedFiles}
            diffs={diffs}
            commits={commits}
            onCommit={onCommit}
            onStageFile={onStageFile}
            onUnstageFile={onUnstageFile}
            onStageAll={onStageAll}
            onUnstageAll={onUnstageAll}
            onDiscardFile={onDiscardFile}
            onDiscardAll={onDiscardAll}
            onPush={onPush}
            onFetch={onFetch}
            onOpenFileByPath={onOpenFileByPath}
            onOpenDiffView={onOpenDiffView}
          />
        </div>
      ) : (
        <>
          {/* Search Input Bar */}
          <div className="p-2 border-b border-fruit-border/40">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-fruit-surface border border-fruit-border focus-within:border-fruit-accent/60 transition-colors">
              <Search className="w-3.5 h-3.5 text-fruit-textDim" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("Cerca file...")}
                className="w-full bg-transparent text-xs font-syne text-fruit-text placeholder:text-fruit-textDim outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-[10px] font-mono text-fruit-textDim hover:text-fruit-text"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <button onClick={onToggleNavigator} className="p-2 text-xs text-fruit-accent">{logicalNavigator ? t("Gruppi Xcode · mostra filesystem") : t("Filesystem · mostra gruppi Xcode")}</button>
          {/* File Tree List */}
<TreeNavigator root={files} query={searchQuery} activePath={activeFilePath} onSelect={onSelectFile} onSettings={onOpenProjectSettings} onContext={onContextMenu} />
        </>
      )}
    </aside>
  );
};
