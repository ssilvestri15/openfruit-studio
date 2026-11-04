import { useTranslation } from '../localization';
import React from 'react';
import { 
  FilePlus, FolderPlus, Edit3, Trash2, Copy, ExternalLink 
} from 'lucide-react';
import { FileNode } from '../types';

interface ContextMenuProps {
  x: number;
  y: number;
  targetNode: FileNode | null;
  onClose: () => void;
  onNewFile: (targetFolder?: FileNode) => void;
  onNewFolder: (targetFolder?: FileNode) => void;
  onRename: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  targetNode,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete
}) => {
  const t = useTranslation();
  if (!targetNode) return null;

  const isFolder = targetNode.type === 'folder';

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div
        style={{ top: Math.min(y, window.innerHeight - 250), left: Math.min(x, window.innerWidth - 220) }}
        className="fixed z-50 w-56 bg-fruit-surface border border-fruit-border rounded-xl shadow-popup py-1.5 text-xs font-syne select-none animate-fadeIn"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Node Name */}
        <div className="px-3 py-1 font-mono text-[10px] text-fruit-accent truncate border-b border-fruit-border/60 mb-1">
          {targetNode.name}
        </div>

        {/* Nuovo file (se è cartella, crea direttamente dentro quella cartella) */}
        <button
          onClick={() => {
            onNewFile(isFolder ? targetNode : undefined);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-fruit-surfaceHover text-fruit-text transition-colors"
        >
          <FilePlus className="w-3.5 h-3.5 text-fruit-accent" />
          <span>{isFolder ? t("Nuovo file in {0}...", [targetNode.name]) : t("Nuovo file...")}</span>
        </button>

        {/* Nuova cartella */}
        <button
          onClick={() => {
            onNewFolder(isFolder ? targetNode : undefined);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-fruit-surfaceHover text-fruit-text transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5 text-fruit-textMuted" />
          <span>{t("Nuova cartella...")}</span>
        </button>

        <div className="my-1 border-t border-fruit-border/60" />

        {/* Rinomina */}
        <button
          onClick={() => {
            onRename(targetNode);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-fruit-surfaceHover text-fruit-text transition-colors"
        >
          <Edit3 className="w-3.5 h-3.5 text-fruit-textMuted" />
          <span>{isFolder ? t("Rinomina cartella...") : t("Rinomina classe / file...")}</span>
        </button>

        {/* Copia percorso */}
        <button
          onClick={() => {
            navigator.clipboard.writeText(targetNode.path);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-fruit-surfaceHover text-fruit-text transition-colors"
        >
          <Copy className="w-3.5 h-3.5 text-fruit-textMuted" />
          <span>{t("Copia percorso")}</span>
        </button>

        {/* Mostra in esplora file */}
        <button
          onClick={() => {
            (window as any).openfruitApi?.revealPath(targetNode.path).catch(console.error);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-fruit-surfaceHover text-fruit-text transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-fruit-textMuted" />
          <span>{t("Mostra in Esplora file")}</span>
        </button>

        <div className="my-1 border-t border-fruit-border/60" />

        {/* Elimina permanentemente */}
        <button
          onClick={() => {
            onDelete(targetNode);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-fruit-diffRed/40 text-fruit-syntaxCoral transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{t("Sposta nel cestino...")}</span>
        </button>
      </div>
    </>
  );
};
