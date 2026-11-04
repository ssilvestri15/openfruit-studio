import { useTranslation } from '../localization';
import {ImagePreview} from './ImagePreview';
import {SvgDocumentEditor} from './SvgDocumentEditor';
import {CommitDiffView} from './CommitDiffView';
import {StructuredPlistEditor} from './StructuredPlistEditor';
import type { Preferences } from '../../shared/preferences';
import { defaultPreferences } from '../../shared/preferences';
import { terminalOwnsKeyboard } from '../utils/keyboard';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, ChevronRight, FileCode, Search, Replace, GitCompare 
} from 'lucide-react';
import Editor, { OnMount } from '@monaco-editor/react';
import { SafeDiffEditor } from './SafeDiffEditor';
import { TabItem, type EditorLocation } from '../types';
import { FindReplaceBar } from './FindReplaceBar';
import { registerSwiftLanguageFeatures } from '../utils/swiftLanguage';
import { fileUri, expandReplacement, filePathFromUri, samePath } from '../utils/editorState';
import {fileLanguage} from '../utils/monaco';
import { FileConflictBanner } from './FileConflictBanner';
import type { FileConflict } from '../../shared/files';

interface CenterPanelProps {
  preferences?: Preferences;
  editorLocation?: EditorLocation;
  onReorderTab: (source:string,target:string)=>void;
  onTogglePinned: (id:string)=>void;
  onNavigate: (path:string,line:number,column:number)=>void;
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onContentChange: (id: string, newContent: string) => void;
  projectName: string;
  projectPath: string;
  conflict?: FileConflict;
  conflictBusy?: boolean;
  onMergeConflict: () => void;
  onCompareConflict: () => void;
  onReloadConflict: () => void;
  onSaveConflictCopy: (name: string) => void;
}

