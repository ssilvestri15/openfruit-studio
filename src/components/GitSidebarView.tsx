import { useTranslation } from '../localization';
import {CommitHistoryEntry} from './CommitHistoryEntry';
import {GitHunkEditor} from './GitHunkEditor';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  GitBranch, ArrowUp, RefreshCw, Check, FileCode, Plus, Minus, 
  RotateCcw, AlertTriangle, Layers, FileDiff, CheckCircle2, ChevronRight, ChevronDown, GitCompare 
} from 'lucide-react';
import { GitCommit, GitDiffItem, GitFileStatus } from '../types';

export interface GitSidebarViewProps {
  branch: string;
  repositoryPath?:string;
  onRepositoryChanged?:()=>void;
  onOpenCommitComparison?:(hash:string,parentIndex:number,path:string)=>void;
  projectName?: string;
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  diffs: GitDiffItem[];
  commits: GitCommit[];
  onCommit: (message: string) => Promise<void>;
  onStageFile: (filename: string) => Promise<void>;
  onUnstageFile: (filename: string) => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onDiscardFile: (filename: string, isUntracked: boolean) => Promise<void>;
  onDiscardAll: () => Promise<void>;
  onPush?: () => Promise<void>;
  onFetch?: () => Promise<void>;
  onOpenFileByPath?: (filename: string) => void;
  onOpenDiffView?: (filename: string, staged?:boolean) => void;
}

