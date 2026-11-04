import { useTranslation } from '../localization';
import React, { useState, useEffect, useRef } from 'react';
import { 
  X, ChevronUp, ChevronDown, CaseSensitive, 
  WholeWord, Regex } from 'lucide-react';

interface FindReplaceBarProps {
  documentVersion?: string;
  isOpen: boolean;
  mode: 'find' | 'replace';
  onClose: () => void;
  onFind: (query: string, options: { caseSensitive: boolean; wholeWord: boolean; isRegex: boolean }) => void;
  onReplace: (replacement: string) => void;
  onReplaceAll: (replacement: string) => void;
  onNext: () => void;
  onPrev: () => void;
  matchCount: number;
  currentMatchIndex: number;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  documentVersion,
  isOpen,
  mode,
  onClose,
  onFind,
  onReplace,
  onReplaceAll,
  onNext,
  onPrev,
  matchCount,
  currentMatchIndex
}) => {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);

  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mode]);

  useEffect(() => {
    if (isOpen) onFind(query, { caseSensitive, wholeWord, isRegex });
  }, [query, caseSensitive, wholeWord, isRegex, isOpen, onFind, documentVersion]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-3 right-6 z-30 w-[480px] bg-fruit-surface border border-fruit-border rounded-xl shadow-popup p-3 select-none animate-fadeIn font-syne text-xs">
      {/* Row 1: Find Input + Controls + Navigation */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center bg-fruit-bg border border-fruit-border focus-within:border-fruit-accent rounded-lg px-2.5 py-1.5 transition-colors">
          <input
            ref={findInputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (e.shiftKey) onPrev();
                else onNext();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder={t("Trova...")}
            className="w-full bg-transparent text-fruit-text font-mono text-xs outline-none"
          />
          {query && (
            <span className="text-[10px] font-mono text-fruit-textDim ml-2 whitespace-nowrap">
              {matchCount > 0 ? t("{0} di {1}", [currentMatchIndex + 1, matchCount]) : t("Nessuna corrispondenza")}
            </span>
          )}
        </div>

        {/* Options Toggles */}
        <div className="flex items-center gap-0.5 bg-fruit-bg border border-fruit-border rounded-lg p-0.5">
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`p-1 rounded text-xs transition-colors ${
              caseSensitive ? 'bg-fruit-accent text-fruit-accentDark font-bold' : 'text-fruit-textDim hover:text-fruit-text'
            }`}
            title={t("Maiuscole/minuscole esatte (Alt+C)")}
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setWholeWord(!wholeWord)}
            className={`p-1 rounded text-xs transition-colors ${
              wholeWord ? 'bg-fruit-accent text-fruit-accentDark font-bold' : 'text-fruit-textDim hover:text-fruit-text'
            }`}
            title={t("Parola intera (Alt+W)")}
          >
            <WholeWord className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsRegex(!isRegex)}
            className={`p-1 rounded text-xs transition-colors ${
              isRegex ? 'bg-fruit-accent text-fruit-accentDark font-bold' : 'text-fruit-textDim hover:text-fruit-text'
            }`}
            title={t("Espressione regolare (Alt+R)")}
          >
            <Regex className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Prev & Next */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={onPrev}
            disabled={matchCount === 0}
            className="p-1.5 rounded-lg bg-fruit-bg hover:bg-fruit-surfaceHover border border-fruit-border text-fruit-textMuted hover:text-fruit-text disabled:opacity-40 transition-colors"
            title={t("Precedente (Shift+Enter)")}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onNext}
            disabled={matchCount === 0}
            className="p-1.5 rounded-lg bg-fruit-bg hover:bg-fruit-surfaceHover border border-fruit-border text-fruit-textMuted hover:text-fruit-text disabled:opacity-40 transition-colors"
            title={t("Successivo (Enter)")}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-fruit-bg text-fruit-textDim hover:text-fruit-text transition-colors"
          title={t("Chiudi (Esc)")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 2: Replace Input & Buttons (Shown if mode === 'replace') */}
      {mode === 'replace' && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-fruit-border/60 animate-fadeIn">
          <div className="flex-1 bg-fruit-bg border border-fruit-border focus-within:border-fruit-accent rounded-lg px-2.5 py-1.5 transition-colors">
            <input
              type="text"
              value={replacement}
              onChange={e => setReplacement(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onReplace(replacement);
              }}
              placeholder={t("Sostituisci con...")}
              className="w-full bg-transparent text-fruit-text font-mono text-xs outline-none"
            />
          </div>

          <button
            onClick={() => onReplace(replacement)}
            disabled={matchCount === 0}
            className="px-2.5 py-1.5 rounded-lg bg-fruit-bg hover:bg-fruit-surfaceHover border border-fruit-border text-xs font-syne text-fruit-text hover:text-fruit-accent disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {t("Sostituisci")}
          </button>
          <button
            onClick={() => onReplaceAll(replacement)}
            disabled={matchCount === 0}
            className="px-2.5 py-1.5 rounded-lg bg-fruit-accent hover:bg-fruit-accentHover text-fruit-accentDark font-syne font-bold text-xs disabled:opacity-40 shadow-sm transition-colors whitespace-nowrap"
          >
            {t("Tutti")}
          </button>
        </div>
      )}
    </div>
  );
};
