import { useTranslation } from '../localization';
import {useDialog} from '../hooks/useDialog';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Command, X 
} from 'lucide-react';
import { FileNode } from '../types';

export interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  initialMode?: 'files' | 'commands';
  onClose: () => void;
  fileTree: FileNode;
  onOpenFile: (file: FileNode) => void;
  commands: CommandItem[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  initialMode = 'files',
  onClose,
  fileTree,
  onOpenFile,
  commands
}) => {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const container=useRef<HTMLDivElement>(null);
  useDialog(isOpen,container,onClose);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialMode === 'commands' ? '>' : '');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [isOpen, onClose]);

  // Flatten file tree to list of files
  const allFiles = useMemo(() => {
    const list: FileNode[] = [];
    const traverse = (node: FileNode) => {
      if (node.type === 'file') {
        list.push(node);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    traverse(fileTree);
    return list;
  }, [fileTree]);

  const isCommandMode = query.startsWith('>');
  const searchFilter = isCommandMode ? query.substring(1).trim().toLowerCase() : query.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (isCommandMode) {
      return commands
        .filter(c => c.title.toLowerCase().includes(searchFilter) || c.category.toLowerCase().includes(searchFilter))
        .map(c => ({
          type: 'command' as const,
          id: c.id,
          title: c.title,
          subtitle: c.category,
          shortcut: c.shortcut,
          icon: c.icon,
          action: c.action
        }));
    } else {
      return allFiles
        .filter(f => f.name.toLowerCase().includes(searchFilter) || f.path.toLowerCase().includes(searchFilter))
        .slice(0, 30)
        .map(f => ({
          type: 'file' as const,
          id: f.id,
          title: f.name,
          subtitle: f.path,
          shortcut: undefined,
          icon: (
            <div className={`w-4 h-4 rounded text-[9px] font-mono font-bold flex items-center justify-center shrink-0 ${
              f.name.endsWith('.swift') ? 'bg-orange-600/25 text-orange-400' :
              f.name.endsWith('.plist') ? 'bg-blue-600/25 text-blue-400' :
              f.name.endsWith('.xcassets') ? 'bg-purple-600/25 text-purple-400' :
              'bg-fruit-surface text-fruit-textDim'
            }`}>
              {f.name.endsWith('.swift') ? 'S' : f.name.endsWith('.plist') ? 'P' : 'F'}
            </div>
          ),
          action: () => onOpenFile(f)
        }));
    }
  }, [isCommandMode, searchFilter, commands, allFiles, onOpenFile]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(filteredItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(filteredItems.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={container} role="dialog" aria-modal="true" aria-label={t("Palette comandi")}
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-24 p-4 bg-black/70 backdrop-blur-xs select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-fruit-surface border border-fruit-border shadow-luxury overflow-hidden flex flex-col max-h-[480px] animate-scaleUp">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-fruit-border/70 bg-fruit-bg">
          {isCommandMode ? (
            <Command className="w-4 h-4 text-fruit-accent shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-fruit-textDim shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isCommandMode ? t("Digita un comando...") : t("Cerca file nel progetto... (digita '>' per i comandi)")}
            className="w-full bg-transparent font-syne text-xs text-fruit-text placeholder:text-fruit-textDim outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-0.5 rounded text-fruit-textDim hover:text-fruit-text text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs font-syne text-fruit-textDim">
              {t("Nessun risultato trovato per \"")}{query}"
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-colors ${
                    isSelected 
                      ? 'bg-fruit-surfaceHover border border-fruit-accent/30 text-fruit-text' 
                      : 'text-fruit-textMuted hover:text-fruit-text'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {item.icon}
                    <div className="truncate flex items-baseline gap-2">
                      <span className="font-syne font-medium text-fruit-text">{item.title}</span>
                      <span className="font-mono text-[10px] text-fruit-textDim truncate">{item.subtitle}</span>
                    </div>
                  </div>

                  {item.shortcut && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-fruit-bg border border-fruit-border text-fruit-textDim shrink-0 ml-2">
                      {item.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Hint Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-fruit-border/40 bg-fruit-bg/80 text-[10px] font-mono text-fruit-textDim">
          <div className="flex items-center gap-3">
            <span>{t("↑↓ Naviga")}</span>
            <span>{t("↵ Seleziona")}</span>
            <span>{t("ESC Chiudi")}</span>
          </div>
          <div>
            {isCommandMode ? t("Modalità Comandi") : t("Digita '>' per Comandi")}
          </div>
        </div>
      </div>
    </div>
  );
};