export const GitSidebarView: React.FC<GitSidebarViewProps> = ({
  branch, repositoryPath, onRepositoryChanged, onOpenCommitComparison,
  stagedFiles = [],
  unstagedFiles = [],
  diffs = [],
  commits = [],
  onCommit,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onDiscardFile,
  onDiscardAll,
  onPush,
  onFetch,
  onOpenFileByPath,
  onOpenDiffView
}) => {
  const t = useTranslation();
  const [hunkEditor,setHunkEditor]=useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ filename: string; isStaged: boolean } | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<{ filename?: string; isAll?: boolean; isUntracked?: boolean } | null>(null);
  const [isDiffExpanded, setIsDiffExpanded] = useState(true);
  const cancelling = useRef(false);

  const totalChanges = stagedFiles.length + unstagedFiles.length;

  const activeFile = selectedFile || (
    stagedFiles.length > 0 ? { filename: stagedFiles[0].filename, isStaged: true } :
    unstagedFiles.length > 0 ? { filename: unstagedFiles[0].filename, isStaged: false } :
    null
  );

  const activeDiff = activeFile ? diffs.find(d => d.filename === activeFile.filename && d.isStaged === activeFile.isStaged) : null;

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || stagedFiles.length === 0) return;
    setIsCommitting(true);
    try {
      await onCommit(commitMessage.trim());
      setCommitMessage('');
    } catch (error) { console.error(error); } finally { setIsCommitting(false); }
  };

  const handleFetch = async () => {
    setIsFetching(true);
    try { if (onFetch) await onFetch(); } catch (error) { console.error(error); } finally { setIsFetching(false); }
  };

  const handlePush = async () => {
    setIsPushing(true);
    try { if (onPush) await onPush(); } catch (error) { console.error(error); } finally { setIsPushing(false); }
  };

  const executeDiscard = async () => {
    if (!confirmDiscard) return;
    const target = { ...confirmDiscard };
    setConfirmDiscard(null);
    try {
      if (target.isAll) {
        await onDiscardAll();
      } else if (target.filename) {
        await onDiscardFile(target.filename, !!target.isUntracked);
      }
    } catch (err) {
      console.error('Error discarding file:', err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmDiscard) {
        setConfirmDiscard(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDiscard]);

  const handleFileClick = (filename: string, isStaged: boolean) => {
    setSelectedFile({ filename, isStaged });
    if (onOpenFileByPath) {
      onOpenFileByPath(filename);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none overflow-y-auto p-3 space-y-4">
      {hunkEditor&&repositoryPath&&activeFile&&<GitHunkEditor root={repositoryPath} filename={activeFile.filename} staged={activeFile.isStaged} onClose={()=>setHunkEditor(false)} onChanged={()=>onRepositoryChanged?.()}/>}
      {repositoryPath&&activeFile&&<button className="text-xs text-fruit-accent" onClick={()=>setHunkEditor(true)}>{t("Gestisci hunk del file selezionato")}</button>}
      {/* Branch & Sync Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-fruit-border/60">
        <div className="flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5 text-fruit-accent" />
          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-fruit-surface border border-fruit-border text-fruit-accent font-semibold">
            {branch}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleFetch}
            disabled={isFetching || isPushing}
            className="p-1 rounded hover:bg-fruit-surface text-fruit-textMuted hover:text-fruit-accent transition-colors"
            title={t("Fetch modifiche remote")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-fruit-accent' : ''}`} />
          </button>
          <button
            onClick={handlePush}
            disabled={isFetching || isPushing}
            className="p-1 rounded hover:bg-fruit-surface text-fruit-textMuted hover:text-fruit-accent transition-colors"
            title={t("Push commit verso il server")}
          >
            <ArrowUp className={`w-3.5 h-3.5 ${isPushing ? 'animate-bounce text-fruit-accent' : ''}`} />
          </button>
          {(isFetching || isPushing) && <button className="px-2 text-xs text-fruit-syntaxCoral" onClick={async () => {
            if (cancelling.current) return;
            cancelling.current = true;
            try { await (window as any).openfruitApi?.cancelGitOperation?.(isPushing ? 'push' : 'fetch'); }
            finally { cancelling.current = false; }
          }}>{t("Interrompi Git")}</button>}
        </div>
      </div>

      {/* Commit Input Area */}
      <form onSubmit={handleCommitSubmit} className="space-y-2 p-3 rounded-xl bg-fruit-surface/70 border border-fruit-border">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-syne font-semibold text-fruit-text">{t("Messaggio")}</span>
          <span className="font-mono text-[10px] text-fruit-accent">
            {stagedFiles.length > 0 ? `${stagedFiles.length} staged` : totalChanges > 0 ? t("{0} modifiche", [totalChanges]) : 'Pulito'}
          </span>
        </div>
        <textarea
          value={commitMessage}
          onChange={e => setCommitMessage(e.target.value)}
          rows={2}
          placeholder={totalChanges > 0 ? t("Descrivi le modifiche...") : t("Nessuna modifica da committare")}
          disabled={totalChanges === 0}
          className="w-full px-2.5 py-1.5 rounded-lg bg-fruit-bg border border-fruit-border focus:border-fruit-accent disabled:opacity-50 text-fruit-text font-syne text-xs outline-none resize-none transition-all"
        />
        <button
          type="submit"
          disabled={!commitMessage.trim() || stagedFiles.length === 0 || isCommitting}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-fruit-accent hover:bg-fruit-accentHover disabled:opacity-40 text-fruit-accentDark font-syne font-bold text-xs shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="truncate">
            {isCommitting ? 'Commit...' : stagedFiles.length > 0 ? `Commit (${stagedFiles.length} staged)` : t("Aggiungi file allo stage")}
          </span>
        </button>
      </form>

      {/* STAGED CHANGES */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-syne font-bold text-[11px] text-fruit-text uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3 text-fruit-accent" />
              <span>Staged Changes</span>
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-fruit-accent/20 text-fruit-accent font-bold">
              {stagedFiles.length}
            </span>
          </div>
          {stagedFiles.length > 0 && (
            <button
              type="button"
              onClick={onUnstageAll}
              className="flex items-center gap-0.5 text-[10px] font-mono text-fruit-textMuted hover:text-fruit-syntaxCoral px-1.5 py-0.5 rounded hover:bg-fruit-surface transition-colors"
              title={t("Rimuovi tutti dallo staging")}
            >
              <Minus className="w-3 h-3" />
              <span>{t("Unstage tutti")}</span>
            </button>
          )}
        </div>

        {stagedFiles.length === 0 ? (
          <div className="px-2.5 py-2 rounded-lg bg-fruit-bg/40 border border-dashed border-fruit-border text-[11px] text-fruit-textDim font-syne leading-tight">
            {t("Nessun file in staging. Premi")} <span className="font-mono text-fruit-accent font-bold">+</span> {t("su un file per prepararlo.")}
          </div>
        ) : (
          <div className="space-y-1">
            {stagedFiles.map(file => {
              const isSelected = activeFile?.filename === file.filename && activeFile?.isStaged === true;
              return (
                <div
                  key={`staged-${file.filename}`}
                  onClick={() => handleFileClick(file.filename, true)}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs font-mono ${
                    isSelected
                      ? 'bg-fruit-surfaceHover border border-fruit-accent/50 text-fruit-text'
                      : 'bg-fruit-surface/50 border border-fruit-border/50 hover:border-fruit-border text-fruit-textMuted'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-3.5 h-3.5 text-fruit-accent shrink-0" />
                    <span className="truncate">{file.filename}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                      file.status === 'modified' ? 'bg-[#3E4935] text-fruit-accent' :
                      file.status === 'added' ? 'bg-[#30442F] text-emerald-300' : 'bg-[#49352F] text-fruit-syntaxCoral'
                    }`}>
                      {file.status === 'modified' ? 'MOD' : file.status === 'added' ? 'ADD' : 'DEL'}
                    </span>
                    {onOpenDiffView && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDiffView(file.filename,true);
                        }}
                        className="p-0.5 rounded hover:bg-fruit-bg text-fruit-textDim hover:text-fruit-accent transition-colors"
                        title={t("Apri confronto a due colonne (Side-by-Side Diff)")}
                      >
                        <GitCompare className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnstageFile(file.filename);
                      }}
                      className="p-0.5 rounded hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-syntaxCoral transition-colors"
                      title={t("Unstage file")}
                    >
                      <Minus className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* UNSTAGED CHANGES */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-syne font-bold text-[11px] text-fruit-text uppercase tracking-wider flex items-center gap-1">
              <FileDiff className="w-3 h-3 text-fruit-textMuted" />
              <span>Changes</span>
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-fruit-surface text-fruit-textMuted font-bold border border-fruit-border">
              {unstagedFiles.length}
            </span>
          </div>

          {unstagedFiles.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirmDiscard({ isAll: true })}
                className="flex items-center gap-0.5 text-[10px] font-mono text-fruit-textMuted hover:text-fruit-syntaxCoral px-1.5 py-0.5 rounded hover:bg-fruit-surface transition-colors"
                title={t("Annulla tutte le modifiche (Discard All)")}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t("Annulla")}</span>
              </button>
              <button
                type="button"
                onClick={onStageAll}
                className="flex items-center gap-0.5 text-[10px] font-mono text-fruit-accent hover:text-fruit-accentHover px-1.5 py-0.5 rounded hover:bg-fruit-surface transition-colors font-bold"
                title={t("Stage tutti")}
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                <span>Stage</span>
              </button>
            </div>
          )}
        </div>

        {unstagedFiles.length === 0 ? (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-fruit-bg/40 border border-fruit-border text-[11px] text-fruit-textDim font-syne">
            <CheckCircle2 className="w-3.5 h-3.5 text-fruit-accent" />
            <span>{t("Nessuna modifica nell'area di lavoro.")}</span>
          </div>
        ) : (
          <div className="space-y-1">
            {unstagedFiles.map(file => {
              const isSelected = activeFile?.filename === file.filename && activeFile?.isStaged === false;
              const isUntracked = file.status === 'untracked';
              return (
                <div
                  key={`unstaged-${file.filename}`}
                  onClick={() => handleFileClick(file.filename, false)}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs font-mono ${
                    isSelected
                      ? 'bg-fruit-surfaceHover border border-fruit-accent/50 text-fruit-text'
                      : 'bg-fruit-surface/50 border border-fruit-border/50 hover:border-fruit-border text-fruit-textMuted'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-3.5 h-3.5 text-fruit-textMuted shrink-0" />
                    <span className="truncate">{file.filename}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                      isUntracked ? 'bg-[#3A3E36] text-amber-300' :
                      file.status === 'modified' ? 'bg-[#3E4935] text-fruit-accent' :
                      file.status === 'added' ? 'bg-[#30442F] text-emerald-300' : 'bg-[#49352F] text-fruit-syntaxCoral'
                    }`}>
                      {isUntracked ? 'UNT' : file.status === 'modified' ? 'MOD' : file.status === 'added' ? 'ADD' : 'DEL'}
                    </span>

                    {onOpenDiffView && !isUntracked && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDiffView(file.filename,false);
                        }}
                        className="p-0.5 rounded hover:bg-fruit-bg text-fruit-textDim hover:text-fruit-accent transition-colors"
                        title={t("Apri confronto a due colonne (Side-by-Side Diff)")}
                      >
                        <GitCompare className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDiscard({ filename: file.filename, isUntracked });
                      }}
                      className="p-0.5 rounded hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-syntaxCoral transition-colors"
                      title={isUntracked ? t("Elimina file") : t("Annulla modifiche")}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStageFile(file.filename);
                      }}
                      className="p-0.5 rounded hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-accent transition-colors"
                      title={t("Stage file")}
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DIFF PREVIEW */}
      {activeDiff && activeDiff.diffLines && activeDiff.diffLines.length > 0 && (
        <div className="border border-fruit-border/70 rounded-xl overflow-hidden bg-fruit-card">
          <button
            type="button"
            onClick={() => setIsDiffExpanded(!isDiffExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-fruit-surface/80 text-[11px] font-syne font-semibold text-fruit-text hover:bg-fruit-surface transition-colors"
          >
            <span className="truncate">
              Diff: <span className="font-mono text-fruit-accent">{activeDiff.filename}</span>
            </span>
            {isDiffExpanded ? <ChevronDown className="w-3 h-3 text-fruit-textDim" /> : <ChevronRight className="w-3 h-3 text-fruit-textDim" />}
          </button>

          {isDiffExpanded && (
            <div className="max-h-44 overflow-y-auto divide-y divide-fruit-border/30 font-mono text-[10px] leading-tight p-1 bg-fruit-bg/80">
              {activeDiff.diffLines.map((line, idx) => {
                const isAdded = line.type === 'added';
                const isRemoved = line.type === 'removed';
                return (
                  <div
                    key={idx}
                    className={`flex items-start px-1.5 py-0.5 ${
                      isAdded ? 'bg-fruit-diffGreen/40 text-emerald-300' :
                      isRemoved ? 'bg-fruit-diffRed/40 text-fruit-syntaxCoral' :
                      'text-fruit-textMuted'
                    }`}
                  >
                    <span className="w-6 text-right pr-1 text-fruit-textDim select-none text-[9px]">
                      {line.oldLineNumber || line.newLineNumber || ''}
                    </span>
                    <span className="w-3 select-none text-center font-bold">
                      {isAdded ? '+' : isRemoved ? '-' : ' '}
                    </span>
                    <span className="flex-1 whitespace-pre pl-0.5 truncate">{line.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* COMMIT HISTORY */}
      <div className="border-t border-fruit-border/60 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-syne font-bold text-[11px] text-fruit-text uppercase tracking-wider">
            {t("Cronologia commit")}
          </span>
          <span className="font-mono text-[10px] text-fruit-textDim">
            {commits.length} commit
          </span>
        </div>

        {commits.length === 0 ? (
          <div className="text-[11px] font-syne text-fruit-textDim p-2.5 rounded-lg bg-fruit-bg/40 border border-fruit-border text-center">
            {t("Nessun commit registrato.")}
          </div>
        ) : (
          <div className="space-y-1.5">
            {commits.map(c => repositoryPath && onOpenCommitComparison ? <CommitHistoryEntry key={c.hash} root={repositoryPath} commit={c} onOpenComparison={onOpenCommitComparison}/> : <div key={c.hash} className="p-2 text-xs text-fruit-textMuted">{c.message} · {c.hash.slice(0,8)}</div>)}
          </div>
        )}
      </div>

      {/* Discard Confirmation Modal rendered via Portal onto document.body */}
      {confirmDiscard && createPortal(
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmDiscard(null);
            }
          }}
          role="dialog" aria-modal="true" aria-label={t("Conferma ripristino Git")} className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-fruit-surface border border-fruit-border p-5 shadow-luxury space-y-3"
          >
            <div className="flex items-center gap-2.5 text-fruit-syntaxCoral">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-syne font-bold text-sm text-fruit-text">
                {confirmDiscard.isAll ? t("Annullare tutte le modifiche?") : t("Annullare modifiche del file?")}
              </h3>
            </div>
            <p className="text-xs text-fruit-textMuted font-syne leading-relaxed">
              {confirmDiscard.isAll
                ? t("Tutte le modifiche non preparate verranno scartate in modo irreversibile.")
                : t("Sei sicuro di voler ripristinare \"{0}\" allo stato dell'ultimo commit?", [confirmDiscard.filename])}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(null)}
                className="px-3 py-1.5 rounded-lg bg-fruit-bg hover:bg-fruit-surfaceHover border border-fruit-border text-xs font-syne text-fruit-text transition-colors"
              >
                {t("Annulla")}
              </button>
              <button
                type="button"
                onClick={executeDiscard}
                className="px-3 py-1.5 rounded-lg bg-fruit-syntaxCoral hover:bg-rose-600 text-white font-syne font-semibold text-xs shadow-subtle transition-colors"
              >
                {t("Scarta modifiche")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
