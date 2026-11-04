import { useTranslation } from '../localization';
import {OperationReportViewer} from './OperationReportViewer';
import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal as TerminalIcon, AlertTriangle, AlertCircle, Bug, FileText, 
  Trash2, X, CheckCircle2, Plus 
} from 'lucide-react';
import { LogLine, ProblemItem } from '../types';

const InteractiveTerminal = React.lazy(() => import('./InteractiveTerminal').then(module => ({ default: module.InteractiveTerminal })));

interface BottomPanelProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogLine[];
  onClearLogs: () => void;
  projectName: string;
  projectPath?: string;
  problems?: ProblemItem[];
  onSelectProblem?: (problem: ProblemItem) => void;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  isOpen,
  onClose,
  logs,
  onClearLogs,
  projectPath = '',
  problems = [],
  onSelectProblem
}) => {
  const t = useTranslation();
  const [showReports,setShowReports]=useState(false),[outputFilter,setOutputFilter]=useState('');
  const [activeTab, setActiveTab] = useState<'terminal' | 'output' | 'problems' | 'debug'>('terminal');
  
  // Multi-terminal tabs
  const [terminals, setTerminals] = useState<Array<{ id: string; name: string }>>([
    {
      id: 'term-1',
      name: 'PowerShell 1'
    }
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState('term-1');
  const nextTerminalNumber = useRef(2);
  const lastOutputCommand = useRef<string>();
  const lastOutputError = useRef<string>();

  const activeTerminal = terminals.find(t => t.id === activeTerminalId) || terminals[0];
  useEffect(() => {
    const latest = logs.at(-1);
    if (latest?.type === 'stderr' && latest.id !== lastOutputError.current) {
      lastOutputError.current = latest.id;
      setActiveTab('output');
    }
    const command = [...logs].reverse().find(log => log.type === 'command');
    if (command && command.id !== lastOutputCommand.current) {
      lastOutputCommand.current = command.id;
      setActiveTab('output');
    }
  }, [logs]);



  const handleAddTerminal = () => {
    if (terminals.length >= 10) return;
    const newId = `term-${crypto.randomUUID()}`;
    const newNum = nextTerminalNumber.current++;
    const newTerm = {
      id: newId,
      name: `PowerShell ${newNum}`
    };
    setTerminals(prev => [...prev, newTerm]);
    setActiveTerminalId(newId);
  };

  const handleCloseTerminal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (terminals.length === 1) return;
    const filtered = terminals.filter(t => t.id !== id);
    setTerminals(filtered);
    if (activeTerminalId === id) {
      setActiveTerminalId(filtered[0].id);
    }
  };

  const errorsCount = problems.filter(p => p.severity === 'error').length;
  const warningsCount = problems.filter(p => p.severity === 'warning').length;

  return (
    <footer style={{ display: isOpen ? undefined : 'none' }} className="h-48 bg-fruit-surface border-t border-fruit-border flex flex-col select-none animate-slideUp font-mono text-xs">
      {showReports && <OperationReportViewer root={projectPath} onClose={()=>setShowReports(false)} />}
      {/* Tab Header Bar */}
      <div className="h-9 bg-fruit-bg border-b border-fruit-border flex items-center justify-between px-2 select-none">
        <div className="flex items-center gap-1">
          {/* Terminal Tab */}
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-syne text-xs transition-all ${
              activeTab === 'terminal'
                ? 'bg-fruit-editor text-fruit-text font-semibold shadow-sm'
                : 'text-fruit-textMuted hover:text-fruit-text hover:bg-fruit-surface/60'
            }`}
          >
            <TerminalIcon className={`w-3.5 h-3.5 ${activeTab === 'terminal' ? 'text-fruit-accent' : 'text-fruit-textDim'}`} />
            <span>{t("Terminale")}</span>
            {terminals.length > 1 && (
              <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-fruit-bg border border-fruit-border text-fruit-textDim">
                {terminals.length}
              </span>
            )}
          </button>

          {/* Output Tab */}
          <button
            onClick={() => setActiveTab('output')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-syne text-xs transition-all ${
              activeTab === 'output'
                ? 'bg-fruit-editor text-fruit-text font-semibold shadow-sm'
                : 'text-fruit-textMuted hover:text-fruit-text hover:bg-fruit-surface/60'
            }`}
          >
            <FileText className={`w-3.5 h-3.5 ${activeTab === 'output' ? 'text-fruit-accent' : 'text-fruit-textDim'}`} />
            <span>Output</span>
          </button>

          {/* Problemi Tab (Real LSP Compiler Diagnostics) */}
          <button
            onClick={() => setActiveTab('problems')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-syne text-xs transition-all ${
              activeTab === 'problems'
                ? 'bg-fruit-editor text-fruit-text font-semibold shadow-sm'
                : 'text-fruit-textMuted hover:text-fruit-text hover:bg-fruit-surface/60'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${errorsCount > 0 ? 'text-fruit-syntaxCoral' : warningsCount > 0 ? 'text-amber-400' : 'text-fruit-textDim'}`} />
            <span>{t("Problemi")}</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded font-bold ${
              errorsCount > 0 ? 'bg-rose-950/80 border border-rose-800 text-rose-300' :
              warningsCount > 0 ? 'bg-amber-950/80 border border-amber-800 text-amber-300' :
              'bg-fruit-bg border border-fruit-border text-fruit-textDim'
            }`}>
              {problems.length}
            </span>
          </button>

          {/* Console Debug Tab */}
          <button
            onClick={() => setActiveTab('debug')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-syne text-xs transition-all ${
              activeTab === 'debug'
                ? 'bg-fruit-editor text-fruit-text font-semibold shadow-sm'
                : 'text-fruit-textMuted hover:text-fruit-text hover:bg-fruit-surface/60'
            }`}
          >
            <Bug className="w-3.5 h-3.5 text-fruit-syntaxPurple" />
            <span>Debug LLDB</span>
          </button>
        </div>

        <button onClick={()=>setShowReports(true)} className="text-xs text-fruit-accent">Report</button>
        {/* Clear & Close Buttons */}
        <div className="flex items-center gap-1.5 pr-1">
          <button
            onClick={onClearLogs}
            className="p-1 rounded-md hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-text transition-colors"
            title={t("Pulisci log")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-text transition-colors"
            title={t("Nascondi pannello inferiore")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-bar for Terminals when in Terminal tab */}
      {activeTab === 'terminal' && (
        <div className="h-7 bg-fruit-surface border-b border-fruit-border/60 flex items-center justify-between px-3">
          <div className="flex items-center gap-1 overflow-x-auto">
{terminals.map(term => {
              const isTermActive = term.id === activeTerminal.id;
              return (
                <div
                  key={term.id}
                  onClick={() => setActiveTerminalId(term.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
                    isTermActive
                      ? 'bg-fruit-bg text-fruit-accent font-semibold border border-fruit-border'
                      : 'text-fruit-textDim hover:text-fruit-text'
                  }`}
                >
                  <TerminalIcon className="w-3 h-3" />
                  <span title={t("Doppio clic per rinominare")} onDoubleClick={()=>{const name=prompt(t("Nome terminale"),term.name);if(name?.trim())setTerminals(current=>current.map(t=>t.id===term.id?{...t,name:name.trim().slice(0,80)}:t));}}>{term.name}</span>
                  {terminals.length > 1 && (
                    <button
                      onClick={(e) => handleCloseTerminal(e, term.id)}
                      className="p-0.5 rounded hover:bg-fruit-surface text-fruit-textDim hover:text-fruit-syntaxCoral"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              onClick={handleAddTerminal}
              className="p-1 rounded hover:bg-fruit-bg text-fruit-textDim hover:text-fruit-accent transition-colors ml-1"
              title={t("Apri nuova sessione terminale")}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="text-[10px] text-fruit-textDim font-mono">
            {t("Shell interattiva · Ctrl+C per interrompere")}
          </div>
        </div>
      )}

      {/* Panel Content Area */}
      <div className="flex-1 overflow-y-auto p-3 bg-fruit-card/80 text-[11px] leading-relaxed">
        {/* Real Interactive Terminal Tab */}
        <div className="h-full" style={{ display: activeTab === 'terminal' ? 'block' : 'none' }}>
          <React.Suspense fallback={<span>{t("Caricamento terminale...")}</span>}>{terminals.map(term => <InteractiveTerminal key={term.id} id={term.id} cwd={projectPath} visible={activeTab === 'terminal' && activeTerminalId === term.id} />)}</React.Suspense>
        </div>

        {/* Output Tab */}
        {activeTab === 'output' && (
          <div className="space-y-1 font-mono">
<input aria-label={t("Filtra output")} value={outputFilter} onChange={e=>setOutputFilter(e.target.value)} placeholder={t("Filtra output…")} className="w-full bg-fruit-editor border border-fruit-border rounded px-2 py-1 mb-2" />
            {logs.filter(log=>log.text.toLowerCase().includes(outputFilter.toLowerCase())).map(log => (
              <div
                key={log.id}
                className={`${
                  log.type === 'success' ? 'text-emerald-400 font-semibold' :
                  log.type === 'command' ? 'text-fruit-accent font-bold' :
                  log.type === 'stderr' ? 'text-fruit-syntaxCoral' :
                  'text-fruit-textMuted'
                }`}
              >
                {log.text}
                {log.event && (
                  <details className="text-[10px] text-fruit-textDim">
                    <summary className="cursor-pointer">{t("Evento JSON")}</summary>
                    <pre className="whitespace-pre-wrap break-all select-text">{JSON.stringify(log.event, null, 2)}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Problems Tab (Real LSP Compiler Diagnostics) */}
        {activeTab === 'problems' && (
          problems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fruit-textDim">
              <CheckCircle2 className="w-6 h-6 text-fruit-accent mb-2" />
              <span className="font-syne text-xs text-fruit-text font-semibold">{t("Nessun problema rilevato nel workspace")}</span>
              <span className="text-[10px] mt-0.5">{t("Diagnostica ricevuta da OpenFruit e SourceKit-LSP.")}</span>
            </div>
          ) : (
            <div className="space-y-1">
              {problems.map(prob => (
                <div
                  key={prob.id}
                  onClick={() => onSelectProblem && onSelectProblem(prob)}
                  className="flex items-center justify-between p-2 rounded-lg bg-fruit-surface/50 border border-fruit-border/60 hover:border-fruit-accent/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    {prob.severity === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-fruit-syntaxCoral shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span className="font-syne text-fruit-text font-medium text-xs">{prob.message}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono text-fruit-textDim">
                    <span>{prob.fileName}</span>
                    <span className="px-1.5 py-0.5 rounded bg-fruit-bg border border-fruit-border">
                      [{prob.line}:{prob.column}]
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Debug LLDB Tab */}
        {activeTab === 'debug' && (
          <div className="space-y-1 font-mono text-fruit-textMuted">
            <p>{t("Il debugger non ha una sessione attiva.")}</p>
            <p className="text-fruit-textDim">{t("Il protocollo di debug IDE non e disponibile nel contratto corrente di OpenFruit.")}</p>
          </div>
        )}
      </div>
    </footer>
  );
};