export const CenterPanel: React.FC<CenterPanelProps> = ({
  preferences = defaultPreferences,
  editorLocation, onNavigate, onReorderTab, onTogglePinned,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onContentChange,
  projectName,
  projectPath,
  conflict,
  conflictBusy = false,
  onMergeConflict,
  onCompareConflict,
  onReloadConflict,
  onSaveConflictCopy
}) => {
  const t = useTranslation();
  const [splitId,setSplitId]=useState<string>(),[primaryId,setPrimaryId]=useState(activeTabId);
  const focusSide=useRef<'primary'|'secondary'>('primary');
  useEffect(()=>{if(focusSide.current!=='secondary'||activeTabId!==splitId)setPrimaryId(activeTabId);},[activeTabId,splitId]);
  const activeTab = tabs.find(t => t.id === (splitId?primaryId:activeTabId)) || tabs[0];
  const secondaryTab=tabs.find(t=>t.id===splitId&&!t.isDiff&&!t.document),secondaryRef=useRef(secondaryTab);secondaryRef.current=secondaryTab;
  const selectRef=useRef(onSelectTab);selectRef.current=onSelectTab;
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);

  const disposables = useRef<Array<{ dispose: () => void }>>([]);
  const models = useRef(new Set<string>());
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  const contentChangedRef = useRef(onContentChange); contentChangedRef.current = onContentChange;
  useEffect(() => {
    if (!monacoInstance) return;
    const subscriptions = new Map<string, {dispose:()=>void}>();
    const attach = (model:any) => {
      const uri=model.uri.toString(); if(subscriptions.has(uri))return;
      subscriptions.set(uri,model.onDidChangeContent(()=>{
        const tab=tabsRef.current.find(t=>!t.isDiff&&fileUri(t.path)===uri);
        if(tab&&tab.content!==model.getValue())contentChangedRef.current(tab.id,model.getValue());
      }));
    };
    monacoInstance.editor.getModels().forEach(attach);
    const added=monacoInstance.editor.onDidCreateModel(attach);
    return ()=>{added.dispose();subscriptions.forEach(d=>d.dispose());};
  },[monacoInstance]);
  const navigateRef = useRef(onNavigate); navigateRef.current = onNavigate;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Helper to get distinct model URI per file/tab so each has its own isolated undo stack
  const getEditorModelUri = (tab?: TabItem | null): string => {
    if (!tab) return 'inmemory:///default';
    if (tab.path) return fileUri(tab.path);
    return `inmemory:///${tab.id}/${tab.name}`;
  };

  // Close tab and dispose its Monaco model to cleanly reset its undo stack and free memory
  const handleClose = (e: React.MouseEvent, tab: TabItem) => {
    e.stopPropagation();
    onCloseTab(tab.id);
  };

  useEffect(() => () => {
    if (!monacoInstance) return;
    for (const uri of models.current) {
      monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri))?.dispose();
      if(uri.startsWith('file:')) (window as any).openfruitApi?.lspCloseDocument?.(uri).catch(console.error);
    }
  }, [monacoInstance]);

  const matchesRef = useRef<any[]>([]);
  const regexRef = useRef(false);
  const matchIndexRef = useRef(0);
  const requestedLocation = useRef(editorLocation); requestedLocation.current = editorLocation;
  const appliedLocation = useRef<string>();
  const revealLocation = (editor: any) => {
    const location = requestedLocation.current, model = editor.getModel();
    if (!location || !model || appliedLocation.current === location.id || !samePath(filePathFromUri(model.uri.toString()), location.path)) return;
    const line = Math.max(1, Math.min(location.line, model.getLineCount()));
    const column = Math.max(1, Math.min(location.column, model.getLineMaxColumn(line)));
    editor.setPosition({ lineNumber: line, column }); editor.revealPositionInCenter({ lineNumber: line, column }); editor.focus();
    appliedLocation.current = location.id;
  };
  useEffect(() => {
    if (!editorInstance) return;
    const frame = requestAnimationFrame(() => revealLocation(editorInstance));
    return () => cancelAnimationFrame(frame);
  }, [editorInstance, editorLocation, activeTab?.path]);

  // Find & Replace state
  const [structuredPlist,setStructuredPlist]=useState(false);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findMode, setFindMode] = useState<'find' | 'replace'>('find');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Cursor position
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  useEffect(() => {
    if (!monacoInstance) return;
    const current = new Set(tabs.filter(t => !t.isDiff && !t.document).map(getEditorModelUri));
    for (const uri of models.current) if (!current.has(uri)) {
      monacoInstance.editor.getModel(monacoInstance.Uri.parse(uri))?.dispose();
      if(uri.startsWith('file:')) (window as any).openfruitApi?.lspCloseDocument?.(uri).catch(console.error);
    }
    models.current = current;
  }, [tabs, monacoInstance]);

  useEffect(() => () => { disposables.current.forEach(d => d.dispose()); disposables.current = []; }, []);

  useEffect(() => {
    const api = (window as any).openfruitApi;
    if (!activeTab || activeTab.document || !activeTab.path || activeTab.isDiff || !activeTab.name.endsWith('.swift') || !api?.lspInit) return;
    let cancelled = false;
    api.lspInit(projectPath).then(() => {
      const tab = activeTabRef.current;
      if (!cancelled && tab) api.lspOpenDocument(fileUri(tab.path), tab.content);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [activeTab?.path, projectPath]);

  useEffect(() => {
    if (!activeTab || activeTab.document || !activeTab.path || activeTab.isDiff || !activeTab.name.endsWith('.swift')) return;
    const timer = setTimeout(() => {
      (window as any).openfruitApi?.lspChangeDocument?.(fileUri(activeTab.path), activeTab.content).catch(console.error);
    }, 150);
    return () => clearTimeout(timer);
  }, [activeTab?.path, activeTab?.content]);

  // Handle global shortcuts Ctrl+F and Ctrl+H
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTabRef.current?.document || activeTabRef.current?.isDiff || document.querySelector('[aria-modal="true"]') || terminalOwnsKeyboard(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindMode('find');
        setIsFindOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setFindMode('replace');
        setIsFindOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    disposables.current.forEach(d => d.dispose());
    disposables.current = [];
    setEditorInstance(editor);
    setMonacoInstance(monaco);

    disposables.current.push(monaco.editor.registerEditorOpener({openCodeEditor: (_source, resource, selection) => {
      if(resource.scheme!=='file')return false;
      const path=filePathFromUri(resource.toString());
      const line=selection && ('lineNumber' in selection ? selection.lineNumber : selection.startLineNumber) || 1;
      const column=selection && ('column' in selection ? selection.column : selection.startColumn) || 1;
      navigateRef.current(path,line,column);return true;
    }}));
    // Register Rich Swift & SourceKit-LSP IntelliSense
    registerSwiftLanguageFeatures(monaco);

    // Track model change (tab switch)
    disposables.current.push(editor.onDidChangeModel(() => {
      revealLocation(editor);
      const pos = editor.getPosition();
      if (pos) {
        setCursorPos({
          line: pos.lineNumber,
          col: pos.column
        });
      }
    }));

    disposables.current.push(editor.onDidFocusEditorText(()=>{focusSide.current='primary';setEditorInstance(editor);if(activeTabRef.current)selectRef.current(activeTabRef.current.id);}));
    // Track cursor movement
    disposables.current.push(editor.onDidChangeCursorPosition(e => {
      setCursorPos({
        line: e.position.lineNumber,
        col: e.position.column
      });
    }));

    // Handle LSP Diagnostics
    if ((window as any).openfruitApi?.onLspDiagnostics) {
      const unsubscribe = (window as any).openfruitApi.onLspDiagnostics((data: any) => {
        if (!data || !data.uri) return;
        const model = monaco.editor.getModel(monaco.Uri.parse(data.uri));
        if (model) {
          const markers = (data.diagnostics || []).map((diag: any) => ({
            severity: diag.severity === 1 ? monaco.MarkerSeverity.Error : diag.severity === 2 ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
            message: diag.message,
            startLineNumber: (diag.range?.start?.line ?? 0) + 1,
            startColumn: (diag.range?.start?.character ?? 0) + 1,
            endLineNumber: (diag.range?.end?.line ?? 0) + 1,
            endColumn: (diag.range?.end?.character ?? 0) + 1
          }));
          monaco.editor.setModelMarkers(model, 'sourcekit-lsp', markers);
        }
      });
      disposables.current.push({ dispose: unsubscribe });
    }

    // Custom OpenFruit Studio Dark Theme
    monaco.editor.defineTheme('openfruit-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', background: '1F221E', foreground: 'EEEFE5' },
        { token: 'keyword', foreground: 'CBDEAA', fontStyle: 'bold' },
        { token: 'type', foreground: 'ACCBD4' },
        { token: 'string', foreground: 'E0E4D1' },
        { token: 'number', foreground: 'F0EDDF' },
        { token: 'comment', foreground: '707A68', fontStyle: 'italic' },
        { token: 'identifier', foreground: 'EEEFE5' },
        { token: 'delimiter', foreground: 'A4AB9A' }
      ],
      colors: {
        'editor.background': '#1F221E',
        'editor.foreground': '#EEEFE5',
        'editor.lineHighlightBackground': '#252923',
        'editorCursor.foreground': '#CBDEAA',
        'editorLineNumber.foreground': '#50574A',
        'editorLineNumber.activeForeground': '#CBDEAA',
        'editor.selectionBackground': '#3E4935',
        'editor.inactiveSelectionBackground': '#2D302B',
        'editorWidget.background': '#2D302B',
        'editorWidget.border': '#383C34',
        'scrollbarSlider.background': '#383C3480',
        'scrollbarSlider.hoverBackground': '#50574AB0',
        'scrollbarSlider.activeBackground': '#CBDEAA60'
      }
    });

    monaco.editor.setTheme(preferences.theme === 'light' ? 'vs' : 'openfruit-dark');
  };

  const handleFind = useCallback((query: string, options: { caseSensitive: boolean; wholeWord: boolean; isRegex: boolean }) => {
    regexRef.current = options.isRegex;
    const model = editorInstance?.getModel();
    let matches: any[] = [];
    if (model && query) {
      try {
        matches = model.findMatches(query, false, options.isRegex, options.caseSensitive,
          options.wholeWord ? '~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?' : null, true);
      } catch { /* An unfinished regular expression has no matches. */ }
    }
    matchesRef.current = matches;
    matchIndexRef.current = 0;
    setMatchCount(matches.length);
    setCurrentMatchIndex(0);
    if (matches.length) {
      editorInstance.setSelection(matches[0].range);
      editorInstance.revealRangeInCenter(matches[0].range);
    }
  }, [editorInstance]);

  const moveMatch = (offset: number) => {
    const matches = matchesRef.current;
    if (!editorInstance || !matches.length) return;
    const index = (matchIndexRef.current + offset + matches.length) % matches.length;
    matchIndexRef.current = index;
    setCurrentMatchIndex(index);
    editorInstance.setSelection(matches[index].range);
    editorInstance.revealRangeInCenter(matches[index].range);
  };
  const handleNextMatch = () => moveMatch(1);
  const handlePrevMatch = () => moveMatch(-1);

  const handleReplace = (replacement: string) => {
    const match = matchesRef.current[matchIndexRef.current];
    if (!editorInstance || !match) return;
    editorInstance.pushUndoStop();
    editorInstance.executeEdits('openfruit-replace', [{ range: match.range, text: expandReplacement(replacement, regexRef.current ? match.matches : null), forceMoveMarkers: true }]);
    editorInstance.pushUndoStop();
  };
  const handleReplaceAll = (replacement: string) => {
    if (!editorInstance || !matchesRef.current.length) return;
    editorInstance.pushUndoStop();
    editorInstance.executeEdits('openfruit-replace-all', matchesRef.current.map(match => ({ range: match.range, text: expandReplacement(replacement, regexRef.current ? match.matches : null) })));
    editorInstance.pushUndoStop();
  };

  const breadcrumbParts = activeTab 
    ? activeTab.path.split(/[/\\]/) 
    : [projectName, 'ContentView.swift'];

  const sourceEditor = activeTab ? (
<Editor
              path={getEditorModelUri(activeTab)}
              keepCurrentModel
              height="100%"
              language={fileLanguage(activeTab.path || activeTab.name)}
              value={activeTab.content}
              theme={preferences.theme === 'light' ? 'vs' : 'openfruit-dark'}
              onMount={handleEditorDidMount}
              onChange={(val) => {
                if (val !== undefined) {
                  onContentChange(activeTab.id, val);
                }
              }}
              options={{
                fontSize: preferences.fontSize,
                fontFamily: '"JetBrains Mono", Consolas, monospace',
                fontLigatures: true,
                lineHeight: 22,
                tabSize: preferences.tabSize,
                wordWrap: preferences.wordWrap ? 'on' : 'off',
                minimap: { enabled: preferences.minimap, side: 'right', renderCharacters: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderLineHighlight: 'all',
                bracketPairColorization: { enabled: true },
                padding: { top: 12, bottom: 12 }
              }}
            />
  ) : null;

  return (
    <main className="relative flex-1 h-full bg-fruit-editor flex flex-col overflow-hidden select-none">
      {activeTab && conflict && <FileConflictBanner key={activeTab.id} onMerge={activeTab.baseContent !== undefined ? onMergeConflict : undefined} name={activeTab.name} conflict={conflict} busy={conflictBusy}
        onCompare={onCompareConflict} onReload={onReloadConflict} onCopy={onSaveConflictCopy} />}
      {activeTab && /\.(plist|entitlements)$/i.test(activeTab.name) && <div className="px-3 py-1 border-b border-fruit-border text-xs"><button onClick={()=>setStructuredPlist(v=>!v)}>{structuredPlist?t("Mostra sorgente XML"):t("Mostra editor plist")}</button></div>}
      {/* Top Tabs Bar (Minimal & Clean, NO green bar) */}
      <div className="h-9 bg-fruit-bg border-b border-fruit-border flex items-center justify-between px-2 overflow-x-auto select-none">
        <div className="flex items-center gap-1">
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                draggable
                onDragStart={event=>event.dataTransfer.setData('text/x-openfruit-tab',tab.id)}
                onDragOver={event=>{if(event.dataTransfer.types.includes('text/x-openfruit-tab'))event.preventDefault();}}
                onDrop={event=>{event.preventDefault();onReorderTab(event.dataTransfer.getData('text/x-openfruit-tab'),tab.id);}}
                onDoubleClick={()=>onTogglePinned(tab.id)}
                title={tab.pinned?t("Tab fissato · doppio clic per sbloccare"):t("Trascina per riordinare · doppio clic per fissare")}
                onClick={() => {focusSide.current='primary';setPrimaryId(tab.id);onSelectTab(tab.id);}}
                className={`group relative flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-xs font-syne cursor-pointer transition-all ${
                  isActive
                    ? 'bg-fruit-editor text-fruit-text font-semibold shadow-sm'
                    : 'text-fruit-textMuted hover:text-fruit-text hover:bg-fruit-surface/60'
                }`}
              >
                {tab.isDiff ? (
                  <GitCompare className={`w-3.5 h-3.5 ${isActive ? 'text-fruit-accent' : 'text-fruit-syntaxPurple'}`} />
                ) : (
                  <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-fruit-accent' : 'text-fruit-textDim'}`} />
                )}
                <span className="truncate max-w-[130px]">{tab.pinned ? '● ' : ''}{tab.name}</span>
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-fruit-accent animate-pulse" />
                )}
                <button
                  onClick={e => handleClose(e, tab)}
                  className="opacity-0 group-hover:opacity-100 hover:text-fruit-syntaxCoral rounded p-0.5 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Quick Shortcut Pills in Tab bar */}
        <div className="hidden md:flex items-center gap-2 pr-2">
          <button
            onClick={() => {
              if(!activeTab || activeTab.document || activeTab.isDiff)return;
              setFindMode('find');
              setIsFindOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-fruit-surface hover:bg-fruit-surfaceHover border border-fruit-border text-[10px] font-mono text-fruit-textDim hover:text-fruit-text transition-colors"
          >
            <Search className="w-3 h-3" />
            <span>Ctrl+F</span>
          </button>
          <button
            onClick={() => {
              if(!activeTab || activeTab.document || activeTab.isDiff)return;
              setFindMode('replace');
              setIsFindOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-fruit-surface hover:bg-fruit-surfaceHover border border-fruit-border text-[10px] font-mono text-fruit-textDim hover:text-fruit-text transition-colors"
          >
            <Replace className="w-3 h-3" />
            <span>Ctrl+H</span>
          </button>
        </div>
      </div>

      {/* Breadcrumbs Row */}
      <div className="h-7 bg-fruit-surface/30 border-b border-fruit-border/60 px-4 flex items-center justify-between text-xs font-mono text-fruit-textDim select-none">
        <div className="flex items-center gap-1 truncate text-[11px]">
          {breadcrumbParts.map((part, index) => (
            <React.Fragment key={index}>
              <span className={`hover:text-fruit-text cursor-pointer ${index === breadcrumbParts.length - 1 ? 'text-fruit-text font-medium' : ''}`}>
                {part}
              </span>
              {index < breadcrumbParts.length - 1 && (
                <ChevronRight className="w-3 h-3 text-fruit-borderLight flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
          <span className="text-fruit-borderLight">›</span>
          <button className="text-fruit-textMuted text-[11px]" onClick={()=>{focusSide.current='primary';setPrimaryId(activeTabId);setSplitId(splitId?undefined:tabs.find(t=>!t.isDiff&&!t.document&&t.id!==activeTabId)?.id||(!activeTab?.document&&!activeTab?.isDiff?activeTab?.id:undefined));}}>{splitId?t("Chiudi split"):t("Dividi editor")}</button>
          <button disabled={!!activeTab?.document || !!activeTab?.isDiff} className="text-fruit-accent text-[11px] disabled:opacity-40" onClick={() => editorInstance?.trigger('outline', 'editor.action.gotoSymbol', {})}>{t("Simboli…")}</button>
        </div>

        <div className="flex items-center gap-3 text-[10px]">
          <span>{activeTab?.document ? activeTab.document.kind==='image'?activeTab.document.mime:'Binario' : <>UTF-8{activeTab?.content.startsWith('\uFEFF') ? ' BOM' : ''} · {activeTab?.content.includes('\r\n') ? 'CRLF' : 'LF'}</>}</span>
          <span className="text-fruit-borderLight">•</span>
          <span>{activeTab?.name.split('.').at(-1)?.toUpperCase() || 'Testo'}</span>
          <span className="text-fruit-borderLight">•</span>
          {!activeTab?.document && !activeTab?.commitComparison && <span>{t("Riga")} {cursorPos.line}, Col {cursorPos.col}</span>}
        </div>
      </div>

      {/* Editor Area with Floating Find & Replace */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex">
      <div className="relative flex-1 min-w-0 h-full overflow-hidden">
        {/* Floating Find & Replace Bar */}
        <FindReplaceBar
          documentVersion={activeTab?.path + activeTab?.content}
          isOpen={isFindOpen && !activeTab?.document && !activeTab?.isDiff}
          mode={findMode}
          onClose={() => setIsFindOpen(false)}
          onFind={handleFind}
          onReplace={handleReplace}
          onReplaceAll={handleReplaceAll}
          onNext={handleNextMatch}
          onPrev={handlePrevMatch}
          matchCount={matchCount}
          currentMatchIndex={currentMatchIndex}
        />

        {activeTab ? (
          activeTab.commitComparison ? <CommitDiffView key={activeTab.id} comparison={activeTab.commitComparison} theme={preferences.theme==='light'?'vs':'openfruit-dark'} fontSize={preferences.fontSize}/> :
          activeTab.document?.kind==='image' ? <ImagePreview key={activeTab.id} src={activeTab.document.dataUrl} name={activeTab.name} bytes={activeTab.document.bytes}/> :
          activeTab.document?.kind==='binary' ? <div className="p-5 text-fruit-textMuted text-sm"><p>{t("File binario:")} {activeTab.name}</p><p className="mt-2 text-xs">{activeTab.document.bytes} {t("byte · formato immagine non supportato o file non testuale.")}</p></div> :
          activeTab.isDiff ? (
            <SafeDiffEditor key={activeTab.id}
              beforeMount={monaco => {
                monaco.editor.defineTheme('openfruit-dark', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#1F221E' } });
              }}
              height="100%"
              language={fileLanguage(activeTab.path || activeTab.name)}
              original={activeTab.originalContent || ''}
              modified={activeTab.content}
              theme={preferences.theme === 'light' ? 'vs' : 'openfruit-dark'}
              options={{
                fontSize: preferences.fontSize,
                fontFamily: '"JetBrains Mono", Consolas, monospace',
                readOnly: true,
                renderSideBySide: true,
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 12, bottom: 12 }
              }}
            />
          ) : /\.svg$/i.test(activeTab.name) ? <SvgDocumentEditor key={activeTab.id} name={activeTab.name} content={activeTab.content} editor={sourceEditor}/> : structuredPlist && /\.(plist|entitlements)$/i.test(activeTab.name) ? <StructuredPlistEditor content={activeTab.content} onChange={source=>onContentChange(activeTab.id,source)} /> : (
            sourceEditor
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-fruit-textDim">
            <FileCode className="w-12 h-12 mb-3 text-fruit-borderLight" />
            <p className="font-syne text-sm">{t("Nessun file aperto nell'editor")}</p>
            <p className="font-mono text-xs mt-1 text-fruit-textDim">{t("Seleziona un file dall'esplora a sinistra")}</p>
          </div>
        )}
      </div>
      {secondaryTab&&<section aria-label={t("Secondo gruppo editor")} className="flex-1 min-w-0 border-l border-fruit-border h-full flex flex-col">
        <header className="h-8 shrink-0 flex items-center gap-2 bg-fruit-bg px-2"><select aria-label={t("File nel secondo gruppo")} className="bg-fruit-surface text-fruit-text text-xs flex-1 min-w-0" value={secondaryTab.id} onChange={e=>setSplitId(e.target.value)}>{tabs.filter(t=>!t.isDiff&&!t.document).map(t=><option key={t.id} value={t.id}>{t.name}{t.isDirty?' *':''}</option>)}</select><button aria-label={t("Chiudi secondo gruppo")} className="text-xs text-fruit-textDim" onClick={()=>{setSplitId(undefined);focusSide.current='primary';if(activeTab)onSelectTab(activeTab.id);}}>×</button></header>
        <div className="flex-1 min-h-0"><Editor key={secondaryTab.id} path={getEditorModelUri(secondaryTab)} keepCurrentModel height="100%" language={fileLanguage(secondaryTab.path || secondaryTab.name)} value={secondaryTab.content} theme={preferences.theme==='light'?'vs':'openfruit-dark'}
          onMount={editor=>{editor.onDidFocusEditorText(()=>{focusSide.current='secondary';setEditorInstance(editor);if(secondaryRef.current)selectRef.current(secondaryRef.current.id);});editor.onDidChangeCursorPosition(e=>setCursorPos({line:e.position.lineNumber,col:e.position.column}));}}
          onChange={value=>{if(value!==undefined)onContentChange(secondaryTab.id,value);}}
          options={{fontSize:preferences.fontSize,tabSize:preferences.tabSize,wordWrap:preferences.wordWrap?'on':'off',minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false,fontFamily:'"JetBrains Mono", Consolas, monospace'}}/>
        </div>
      </section>}
      </div>
    </main>
  );
};
