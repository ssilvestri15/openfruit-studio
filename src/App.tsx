import {documentFields,type CommitComparison} from '../shared/documents';
import {shortcutMatches,type ShortcutAction} from '../shared/preferences';
import { WorkspaceSearchPanel } from './components/WorkspaceSearchPanel';
import type { EditorLocation } from './types';
import { usePreferences } from './hooks/usePreferences';
import { LanguageContext, useTranslation } from './localization';
import { terminalOwnsKeyboard } from './utils/keyboard';
import { projectBuildArgs } from '../shared/projectSettings';
import { assertMergeResolved } from './utils/merge';
import React, { useState, useEffect, useRef } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NewProjectModal } from './components/NewProjectModal';
import { SettingsModal } from './components/SettingsModal';
import { StudioUpdateBanner } from './components/StudioUpdateBanner';
import { CloneGitModal } from './components/CloneGitModal';
import { CommandPalette, CommandItem } from './components/CommandPalette';
import { TopBar } from './components/TopBar';
import { FileMenuDropdown } from './components/FileMenuDropdown';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { BottomPanel } from './components/BottomPanel';
import { ContextMenu } from './components/ContextMenu';
import { 
  Play, Bug, Save, GitBranch, Eye, Terminal, FilePlus, Settings } from 'lucide-react';
import { 
  ProjectConfig, FileNode, TabItem, SdkItem, GitCommit, 
  GitDiffItem, GitFileStatus, OpenFruitDevice, LogLine, ProblemItem 
} from './types';
import type {RecentProject} from './types';

import { Capabilities, eventLog, eventProblem, eventProgress, eventArtifacts, type BuildProgress, type BuildArtifacts } from './engineProtocol';
import { useFileConflicts } from './hooks/useFileConflicts';
import { WorkspaceRequests } from './utils/workspaceRequests';
import { filePathFromUri, samePath, inPath, markSaved } from './utils/editorState';

const ProjectSettingsDialog = React.lazy(() => import('./components/ProjectConfiguration').then(module => ({ default: module.ProjectConfiguration })));
const sessionKey = (window as any).openfruitApi?.sessionKey || 'openfruit_session_state';
const FileConflictDialog = React.lazy(() => import('./components/FileConflictDialog').then(module => ({ default: module.FileConflictDialog })));
const CenterPanel = React.lazy(() => import('./components/CenterPanel').then(module => ({ default: module.CenterPanel })));

const persistableTabs=(tabs:TabItem[])=>tabs.filter(t=>!t.commitComparison).map(tab=>{const next={...tab};delete next.document;delete next.commitComparison;return next;});

export const App: React.FC = () => {
  const preferenceState = usePreferences();
  const language = preferenceState.preferences.language;
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return <LanguageContext.Provider value={language}>
    <Studio {...preferenceState} />
  </LanguageContext.Provider>;
};

function Studio({ preferences, savePreferences, preferenceError }: ReturnType<typeof usePreferences>) {
  const t = useTranslation();
  // Navigation / Screen state
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'ide'>('welcome');
  const hasLoadedSessionRef = useRef(false);
  const workspaceRequests = useRef(new WorkspaceRequests());
  const gitRootRef = useRef<string | null>(null);
  const beginWorkspace = (path: string) => {
    const previousPath = currentScreen === 'ide' ? project.projectPath : '';
    const previousRoot = gitRootRef.current;
    const isCurrent = workspaceRequests.current.switchTo(path);
    fileResolution.reset();
    setIsProjectSettingsOpen(false);
    gitRootRef.current = null;
    setStagedFiles([]); setUnstagedFiles([]); setDiffs([]); setCommits([]); setCurrentBranch('—');
    return Object.assign(isCurrent, { rollback: () => {
      if (!isCurrent()) return;
      workspaceRequests.current.switchTo(previousPath);
      gitRootRef.current = previousRoot;
      if (previousPath) refreshGitStatus(previousPath);
    } });
  };

  // Modals & Panels state
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [settingsProjectPath, setSettingsProjectPath] = useState<string>();
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCloneGitModalOpen, setIsCloneGitModalOpen] = useState(false);
  const [commandPalette, setCommandPalette] = useState<{ isOpen: boolean; mode: 'files' | 'commands' }>({
    isOpen: false,
    mode: 'files'
  });
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [leftPanelView, setLeftPanelView] = useState<'files' | 'git'>('files');
  const [problems, setProblems] = useState<ProblemItem[]>([]);

  // Independent Collapsible Panels State
  const [isWorkspaceSearchOpen, setIsWorkspaceSearchOpen] = useState(false);
  const [editorLocation, setEditorLocation] = useState<EditorLocation>();
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    targetNode: FileNode | null;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    targetNode: null
  });

  // Project & Files State
  const [project, setProject] = useState<ProjectConfig>({name:'',bundleId:'',organization:'',minIosVersion:'',sdkVersion:'',language:'',interfaceType:'',projectPath:'',gitInit:false});
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [logicalNavigator, setLogicalNavigator] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [fileTree, setFileTree] = useState<FileNode>({ id: 'root', name: t("Progetto"), path: '', type: 'folder', children: [] });

  // Editor Tabs State
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const liveTabs = useRef(tabs); liveTabs.current = tabs;
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // SDKs State
  const [sdks, setSdks] = useState<SdkItem[]>([]);

  // Real Devices State (Physical USB iPhone Only, NO simulators)
  const [devices, setDevices] = useState<OpenFruitDevice[]>([
    {
      name: t("Nessun iPhone collegato"),
      udid: 'DISCONNECTED',
      type: 'usb',
      iosVersion: '',
      model: t("In attesa di connessione USB..."),
      connected: false
    }
  ]);
  const [selectedDevice, setSelectedDevice] = useState<OpenFruitDevice>(devices[0]);
  const [isScanningDevices, setIsScanningDevices] = useState(false);

  // OpenFruit owns USB / network device discovery.
  const refreshDevicesFromOpenFruit = async () => {
    if (!(window as any).openfruitApi?.getDevices) return;
    setIsScanningDevices(true);
    try {
      const realList = await (window as any).openfruitApi.getDevices();
      if (Array.isArray(realList) && realList.length > 0) {
        const mapped: OpenFruitDevice[] = realList.map((d: any) => ({
          name: d.name || 'iPhone (USB)',
          udid: d.udid,
          type: (d.connection || 'usb').toLowerCase(),
          iosVersion: d.iosVersion || '',
          model: d.model || 'iPhone',
          connected: true
        }));
        setDevices(mapped);
        setSelectedDevice(previous => mapped.find(d => d.udid === previous.udid) || mapped[0]);
      } else {
        const disconnected: OpenFruitDevice[] = [
          {
            name: t("Nessun iPhone collegato"),
            udid: 'DISCONNECTED',
            type: 'usb',
            iosVersion: '',
            model: t("Collega un iPhone via USB"),
            connected: false
          }
        ];
        setDevices(disconnected);
        setSelectedDevice(disconnected[0]);
      }
    } catch (e) {
      reportError(e);
      setDevices([]);
      setSelectedDevice({ name: t("Rilevamento dispositivi fallito"), udid: 'DISCONNECTED', type: 'usb', iosVersion: '', model: t("Ripeti la scansione"), connected: false });
    } finally {
      setIsScanningDevices(false);
    }
  };

  // Load Real Recent Projects and initial device scan on mount
  useEffect(() => {
    let isMounted = true;
    const initApp = async () => {
      try {
        // 1. Load recent projects from disk
        if ((window as any).openfruitApi?.loadRecentProjects) {
          const diskRecents = await (window as any).openfruitApi.loadRecentProjects();
          if (isMounted && Array.isArray(diskRecents) && diskRecents.length >= 0) {
            setRecentProjects(diskRecents);
          }
        }
      } catch (err) {
        console.warn('Could not load recents from disk, using defaults:', err);
      }

      // 2. Hot Exit / Restore Session State (Open project, tabs with unsaved content, activeTabId)
      try {
        let sessionData: any = null;
        if ((window as any).openfruitApi?.loadSessionState) {
          try { sessionData = await (window as any).openfruitApi.loadSessionState(); if(sessionData?.recoveryWarning)setSessionError(sessionData.recoveryWarning); } catch(error:any) {setSessionError(error.message);}
        }
        const localStr = localStorage.getItem(sessionKey);
        if (localStr) {
          const local = JSON.parse(localStr);
          if (!sessionData || (local.updatedAt || 0) > (sessionData.updatedAt || 0)) sessionData = local;
        }

        if (isMounted && sessionData?.currentScreen === 'ide' && typeof sessionData.project?.projectPath === 'string' && typeof sessionData.project?.name === 'string') {
          const isCurrent = beginWorkspace(sessionData.project.projectPath);
          setProject(sessionData.project);
          setCurrentScreen('ide');

          if (Array.isArray(sessionData.tabs)) {
            sessionData.tabs = sessionData.tabs.filter((tab: any) => tab && typeof tab.path === 'string' && typeof tab.content === 'string' && typeof tab.id === 'string');
            setTabs(sessionData.tabs);
            setActiveTabId(sessionData.tabs.some((tab: TabItem) => tab.id === sessionData.activeTabId) ? sessionData.activeTabId : sessionData.tabs[0]?.id || null);
          }

          if (sessionData.leftPanelView) {
            setLeftPanelView(sessionData.leftPanelView);
          }
          if (sessionData.isLeftPanelOpen !== undefined) setIsLeftPanelOpen(sessionData.isLeftPanelOpen);
          if (sessionData.isRightPanelOpen !== undefined) setIsRightPanelOpen(sessionData.isRightPanelOpen);
          if (sessionData.isBottomPanelOpen !== undefined) setIsBottomPanelOpen(sessionData.isBottomPanelOpen);

          // Resize window for IDE workspace
          (window as any).openfruitApi?.setWindowSize?.(1440, 960, true);

          // Read real file tree from disk for this project
          if (sessionData.project.projectPath && (window as any).openfruitApi?.readProjectTree) {
            const treeRes = await (window as any).openfruitApi.readProjectTree(sessionData.project.projectPath);
            if (treeRes?.tree && isMounted && isCurrent()) {
              setFileTree(treeRes.tree);
              const restoredTabs: TabItem[] = sessionData.tabs || [];
              Promise.allSettled(restoredTabs.filter(tab => !tab.isDirty && !tab.isDiff).map(async tab => ({
                tab, snapshot: documentFields(await (window as any).openfruitApi.readDocument(tab.path))
              }))).then(results => {
                if (!isMounted || !isCurrent()) return;
                setTabs(current => current.map(tab => {
                  const result = results.find(result => result.status === 'fulfilled' && result.value.tab.id === tab.id);
                  if (result?.status !== 'fulfilled' || result.value.tab.path !== tab.path) return tab;
                  const { snapshot, tab: restored } = result.value;
                  if (!tab.isDirty && tab.content === restored.content) return { ...tab, ...snapshot, baseContent: snapshot.content, unresolvedMerge: false };
                  if (!tab.revision && snapshot.content === restored.content) return { ...tab, baseContent: snapshot.content, revision: snapshot.revision };
                  return tab;
                }));
              });
            }
          }

          if (sessionData.project.projectPath && isCurrent()) {
            (window as any).openfruitApi?.lspInit?.(sessionData.project.projectPath);
            refreshGitStatus(sessionData.project.projectPath);
          }
        }
      } catch (err) {
        if (isMounted) setSessionError(t("Impossibile ripristinare la sessione: ")+(err as Error).message);
      } finally {
        if (isMounted) {
          hasLoadedSessionRef.current = true;
        }
      }

      try {
        // 3. Scan real devices with openfruit
        if (isMounted) {
          await refreshDevicesFromOpenFruit();
        }
      } catch (err) {
        console.warn('Could not scan devices:', err);
      }
    };
    initApp().then(async()=>{const entry=await (window as any).openfruitApi?.takeLaunchProject?.();if(isMounted&&entry)void handleOpenProject({path:entry.root});}).catch((error:Error)=>setSessionError(error.message));

    // Periodic USB device scan every 8 seconds
    const interval = setInterval(() => {
      if (isMounted) {
        refreshDevicesFromOpenFruit().catch(() => {});
      }
    }, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Hot Exit: Auto-save session state (open tabs with unsaved edits, activeTabId, panels)
  useEffect(() => {
    if (!hasLoadedSessionRef.current) return;

    const sessionData = {
      updatedAt: Date.now(),
      currentScreen,
      project: currentScreen === 'ide' ? project : null,
      tabs: currentScreen === 'ide' ? persistableTabs(tabs) : [],
      activeTabId: currentScreen === 'ide' ? activeTabId : null,
      leftPanelView,
      isLeftPanelOpen,
      isRightPanelOpen,
      isBottomPanelOpen
    };

    const timer = setTimeout(() => {
      try { localStorage.setItem(sessionKey, JSON.stringify(sessionData)); } catch {}
      if ((window as any).openfruitApi?.saveSessionState) {
        (window as any).openfruitApi.saveSessionState(sessionData).then((result:any)=>{setSessionError(result.success ? '' : result.error);}).catch((error:Error)=>setSessionError(error.message));
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [currentScreen, project, tabs, activeTabId, leftPanelView, isLeftPanelOpen, isRightPanelOpen, isBottomPanelOpen]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (currentScreen === 'ide') {
        const sessionData = {
          updatedAt: Date.now(),
          currentScreen,
          project,
          tabs:persistableTabs(tabs),
          activeTabId,
          leftPanelView,
          isLeftPanelOpen,
          isRightPanelOpen,
          isBottomPanelOpen
        };
        try {
          localStorage.setItem(sessionKey, JSON.stringify(sessionData));
        } catch { if (sessionError && tabs.some(t=>t.isDirty)) {event.preventDefault();event.returnValue='';} }
        if ((window as any).openfruitApi?.saveSessionState) {
          (window as any).openfruitApi.saveSessionState(sessionData);
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentScreen, project, tabs, activeTabId, leftPanelView, isLeftPanelOpen, isRightPanelOpen, isBottomPanelOpen]);

  // Git State
  const [currentBranch, setCurrentBranch] = useState('main');
  const [stagedFiles, setStagedFiles] = useState<GitFileStatus[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitFileStatus[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [diffs, setDiffs] = useState<GitDiffItem[]>([]);

  // Build & Logs State
  const [isBuilding, setIsBuilding] = useState(false);
  const isDebugging = false;
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [engineCapabilities, setEngineCapabilities] = useState<Capabilities | null>(null);
  const [engineError, setEngineError] = useState(t("Connessione a OpenFruit..."));
  const activeBuildRef = useRef<string | null>(null);
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
  const buildArtifactsRef = useRef<BuildArtifacts | null>(null);
  const flushEngineRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    const api = (window as any).openfruitApi;
    if (!api?.getOpenFruitCapabilities) {
      setEngineError(t("OpenFruit disponibile solo nell’app desktop"));
      return;
    }
    api.getOpenFruitCapabilities().then((snapshot: Capabilities) => {
      if (alive) { setEngineCapabilities(snapshot); setEngineError(''); }
    }).catch((error: Error) => { if (alive) setEngineError(error.message); });
    let queued: LogLine[] = [];
    let queuedProblems: ProblemItem[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      clearTimeout(timer); timer = undefined;
      const logs = queued; const problems = queuedProblems;
      queued = []; queuedProblems = [];
      if (logs.length) setLogs(previous => [...previous, ...logs].slice(-2000));
      if (problems.length) setProblems(previous => [...previous, ...problems].slice(-2000));
    };
    flushEngineRef.current = flush;
    const unsubscribe = api.onOpenFruitOutput((output: any) => {
      if (output.requestId !== activeBuildRef.current) return;
      const event = output.event;
      queued.push(event ? eventLog(event) : { id: crypto.randomUUID(), text: output.text, type: output.stream });
      if (event) {
        const problem = eventProblem(event); if (problem) queuedProblems.push(problem);
        if (event.kind === 'build.progress' || event.kind === 'deploy.progress') setBuildProgress(current => eventProgress(event, current ?? undefined) ?? current);
        const artifacts = eventArtifacts(event); if (artifacts) buildArtifactsRef.current = artifacts;
      }
      // Bound bursts before React gets a chance to render.
      if (queued.length > 2000) queued = queued.slice(-2000);
      if (queuedProblems.length > 2000) queuedProblems = queuedProblems.slice(-2000);
      if (!timer) timer = setTimeout(flush, 32);
    });
    return () => { alive = false; unsubscribe?.(); clearTimeout(timer); flushEngineRef.current = null; };
  }, []);

  // Inline rename / new file dialog prompt
  const [inlinePrompt, setInlinePrompt] = useState<{
    isOpen: boolean;
    title: string;
    defaultValue: string;
    onConfirm: (val: string) => void;
  }>({
    isOpen: false,
    title: '',
    defaultValue: '',
    onConfirm: () => {}
  });

  const reportError = (error: unknown) => {
    setIsBottomPanelOpen(true);
    setLogs(previous => [...previous, { id: crypto.randomUUID(), text: error instanceof Error ? error.message : String(error), type: 'stderr' as const }].slice(-2000));
  };

  const fileResolution = useFileConflicts({
    tabs, setTabs, requests: workspaceRequests.current, reportError,
    reportSavedCopy: path => setLogs(previous => [...previous, { id: crypto.randomUUID(), text: t("Copia salvata: ") + path, type: 'success' as const }].slice(-2000)),
    refresh: async () => { await refreshFileTree(); await refreshGitStatus(); }
  });

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]') || terminalOwnsKeyboard(e.target)) return;
      const actions: Record<ShortcutAction,()=>void>={
        open:()=>{void handleOpenProject();},newWindow:handleNewWindow,newFile:handleNewUntitled,
        newProject:()=>setIsNewProjectModalOpen(true),save:()=>{void handleSaveActiveFile();},saveAll:()=>{void handleSaveAll();},saveAs:()=>{handleSaveAs().catch(reportError);},
        palette:()=>setCommandPalette({isOpen:true,mode:'commands'}),quickOpen:()=>setCommandPalette({isOpen:true,mode:'files'}),
        search:()=>{setIsLeftPanelOpen(true);setIsWorkspaceSearchOpen(true);},replace:()=>{setIsLeftPanelOpen(true);setIsWorkspaceSearchOpen(true);},
        toggleFiles:()=>setIsLeftPanelOpen(v=>!v),toggleTerminal:()=>setIsBottomPanelOpen(v=>!v),toggleCanvas:()=>setIsRightPanelOpen(v=>!v),build:()=>{void handleRunBuild();}
      };
      for(const action of Object.keys(actions) as ShortcutAction[])if(shortcutMatches(e,preferences.keybindings[action])){e.preventDefault();e.stopImmediatePropagation();actions[action]();break;}
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, project, selectedDevice, engineCapabilities, engineError, currentScreen, preferences.keybindings]);

  // Helper to find first file in a tree
  const findFirstFile = (node: FileNode): FileNode | null => {
    if (node.type === 'file') return /\.(swift|plist|json|md|txt|h|m|mm|c|cpp|xcconfig|pbxproj)$/i.test(node.name) ? node : null;
    if (node.children) {
      for (const child of node.children) {
        const found = findFirstFile(child);
        if (found) return found;
      }
    }
    return null;
  };

  const openInitialFile = async (tree: FileNode) => {
    const isCurrent = workspaceRequests.current.ticket('initial-file');
    const first = findFirstFile(tree);
    const snapshot = first ? await (window as any).openfruitApi.readDocument(first.path).then(documentFields).catch(() => null) : null;
    const content = snapshot?.content ?? null;
    if (!isCurrent()) return;
    if (first && content === null) reportError(t("Impossibile leggere ") + first.path);
    const opened: TabItem[] = first && content !== null ? [{ id: 'tab-' + first.path, name: first.name, path: first.path, content, baseContent: content, revision: snapshot.revision, document: snapshot.document, isDirty: false }] : [];
    setTabs(opened);
    setActiveTabId(opened[0]?.id || null);
  };

  // Real Project Creation on Disk
  const handleCreateProject = async (config: ProjectConfig) => {
    if (activeBuildRef.current) { throw new Error(t("Attendi o interrompi la build prima di cambiare progetto")); }
    if (tabs.some(t => t.isDirty) && !confirm(t("Cambiare progetto e scartare le modifiche non salvate?"))) return;
    const isCurrent = beginWorkspace(config.projectPath);

    if (!(window as any).openfruitApi?.createProjectScaffold) throw new Error(t("Creazione disponibile nell’app desktop"));
    if ((window as any).openfruitApi?.createProjectScaffold) {
      // Create actual physical files on disk
      const res = await (window as any).openfruitApi.createProjectScaffold(config);
      if (!isCurrent()) return;
      if (!res?.success) { isCurrent.rollback(); throw new Error(res?.error || t("Creazione progetto fallita")); }
      if (res.warning) reportError(res.warning);
      if (res.success) {
        // Read real created directory tree from disk
        const treeRes = await (window as any).openfruitApi.readProjectTree(config.projectPath);
        if (!isCurrent()) return;
        if (!treeRes?.success || !treeRes.tree) { isCurrent.rollback(); reportError(treeRes?.error || t("Impossibile leggere il nuovo progetto")); return; }
        if (treeRes?.success && treeRes.tree) {
          setFileTree(treeRes.tree);
          // Open the created ContentView.swift in editor
          await openInitialFile(treeRes.tree);
        }
      }
    }

    if (!isCurrent()) return;
    setProject(config);

    // Update and persist recents on disk
    const updatedRecents = [
      {
        name: config.name,
        path: config.projectPath,
        framework: config.interfaceType,
        branch: 'main',
        lastModified: 'Adesso',
        bundleId: config.bundleId
      },
      ...recentProjects.filter(p => !samePath(p.path,config.projectPath))
    ];
    setRecentProjects(updatedRecents);
    (window as any).openfruitApi?.saveRecentProjects?.(updatedRecents);

    // Resize window for IDE workspace
    (window as any).openfruitApi?.setWindowSize?.(1440, 960, true);
    (window as any).openfruitApi?.lspInit?.(config.projectPath);
    refreshGitStatus(config.projectPath);
    setCurrentScreen('ide');
    setIsNewProjectModalOpen(false);
  };

  // Real Project Open from Disk
  const handleOpenProject = async (proj?: any) => {
    if (activeBuildRef.current) { reportError(t("Attendi o interrompi la build prima di cambiare progetto")); return; }
    if (tabs.some(t => t.isDirty) && !confirm(t("Cambiare progetto e scartare le modifiche non salvate?"))) return;
    let targetPath = proj?.path;

    // If no path specified, open native Windows directory picker!
    if (!targetPath && (window as any).openfruitApi?.selectDirectory) {
      const selected = await (window as any).openfruitApi.selectDirectory();
      if (!selected) return; // User canceled picker
      targetPath = selected;
    }

    if (!targetPath && !proj) return;
    if(targetPath&&(window as any).openfruitApi?.resolveProjectEntrypoint){try{const entry=await (window as any).openfruitApi.resolveProjectEntrypoint(targetPath);targetPath=entry.root;if(entry.entrypoint?.toLowerCase().endsWith('.xcodeproj'))setSettingsProjectPath(entry.entrypoint);}catch(error){reportError(error);return;}}
    const isCurrent = beginWorkspace(targetPath || proj.path);
    if (targetPath && (window as any).openfruitApi?.readProjectTree) {
      // Read real filesystem tree from disk
      const treeRes = await (window as any).openfruitApi.readProjectTree(targetPath);
      if (!isCurrent()) return;
      if (!treeRes?.success || !treeRes.tree) { isCurrent.rollback(); reportError(treeRes?.error || t("Impossibile aprire il progetto")); return; }
      if (treeRes?.success && treeRes.tree) {
        setFileTree(treeRes.tree);
        const metadata = await (window as any).openfruitApi.projectMetadata(targetPath);
        if (!isCurrent()) return;
        const projectName = metadata.name || treeRes.tree.name;
        for(const warning of metadata.warnings || [])reportError(warning);
        
        setProject({
          name: projectName,
          bundleId: metadata.bundleId,
          organization: metadata.organization,
          minIosVersion: metadata.minIosVersion,
          sdkVersion: metadata.sdkVersion,
          language: metadata.language,
          interfaceType: metadata.interfaceType,
          projectPath: targetPath,
          gitInit: true
        });

        // Open first readable file in tabs
        await openInitialFile(treeRes.tree);
        if (!isCurrent()) return;

        // Add to recents and persist on disk
        const updatedRecents = [
          {
            name: projectName,
            path: targetPath,
            framework: metadata.interfaceType,
            branch: 'main',
            lastModified: 'Adesso',
            bundleId: metadata.bundleId
          },
          ...recentProjects.filter(p => p.path !== targetPath)
        ];
        setRecentProjects(updatedRecents);
        (window as any).openfruitApi?.saveRecentProjects?.(updatedRecents);
      }
    } else { isCurrent.rollback(); reportError(t("Apri un progetto locale nell’app desktop")); return; }

    if (!targetPath && !proj) return;
    if (!isCurrent()) return;
    setProblems([]);
    // Resize window for IDE workspace
    (window as any).openfruitApi?.setWindowSize?.(1440, 960, true);
    const effectivePath = targetPath || proj?.path;
    (window as any).openfruitApi?.lspInit?.(effectivePath);
    refreshGitStatus(effectivePath);
    setCurrentScreen('ide');
  };

  const nativeOpenRef=useRef(handleOpenProject);nativeOpenRef.current=handleOpenProject;
  useEffect(()=> (window as any).openfruitApi?.onNativeProjectOpened?.((entry:{root:string})=>{void nativeOpenRef.current({path:entry.root});}),[]);

  // Close Project (Return to compact welcome screen)
  const handleCloseProject = () => {
    if (tabs.some(t => t.isDirty) && !confirm(t("Chiudere il progetto e scartare le modifiche non salvate?"))) return;
    beginWorkspace('');
    (window as any).openfruitApi?.cancelOpenFruitCommand?.();
    (window as any).openfruitApi?.lspStop?.();
    (window as any).openfruitApi?.closeWorkspace?.();
    setProblems([]); setTabs([]); setActiveTabId(null);
    (window as any).openfruitApi?.setWindowSize?.(980, 640, true);
    setCurrentScreen('welcome');
    try {
      localStorage.removeItem(sessionKey);
    } catch (e) {}
    if ((window as any).openfruitApi?.clearSessionState) {
      (window as any).openfruitApi.clearSessionState();
    }
  };

  // Change Project
  const handleChangeProject = (path: string) => {
    const found = recentProjects.find(p => samePath(p.path,path));
    if (found) {
      handleOpenProject(found);
    }
  };

  // Open New Window (Opens Welcome in new window or electron window)
  const handleNewWindow = () => {
    if ((window as any).openfruitApi?.openNewWindow) {
      (window as any).openfruitApi.openNewWindow();
    } else {
      window.open(window.location.href, '_blank', 'width=1280,height=850');
    }
  };

  // Refresh Git Status from disk (D)
  const refreshGitStatus = async (projectPath?: string) => {
    const targetPath = projectPath || project.projectPath;
    if (!targetPath || !workspaceRequests.current.matches(targetPath) || !(window as any).openfruitApi?.gitGetStatus) return;
    const isCurrent = workspaceRequests.current.ticket('git');

    try {
      const gitData = await (window as any).openfruitApi.gitGetStatus(targetPath);
      if (!isCurrent()) return;
      gitRootRef.current = gitData?.repoRoot || null;
      if (gitData?.isGit) {
        if (gitData.branch) setCurrentBranch(gitData.branch);
        if (Array.isArray(gitData.commits)) setCommits(gitData.commits);
        if (Array.isArray(gitData.diffs)) setDiffs(gitData.diffs);
        if (Array.isArray(gitData.stagedFiles)) setStagedFiles(gitData.stagedFiles);
        if (Array.isArray(gitData.unstagedFiles)) setUnstagedFiles(gitData.unstagedFiles);
      } else {
        setCurrentBranch('—'); setCommits([]); setDiffs([]); setStagedFiles([]); setUnstagedFiles([]);
      }
    } catch (e) {
      reportError(e);
    }
  };

  // Refresh File Tree from disk (C)
  const refreshFileTree = async () => {
    if (!workspaceRequests.current.matches(project.projectPath)) return;
    const isCurrent = workspaceRequests.current.ticket('tree');
    if (project.projectPath && (window as any).openfruitApi?.readProjectTree) {
      const treeRes = await (window as any).openfruitApi.readProjectTree(project.projectPath, logicalNavigator);
      if (treeRes?.success && treeRes.tree && isCurrent()) {
        setFileTree(treeRes.tree);
      }
    }
  };

  const saveTabs = async (snapshots: TabItem[]) => {
    const isCurrent = workspaceRequests.current.ticket('save');
    const api = (window as any).openfruitApi;
    if (!api?.saveFile) throw new Error(t("Salvataggio disponibile nell’app desktop"));
    for (const snapshot of snapshots.filter(t => !t.isDiff && !t.document)) {
      assertMergeResolved(snapshot);
      if(!snapshot.path) { await handleSaveAs(snapshot); continue; }
      const result = await api.saveFile(snapshot.path, snapshot.content, snapshot.revision);
      if (isCurrent()) fileResolution.record(snapshot, result);
      if (!result?.success) throw new Error(result?.error || t("Salvataggio fallito: ") + snapshot.path);
      if (isCurrent()) setTabs(current => markSaved(current, [{ ...snapshot, revision: result.revision }]));
    }
    await refreshGitStatus();
  };
  useEffect(() => {
    if (currentScreen !== 'ide' || preferences.autoSave !== 'afterDelay') return;
    const dirty = tabs.filter(tab => tab.path && tab.isDirty && !tab.isDiff && !fileResolution.conflicts[tab.id]);
    if (!dirty.length) return;
    const timer = setTimeout(() => { saveTabs(dirty).catch(reportError); }, preferences.autoSaveDelay);
    return () => clearTimeout(timer);
  }, [tabs, preferences.autoSave, preferences.autoSaveDelay, currentScreen]);

  useEffect(() => {
    const api = (window as any).openfruitApi;
    if (!api?.onWorkspaceChanged || currentScreen !== 'ide') return;
    return api.onWorkspaceChanged(async (event: { root: string; paths: string[]; rescan: boolean }) => {
      if (!samePath(event.root, project.projectPath)) return;
      const current = workspaceRequests.current.ticket('disk-refresh');
      const snapshots = liveTabs.current.filter(tab => tab.path && !tab.isDiff && (event.rescan || event.paths.some(path => inPath(tab.path, path))));
      await Promise.allSettled(snapshots.map(async tab => {
        const disk = await api.readDocument(tab.path).then(documentFields).catch(() => null);
        if (!current()) return;
        const now = liveTabs.current.find(t => t.id === tab.id && t.path === tab.path);
        if (!now || now.content !== tab.content) return;
        if (!disk) { fileResolution.record(now, { success: false, conflict: true, error: t("File spostato o eliminato sul disco: il contenuto resta nell’editor") }); return; }
        if (disk.revision === now.revision) return;
        if (now.isDirty) fileResolution.record(now, { success: false, conflict: true, disk, error: t("File modificato esternamente: confronta le versioni") });
        else setTabs(previous => previous.map(t => t.id === now.id && !t.isDirty && t.content === now.content ? { ...t, ...disk, baseContent: disk.content } : t));
      }));
      if (current()) { await refreshFileTree(); await refreshGitStatus(); }
    });
  }, [project.projectPath, currentScreen]);

  const handleNewUntitled = () => {
    if(currentScreen !== 'ide') return;
    const id='untitled-'+crypto.randomUUID();setTabs(current=>[...current,{id,name:'Untitled.swift',path:'',content:'',baseContent:'',isDirty:true}]);setActiveTabId(id);
  };
  const handleSaveAs = async (tab = tabs.find(t=>t.id===activeTabId)) => {
    if(!tab||tab.isDiff)return;if(tab.document){reportError(t("Questo file è aperto nel visualizzatore, senza modifiche testuali da salvare."));return;}assertMergeResolved(tab);
    const isCurrent=workspaceRequests.current.ticket('save-as');
    const result=await (window as any).openfruitApi.saveFileAs(tab.name,tab.content,tabs.filter(t=>t.id!==tab.id&&t.isDirty&&t.path).map(t=>t.path),tab.path,tab.revision);if(!result||!isCurrent())return;
    setTabs(current=>current.filter(t=>t.id===tab.id||!samePath(t.path,result.path)).map(t=>t.id===tab.id?{...t,path:result.path,name:result.path.split(/[\\/]/).at(-1),revision:result.revision,baseContent:result.content,isDirty:t.content!==tab.content}:t));
    await refreshFileTree();await refreshGitStatus();
  };
  const handleSaveActiveFile = async () => {
    try { await saveTabs(tabs.filter(t => t.id === activeTabId && t.isDirty)); } catch (error) { reportError(error); }
  };
  const handleSaveAll = async () => {
    try { await saveTabs(tabs.filter(t => t.isDirty && !t.isDiff)); } catch (error) { reportError(error); }
  };

  const handleSelectFile = async (fileNode: FileNode) => {
    if (!workspaceRequests.current.matches(project.projectPath)) return;
    if (fileNode.type !== 'file') return;
    const existing = tabs.find(t => !t.isDiff && samePath(t.path, fileNode.path));
    if (existing && (existing.document || !/\.(png|jpe?g|gif|webp|bmp|ico|avif|heic|heif|tiff?)$/i.test(fileNode.name) || existing.isDirty)) { setActiveTabId(existing.id); return; }
    const isCurrent = workspaceRequests.current.ticket('open-file');
    try {
      const snapshot = (window as any).openfruitApi?.readDocument
        ? documentFields(await (window as any).openfruitApi.readDocument(fileNode.path)) : { content: fileNode.content, revision: undefined, document: undefined };
      const content = snapshot.content;
      if (!isCurrent()) return;
      if (content === null || content === undefined) throw new Error(t("Impossibile leggere ") + fileNode.path);
      const newTab: TabItem = { id: 'tab-' + fileNode.path, name: fileNode.name, path: fileNode.path, content, baseContent: content, revision: snapshot.revision, document: snapshot.document, isDirty: false };
      setTabs(previous => previous.some(t => t.id === newTab.id) ? previous.map(t=>t.id===newTab.id&&!t.isDirty?newTab:t) : [...previous, newTab]);
      setActiveTabId(newTab.id);
    } catch (error) { reportError(error); }
  };

  // Open File from Git sidebar or path
  const handleOpenFileByPath = async (filePath: string) => {
    const absolute = /^[A-Za-z]:[/\\]|^[/\\]/.test(filePath) ? filePath : (gitRootRef.current || project.projectPath).replace(/\\/g, '/') + '/' + filePath;
    await handleSelectFile({ id: absolute, path: absolute, name: filePath.split(/[/\\]/).pop() || filePath, type: 'file' });
  };

  const handleContentChange = (tabId: string, newContent: string) => {
    setTabs(prev =>
      prev.map(t => {
        const content = t.baseContent?.startsWith('\uFEFF') && !newContent.startsWith('\uFEFF') ? '\uFEFF' + newContent : newContent;
        return t.id === tabId && !t.isDiff && !t.document && t.content !== content ? { ...t, content, isDirty: content !== t.baseContent } : t;
      })
    );
  };

  // Close Tab
  const handleCloseTab = (id: string) => {
    const closing = tabs.find(t => t.id === id);
    if (closing?.isDirty && !confirm(t("Chiudere il file e scartare le modifiche non salvate?"))) return;
    const remaining = tabs.filter(t => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  // JSON Lines is CLI telemetry; completion is determined by the process exit.
  // preview: link the OPENFRUIT preview agent (canvas live preview). Resolves to success.
  const handleRunBuild = async (install = false, preview = false): Promise<boolean> => {
    if (activeBuildRef.current) return false;
    setIsBottomPanelOpen(true);
    const api = (window as any).openfruitApi;
    const append = (text: string, type: LogLine['type'] = 'system') =>
      setLogs(previous => [...previous, { id: crypto.randomUUID(), text, type }].slice(-2000));
    if (currentScreen !== 'ide' || !project.projectPath || !api?.runOpenFruitCommand) {
      append(t("Apri un progetto locale nell’app desktop prima di compilare."), 'stderr');
      return false;
    }
    if (engineCapabilities?.operations.build !== 'implemented') {
      append(engineError || engineCapabilities?.operation_details.build?.reason || t("Compilazione non disponibile."), 'stderr');
      return false;
    }
    const deploy = install && selectedDevice.connected && engineCapabilities.operations.deploy === 'implemented';
    if (install && !deploy) { append(t("Seleziona un dispositivo connesso e verifica il supporto deploy di OpenFruit."), 'stderr'); return false; }

    const requestId = crypto.randomUUID();
    activeBuildRef.current = requestId;
    setIsBuilding(true);
    setBuildProgress(null);
    buildArtifactsRef.current = null;
    setProblems(previous => previous.filter(p => p.source !== 'build'));
    try {
      for (const tab of tabs.filter(t => t.isDirty && !t.isDiff)) {
        assertMergeResolved(tab);
        if(!tab.path)throw new Error(t("Salva con nome i documenti nuovi prima di compilare."));
        const saved = await api.saveFile(tab.path, tab.content, tab.revision);
        fileResolution.record(tab, saved);
        if (!saved?.success) throw new Error(saved?.error || t("Salvataggio fallito: ") + tab.path);
        setTabs(current => markSaved(current, [{ ...tab, revision: saved.revision }]));
      }
      const configuration = await api.readProjectSettings(project.projectPath);
      const args = projectBuildArgs(project.projectPath, configuration.settings, configuration.xcodeProjects.length > 0);
      if (preview) args.push('--preview');
      if (deploy) args.push('--deploy', '--udid', selectedDevice.udid);
      append('openfruit ' + args.map(arg => JSON.stringify(arg)).join(' '), 'command');
      const result = await api.runOpenFruitCommand(args, project.projectPath, requestId);
      flushEngineRef.current?.();
      if (result.cancelled) append(t("Operazione annullata."), 'stderr');
      else if (result.success) {
        append(deploy ? t("Build e installazione completate.") : t("Build completata."), 'success');
        // Set by the output listener while the command ran.
        const artifacts = buildArtifactsRef.current as BuildArtifacts | null;
        if (artifacts?.signedIpa) append(t("IPA firmato: ") + artifacts.signedIpa, 'system');
        else if (artifacts?.unsignedIpa) append(t("IPA non firmato: ") + artifacts.unsignedIpa, 'system');
        if (artifacts?.bundleId) append('Bundle ID: ' + artifacts.bundleId, 'system');
        return true;
      }
      else append(result.error || (t("OpenFruit terminato con codice ") + result.code), 'stderr');
    } catch (error: any) {
      append(error.message, 'stderr');
    } finally {
      activeBuildRef.current = null;
      setIsBuilding(false);
      setBuildProgress(null);
    }
    return false;
  };

  const handleRunDebug = () => {
    setIsBottomPanelOpen(true);
    setLogs(previous => [...previous, {
      id: crypto.randomUUID(), type: 'system',
      text: t("Sessione debug IDE non disponibile nel contratto OpenFruit corrente.")
    }]);
  };

  // Open Side-by-Side Diff Tab (F)
  const handleOpenDiffView = async (filename: string, staged = false) => {
    if (!workspaceRequests.current.matches(project.projectPath)) return;
    const isCurrent = workspaceRequests.current.ticket('diff');
    let headContent='',currentContent='';
    try {const result=await (window as any).openfruitApi.gitFileComparison(project.projectPath,filename,staged);headContent=result.original;currentContent=result.modified;}
    catch(error){reportError(error);return;}
    if (!isCurrent()) return;
    const shortName = filename.split(/[/\\]/).pop() || filename;
    const diffTabId = `diff-${staged?'staged':'unstaged'}-${filename}`;

    const existingDiffTab = tabs.find(t => t.id === diffTabId);
    if (existingDiffTab) {
      setTabs(current=>current.map(t=>t.id===diffTabId?{...t,content:currentContent,originalContent:headContent}:t));
      setActiveTabId(diffTabId);
      return;
    }

    const newDiffTab: TabItem = {
      id: diffTabId,
      name: `${shortName} (${staged?'HEAD ↔ Index':t("Index ↔ Disco")})`,
      path: filename,
      content: currentContent,
      originalContent: headContent,
      isDiff: true,
      isDirty: false
    };

    setTabs(prev => [...prev, newDiffTab]);
    setActiveTabId(diffTabId);
  };

  const handleOpenCommitComparison = async(hash:string,parentIndex:number,filename:string)=>{
    const current=workspaceRequests.current.ticket('commit-comparison');
    try{
      const comparison:CommitComparison=await (window as any).openfruitApi.gitCommitComparison(project.projectPath,hash,parentIndex,filename);
      if(!current())return;
      const id='commit-'+comparison.details.hash+'-'+parentIndex+'-'+filename;
      const tab:TabItem={id,name:(filename.split(/[\\/]/).at(-1)||filename)+' · '+comparison.details.hash.slice(0,8),path:'git:'+comparison.details.hash+'/'+filename,isDiff:true,isDirty:false,content:comparison.after?.kind==='text'?comparison.after.content:'',originalContent:comparison.before?.kind==='text'?comparison.before.content:'',commitComparison:comparison};
      setTabs(tabs=>tabs.some(t=>t.id===id)?tabs.map(t=>t.id===id?tab:t):[...tabs,tab]);setActiveTabId(id);
    }catch(error){reportError(error);}
  };

  // Select Problem from LSP Diagnostics (B)
  const handleSelectProblem = async (problem: ProblemItem) => {
    await handleOpenFileByPath(problem.filePath);
    setEditorLocation({ id: crypto.randomUUID(), path: problem.filePath, line: problem.line, column: problem.column });
    setIsBottomPanelOpen(true);
  };

  // Listen to SourceKit-LSP diagnostics (B)
  useEffect(() => {
    if (!(window as any).openfruitApi?.onLspDiagnostics) return;
    const unsub = (window as any).openfruitApi.onLspDiagnostics((data: any) => {
      if (!data?.uri || !Array.isArray(data?.diagnostics)) return;
      const uriStr: string = data.uri;
      const filePath = filePathFromUri(uriStr);
      const fileName = filePath.split(/[/\\]/).pop() || 'File.swift';

      const mapped: ProblemItem[] = data.diagnostics.map((d: any, idx: number) => {
        let severity: 'error' | 'warning' | 'info' = 'error';
        if (d.severity === 2) severity = 'warning';
        else if (d.severity === 3 || d.severity === 4) severity = 'info';

        return {
          id: `${uriStr}-${idx}-${Date.now()}`,
          source: 'lsp',
          filePath,
          fileName,
          message: d.message || 'Diagnostic',
          severity,
          line: (d.range?.start?.line ?? 0) + 1,
          column: (d.range?.start?.character ?? 0) + 1
        };
      });

      setProblems(prev => {
        const otherFilesProblems = prev.filter(p => p.source === 'build' || p.filePath !== filePath);
        return [...otherFilesProblems, ...mapped];
      });
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Real Git Commit (D)
  const handleCommit = async (message: string) => {
    if (!project.projectPath || !(window as any).openfruitApi?.gitCommit) {
      reportError(t("Git disponibile solo per un progetto locale nell’app desktop"));
      throw new Error(t("Commit non eseguito"));
    }

    try {
      const res = await (window as any).openfruitApi.gitCommit(project.projectPath, message);
      if (res?.success) {
        await refreshGitStatus();
        setLogs(prev => [
          ...prev,
          { id: `${Date.now()}-git`, text: t("[Git] Commit eseguito con successo: \"{0}\"", [message]), type: 'success' }
        ]);
      } else {
        throw new Error(res?.error || res?.output || t("Errore nel commit"));
      }
    } catch (e: any) {
      reportError(e);
      throw e;
    }
  };

  const handleNetworkGit = async (operation: 'push' | 'fetch') => {
    const api = (window as any).openfruitApi;
    if (!project.projectPath || !api) return;
    try {
      const result = await (operation === 'push' ? api.gitPush(project.projectPath) : api.gitFetch(project.projectPath));
      const text = result.cancelled ? t("Operazione interrotta. Le modifiche già completate non vengono annullate.")
        : result.output || result.error || (result.success ? t("Operazione completata") : t("Operazione Git fallita"));
      setLogs(previous => [...previous, { id: crypto.randomUUID(), text: '[Git ' + operation + '] ' + text,
        type: (result.success ? 'success' : result.cancelled ? 'system' : 'stderr') as LogLine['type'] }].slice(-2000));
      await refreshGitStatus();
    } catch (error) { reportError(error); }
  };
  const handlePush = () => handleNetworkGit('push');
  const handleFetch = () => handleNetworkGit('fetch');

  // Git Staging & Discard handlers
  const handleStageFile = async (filename: string) => {
    if (project.projectPath && (window as any).openfruitApi?.gitStageFile) {
      const result = await (window as any).openfruitApi.gitStageFile(project.projectPath, filename);
      if (!result?.success) { reportError(result?.error || t("Operazione Git fallita")); return; }
      await refreshGitStatus();
      return;
    }
    reportError(t("Git disponibile nell’app desktop per un progetto locale."));
  };

  const handleUnstageFile = async (filename: string) => {
    if (project.projectPath && (window as any).openfruitApi?.gitUnstageFile) {
      const result = await (window as any).openfruitApi.gitUnstageFile(project.projectPath, filename);
      if (!result?.success) { reportError(result?.error || t("Operazione Git fallita")); return; }
      await refreshGitStatus();
      return;
    }
    reportError(t("Git disponibile nell’app desktop per un progetto locale."));
  };

  const handleStageAll = async () => {
    if (project.projectPath && (window as any).openfruitApi?.gitStageAll) {
      const result = await (window as any).openfruitApi.gitStageAll(project.projectPath);
      if (!result?.success) { reportError(result?.error || t("Operazione Git fallita")); return; }
      await refreshGitStatus();
      return;
    }
    reportError(t("Git disponibile nell’app desktop per un progetto locale."));
  };

  const handleUnstageAll = async () => {
    if (project.projectPath && (window as any).openfruitApi?.gitUnstageAll) {
      const result = await (window as any).openfruitApi.gitUnstageAll(project.projectPath);
      if (!result?.success) { reportError(result?.error || t("Operazione Git fallita")); return; }
      await refreshGitStatus();
      return;
    }
    reportError(t("Git disponibile nell’app desktop per un progetto locale."));
  };

  const refreshCleanEditors = async () => {
    const snapshots=liveTabs.current.filter(t=>t.path&&!t.isDirty&&!t.isDiff);
    const current=workspaceRequests.current.ticket('discard-refresh');
    const results=await Promise.allSettled(snapshots.map(async tab=>({tab,snapshot:documentFields(await (window as any).openfruitApi.readDocument(tab.path))})));
    if(!current())return;
    for(let i=0;i<results.length;i++)if(results[i].status==='rejected')fileResolution.record(snapshots[i],{success:false,conflict:true,error:t("File non leggibile dopo il ripristino Git. Il contenuto è conservato nell’editor.")});
    setTabs(tabs=>tabs.map(tab=>{const result=results.find(r=>r.status==='fulfilled'&&r.value.tab.id===tab.id);if(result?.status!=='fulfilled'||tab.isDirty||tab.path!==result.value.tab.path||tab.content!==result.value.tab.content)return tab;return {...tab,...result.value.snapshot,baseContent:result.value.snapshot.content,unresolvedMerge:false};}));
  };
  const handleDiscardFile = async (filename: string, isUntracked: boolean) => {
    const api=(window as any).openfruitApi;if(!api?.gitDiscardFile){reportError(t("Ripristino disponibile nell’app desktop"));return;}
    const result=await api.gitDiscardFile(project.projectPath,filename,isUntracked);
    if(!result?.success){reportError(result?.error||t("Ripristino Git fallito"));return;}
    await refreshGitStatus();await refreshFileTree();await refreshCleanEditors();
  };
  const handleDiscardAll = async () => {
    const api=(window as any).openfruitApi;if(!api?.gitDiscardAll){reportError(t("Ripristino disponibile nell’app desktop"));return;}
    const result=await api.gitDiscardAll(project.projectPath);
    if(!result?.success){reportError(result?.error||t("Ripristino Git fallito"));return;}
    await refreshGitStatus();await refreshFileTree();await refreshCleanEditors();
  };

  // File Operations Helpers
  const handleContextMenuOpen = (e: React.MouseEvent, node: FileNode) => {
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetNode: node
    });
  };

  // Real New File action on disk (C)
  const handleNewFile = (targetFolder?: FileNode) => {
    const folder = targetFolder || fileTree;
    setInlinePrompt({
      isOpen: true,
      title: targetFolder ? t("Nuovo file in {0}", [targetFolder.name]) : t("Nuovo file"),
      defaultValue: 'NewView.swift',
      onConfirm: async (fileName) => {
        if (!fileName.trim()) return;
        const cleanName = fileName.trim();
        if (/[<>:\"/\\|?*]/.test(cleanName) || cleanName === '.' || cleanName === '..') throw new Error(t("Nome file non valido"));
        const baseName = ('_' + cleanName.replace(/\.[^/.]+$/, '')).replace(/[^A-Za-z0-9_]/g, '_');
        const newFilePath = `${folder.path.replace(/\\/g, '/')}/${cleanName}`;
        const defaultContent = cleanName.endsWith('.swift') ? `import SwiftUI\n\nstruct ${baseName}: View {\n    var body: some View {\n        Text("Hello from ${baseName}!")\n    }\n}\n\n#Preview {\n    ${baseName}()\n}\n` : '';

        if ((window as any).openfruitApi?.createFile) {
          const result = await (window as any).openfruitApi.createFile(newFilePath, defaultContent);
          if (!result?.success) throw new Error(result?.error || t("Creazione file fallita"));
          await refreshFileTree();
          await refreshGitStatus();
          await handleSelectFile({ id: newFilePath, path: newFilePath, name: cleanName, type: 'file' });
          return;
        }

        throw new Error(t("Creazione disponibile nell’app desktop"));
      }
    });
  };

  // Real New Folder action on disk (C)
  const handleNewFolder = (targetFolder?: FileNode) => {
    const folder = targetFolder || fileTree;
    setInlinePrompt({
      isOpen: true,
      title: targetFolder ? t("Nuova cartella in {0}", [targetFolder.name]) : t("Nuova cartella"),
      defaultValue: 'Components',
      onConfirm: async (folderName) => {
        if (!folderName.trim()) return;
        const cleanName = folderName.trim();
        if (/[<>:\"/\\|?*]/.test(cleanName) || cleanName === '.' || cleanName === '..') throw new Error(t("Nome cartella non valido"));
        const newFolderPath = `${folder.path.replace(/\\/g, '/')}/${cleanName}`;

        if ((window as any).openfruitApi?.createDirectory) {
          const result = await (window as any).openfruitApi.createDirectory(newFolderPath);
          if (!result?.success) throw new Error(result?.error || t("Creazione cartella fallita"));
          await refreshFileTree();
          await refreshGitStatus();
          return;
        }

        throw new Error(t("Creazione disponibile nell’app desktop"));
      }
    });
  };

  // Real Rename action on disk (C)
  const handleRename = (node: FileNode) => {
    if (samePath(node.path, project.projectPath)) { reportError(t("Chiudi il progetto prima di rinominarne la cartella dal filesystem")); return; }
    setInlinePrompt({
      isOpen: true,
      title: node.type === 'folder' ? t("Rinomina cartella") : t("Rinomina file / classe"),
      defaultValue: node.name,
      onConfirm: async (newName) => {
        if (!newName.trim() || newName.trim() === node.name) return;
        const cleanName = newName.trim();
        if (/[<>:\"/\\|?*]/.test(cleanName) || cleanName === '.' || cleanName === '..') throw new Error(t("Nome non valido"));
        const normalized = node.path.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        const dir = lastSlash !== -1 ? normalized.substring(0, lastSlash) : '';
        const newPath = dir ? `${dir}/${cleanName}` : cleanName;

        if ((window as any).openfruitApi?.renamePath) {
          const result = await (window as any).openfruitApi.renamePath(node.path, newPath);
          if (!result?.success) throw new Error(result?.error || t("Rinomina fallita"));
          await refreshFileTree();
          await refreshGitStatus();
        }

        if (!(window as any).openfruitApi?.renamePath) throw new Error(t("Rinomina disponibile nell’app desktop"));
        setTabs(prev =>
          prev.map(t => inPath(t.path, node.path) ? { ...t, name: samePath(t.path, node.path) ? cleanName : t.name, path: newPath + t.path.replace(/\\/g, '/').slice(normalized.length) } : t)
        );
      }
    });
  };

  // Real Delete action on disk (C)
  const handleDelete = async (node: FileNode) => {
    if (samePath(node.path, project.projectPath)) { reportError(t("La cartella radice del progetto non può essere eliminata dall’IDE")); return; }
    if (!(window as any).openfruitApi?.deletePath) {reportError(t("Cestino disponibile nell’app desktop"));return;}
    if (confirm(t("Sei sicuro di voler spostare nel cestino \"{0}\" dal disco? Il file viene spostato nel cestino. Le bozze modificate saranno conservate come documenti non salvati.", [node.name]))) {
      if ((window as any).openfruitApi?.deletePath) {
        const result = await (window as any).openfruitApi.deletePath(node.path);
        if (!result?.success) { reportError(result?.error || t("Spostamento nel cestino fallito")); return; }
        await refreshFileTree();
        await refreshGitStatus();
      }

      const remaining = tabs.flatMap(t => !inPath(t.path,node.path) ? [t] : t.isDirty ? [{...t,id:'recovered-'+crypto.randomUUID(),path:'',revision:undefined,baseContent:'',name:t.name+'.recovered',isDirty:true}] : []);
      setTabs(remaining);
      if (!remaining.some(t => t.id === activeTabId)) setActiveTabId(remaining.at(-1)?.id || null);
    }
  };

  // Remove recent project
  const handleRemoveRecentProject = (path: string) => {
    const next = recentProjects.filter(p => !samePath(p.path,path));
    setRecentProjects(next);
    (window as any).openfruitApi?.saveRecentProjects?.(next);
  };

  // Commands list for Command Palette (Ctrl+Shift+P)
  const paletteCommands: CommandItem[] = [
    {
      id: 'cmd-build',
      title: t("Compila progetto con OpenFruit"),
      category: 'Build',
      icon: <Play className="w-4 h-4 text-fruit-accent" />,
      shortcut: 'Ctrl+R',
      action: () => handleRunBuild()
    },
    {
      id: 'cmd-debug',
      title: t("Debug IDE: non disponibile"),
      category: 'Debug',
      icon: <Bug className="w-4 h-4 text-fruit-amber" />,
      action: () => handleRunDebug()
    },
    {
      id: 'cmd-save',
      title: t("Salva File Corrente"),
      category: 'File',
      icon: <Save className="w-4 h-4 text-fruit-text" />,
      shortcut: 'Ctrl+S',
      action: () => handleSaveActiveFile()
    },
    {
      id: 'cmd-save-all',
      title: t("Salva Tutti i File"),
      category: 'File',
      icon: <Save className="w-4 h-4 text-fruit-text" />,
      shortcut: 'Ctrl+Shift+S',
      action: () => handleSaveAll()
    },
    {
      id: 'cmd-new-project',
      title: t("Nuovo Progetto iOS..."),
      category: 'File',
      icon: <FilePlus className="w-4 h-4 text-fruit-text" />,
      shortcut: 'Ctrl+Shift+N',
      action: () => setIsNewProjectModalOpen(true)
    },
    {
      id: 'cmd-clone-git',
      title: t("Git: Clona Repository da URL..."),
      category: 'Git',
      icon: <GitBranch className="w-4 h-4 text-fruit-text" />,
      action: () => setIsCloneGitModalOpen(true)
    },
    {
      id: 'cmd-git-status',
      title: t("Git: Mostra Pannello Git / Controllo Versione"),
      category: 'Git',
      icon: <GitBranch className="w-4 h-4 text-fruit-text" />,
      action: () => {
        setIsLeftPanelOpen(true);
        setLeftPanelView('git');
        refreshGitStatus();
      }
    },
    {
      id: 'cmd-git-push',
      title: t("Git: Push (Invia commit remoti)"),
      category: 'Git',
      icon: <GitBranch className="w-4 h-4 text-fruit-text" />,
      action: () => handlePush()
    },
    {
      id: 'cmd-git-fetch',
      title: t("Git: Fetch (Recupera modifiche remote)"),
      category: 'Git',
      icon: <GitBranch className="w-4 h-4 text-fruit-text" />,
      action: () => handleFetch()
    },
    {
      id: 'cmd-toggle-sidebar',
      title: t("Visualizza: Mostra/Nascondi Barra Laterale"),
      category: t("Visualizza"),
      icon: <Eye className="w-4 h-4 text-fruit-text" />,
      shortcut: 'Ctrl+B',
      action: () => setIsLeftPanelOpen(prev => !prev)
    },
    {
      id: 'cmd-toggle-terminal',
      title: t("Visualizza: Mostra/Nascondi Terminale e Console"),
      category: t("Visualizza"),
      icon: <Terminal className="w-4 h-4 text-fruit-text" />,
      shortcut: 'Ctrl+J',
      action: () => setIsBottomPanelOpen(prev => !prev)
    },
    { id:'cmd-new-untitled',title:t("Nuovo documento non salvato"),category:'File',icon:<FilePlus className="w-4 h-4"/>,shortcut:'Ctrl+N',action:handleNewUntitled },
    { id:'cmd-save-as',title:t("Salva con nome…"),category:'File',icon:<Save className="w-4 h-4"/>,shortcut:'Ctrl+Alt+Shift+S',action:()=>{handleSaveAs().catch(reportError);} },
    {
      id: 'cmd-workspace-search', title: t("Cerca nel progetto"), category: t("Cerca"), icon: <Eye className="w-4 h-4" />, shortcut: 'Ctrl+Shift+F', action: () => { setIsLeftPanelOpen(true); setIsWorkspaceSearchOpen(true); }
    },
    {
      id: 'cmd-settings',
      title: t("Preferenze: Gestione SDK e Impostazioni"),
      category: t("Preferenze"),
      icon: <Settings className="w-4 h-4 text-fruit-text" />,
      action: () => setIsSettingsModalOpen(true)
    }
  ];

  return (
    <div className="w-screen h-screen overflow-hidden bg-fruit-bg text-fruit-text flex flex-col font-syne select-none">
      <StudioUpdateBanner preference={preferences.updateChannel} />
      {(sessionError || preferenceError) && <div role="alert" className="bg-amber-950 text-amber-100 px-3 py-2 text-xs">{sessionError || preferenceError}</div>}
      {/* Welcome Screen or IDE */}
      {currentScreen === 'welcome' ? (
        <WelcomeScreen
          onNewProject={() => setIsNewProjectModalOpen(true)}
          onOpenProject={(proj) => handleOpenProject(proj)}
          onImportGit={() => setIsCloneGitModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          recentProjects={recentProjects}
          onRemoveRecentProject={handleRemoveRecentProject}
        />
      ) : (
        <div className="relative w-full min-h-0 flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <TopBar onOpenProjectSettings={() => { setSettingsProjectPath(undefined); setIsProjectSettingsOpen(true); }}
            projectName={project.name}
            isFileMenuOpen={isFileMenuOpen}
            onToggleFileMenu={() => setIsFileMenuOpen(prev => !prev)}
            onToggleGitDrawer={() => { setIsWorkspaceSearchOpen(false);
              if (isLeftPanelOpen && leftPanelView === 'git') {
                setLeftPanelView('files');
              } else {
                setIsLeftPanelOpen(true);
                setLeftPanelView('git');
                refreshGitStatus();
              }
            }}
            isGitActive={isLeftPanelOpen && leftPanelView === 'git'}
            isLeftPanelOpen={isLeftPanelOpen}
            onToggleLeftPanel={() => setIsLeftPanelOpen(prev => !prev)}
            isRightPanelOpen={isRightPanelOpen}
            onToggleRightPanel={() => setIsRightPanelOpen(prev => !prev)}
            isBottomPanelOpen={isBottomPanelOpen}
            onToggleBottomPanel={() => setIsBottomPanelOpen(prev => !prev)}
            devices={devices}
            selectedDevice={selectedDevice}
            onSelectDevice={setSelectedDevice}
            onRunBuild={() => void handleRunBuild(false)}
            onBuildAndInstall={() => void handleRunBuild(true)}
            onRunDebug={handleRunDebug}
            isBuilding={isBuilding}
            buildStatus={buildProgress ? `${buildProgress.stage || 'Build'} · ${buildProgress.percent}%` : ''}
            canBuild={engineCapabilities?.operations.build === 'implemented'}
            canDeploy={engineCapabilities?.operations.deploy === 'implemented'}
            engineStatus={engineError || engineCapabilities?.operation_details.build?.reason || ''}
            onCancelBuild={() => (window as any).openfruitApi?.cancelOpenFruitCommand()}
            isDebugging={isDebugging}
            currentBranch={currentBranch}
            onRefreshDevices={refreshDevicesFromOpenFruit}
            isScanningDevices={isScanningDevices}
          />

          {/* File Menu Dropdown */}
          <FileMenuDropdown
            isOpen={isFileMenuOpen}
            onClose={() => setIsFileMenuOpen(false)}
            onNewProject={() => setIsNewProjectModalOpen(true)}
            onOpenProject={() => handleOpenProject()}
            onCloneGit={() => setIsCloneGitModalOpen(true)}
            onChangeProject={handleChangeProject}
            onNewWindow={handleNewWindow}
            onSave={handleSaveActiveFile}
            onSaveAll={handleSaveAll}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onCloseProject={handleCloseProject}
            recentProjects={recentProjects}
            currentProjectName={project.name}
          />

          {/* Three Panels Main Workspace */}
          <div className="relative flex-1 w-full h-full flex overflow-hidden">
            {/* Left Panel: File Explorer or Git Version Control */}
            {isLeftPanelOpen && (isWorkspaceSearchOpen ? <WorkspaceSearchPanel root={project.projectPath}
              hasDirtyFiles={tabs.some(tab => !!tab.isDirty)} onClose={() => setIsWorkspaceSearchOpen(false)}
              onSelect={async match => { await handleOpenFileByPath(match.path); setEditorLocation({ ...match, id: crypto.randomUUID() }); }} /> : (
              <LeftPanel onOpenProjectSettings={path => { setSettingsProjectPath(path); setIsProjectSettingsOpen(true); }}
                onSearchWorkspace={() => setIsWorkspaceSearchOpen(true)}
                hasDirtyFiles={tabs.some(t => t.isDirty)}
                onRepositoryChanged={() => { void refreshFileTree(); void refreshGitStatus(); }}
                logicalNavigator={logicalNavigator}
                onToggleNavigator={() => { const next = !logicalNavigator; setLogicalNavigator(next); (window as any).openfruitApi.readProjectTree(project.projectPath, next).then((result: any) => { if (result.success) setFileTree(result.tree); else reportError(result.error); }).catch((error: Error) => reportError(error.message)); }}
                files={fileTree}
                activeFilePath={tabs.find(t => t.id === activeTabId)?.path || null}
                onSelectFile={handleSelectFile}
                onContextMenu={handleContextMenuOpen}
                onNewFileRoot={() => handleNewFile()}
                onNewFolderRoot={() => handleNewFolder()}
                activeView={leftPanelView}
                onChangeView={setLeftPanelView}
                branch={currentBranch}
                projectName={project.name}
                stagedFiles={stagedFiles}
                unstagedFiles={unstagedFiles}
                diffs={diffs}
                commits={commits}
                onCommit={handleCommit}
                onStageFile={handleStageFile}
                onUnstageFile={handleUnstageFile}
                onStageAll={handleStageAll}
                onUnstageAll={handleUnstageAll}
                onDiscardFile={handleDiscardFile}
                onDiscardAll={handleDiscardAll}
                onPush={handlePush}
                onFetch={handleFetch}
                onOpenFileByPath={handleOpenFileByPath}
                onOpenDiffView={handleOpenDiffView}
                onOpenCommitComparison={handleOpenCommitComparison}
              />
            ))}

            {/* Center Panel: Code IDE Editor (Monaco Editor, Find/Replace Ctrl+F Ctrl+H) */}
            <React.Suspense fallback={<div className="flex-1 p-6 text-fruit-textMuted">{t("Caricamento editor…")}</div>}>
            <CenterPanel
              onTogglePinned={id=>setTabs(current=>current.map(t=>t.id===id?{...t,pinned:!t.pinned}:t).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)))}
              onReorderTab={(source,target)=>setTabs(current=>{const from=current.findIndex(t=>t.id===source),to=current.findIndex(t=>t.id===target);if(from<0||to<0||from===to)return current;const next=[...current],item=next.splice(from,1)[0];next.splice(to,0,item);return next;})}
              onNavigate={(path, line, column) => { void handleOpenFileByPath(path); setEditorLocation({id:crypto.randomUUID(),path,line,column}); }}
              editorLocation={editorLocation}
              preferences={preferences}
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
              onCloseTab={handleCloseTab}
              onContentChange={handleContentChange}
              conflict={activeTabId ? fileResolution.conflicts[activeTabId] : undefined}
              conflictBusy={!!(activeTabId && fileResolution.busy[activeTabId])}
              onMergeConflict={() => { if (activeTabId) fileResolution.autoMerge(activeTabId); }}
              onCompareConflict={() => { if (activeTabId) fileResolution.compare(activeTabId); }}
              onReloadConflict={() => { if (activeTabId) fileResolution.reload(activeTabId); }}
              onSaveConflictCopy={name => { if (activeTabId) fileResolution.saveCopy(activeTabId, name); }}
              projectName={project.name}
              projectPath={project.projectPath}
            />
            </React.Suspense>

            {/* Right Panel: Canvas App Preview (Collapsible independently) */}
            {isRightPanelOpen && (
              <RightPanel projectName={project.name} device={selectedDevice} isBuilding={isBuilding}
                canBuildPreview={engineCapabilities?.operations.build === 'implemented' && engineCapabilities?.operations.deploy === 'implemented'}
                onBuildPreview={() => handleRunBuild(true, true)} />
            )}
          </div>

          {/* Bottom Panel: Terminal, OpenFruit Build Output, Problems, Debug Console (Collapsible) */}
          {samePath(fileTree.path, project.projectPath || '') && <BottomPanel
            key={project.projectPath}
            isOpen={isBottomPanelOpen}
            onClose={() => setIsBottomPanelOpen(false)}
            logs={logs}
            onClearLogs={() => setLogs([])}
            projectName={project.name}
            projectPath={project.projectPath}
            problems={problems}
            onSelectProblem={handleSelectProblem}
          />}

          {isProjectSettingsOpen && <React.Suspense fallback={<div role="status" className="fixed inset-0 z-[10000] bg-fruit-bg p-8 text-fruit-text">{t("Caricamento configurazione...")}</div>}>
            <ProjectSettingsDialog initialProject={settingsProjectPath} key={project.projectPath + (settingsProjectPath || '')} root={project.projectPath} name={project.name}
              onClose={() => setIsProjectSettingsOpen(false)} onSaved={paths => {
                refreshFileTree(); refreshGitStatus();
                const current = workspaceRequests.current.ticket('settings-editors');
                for (const tab of tabs.filter(tab => !tab.isDirty && !tab.isDiff && paths.some(path => samePath(path, tab.path)))) {
                  (window as any).openfruitApi.readFileSnapshot(tab.path).then((snapshot: { content: string; revision: string }) => {
                    if (current()) setTabs(previous => previous.map(t => t.id === tab.id && t.path === tab.path && !t.isDirty && t.content === tab.content
                      ? { ...t, ...snapshot, baseContent: snapshot.content, unresolvedMerge: false } : t));
                  }).catch(reportError);
                }
              }} />
          </React.Suspense>}

          {fileResolution.comparisonId && tabs.find(tab => tab.id === fileResolution.comparisonId) && fileResolution.conflicts[fileResolution.comparisonId] && (
        <React.Suspense fallback={<div role="status" className="fixed inset-0 z-[10000] bg-fruit-bg p-8 text-fruit-text">{t("Caricamento confronto…")}</div>}>
          <FileConflictDialog key={fileResolution.comparisonId}
            tab={tabs.find(tab => tab.id === fileResolution.comparisonId)!}
            conflict={fileResolution.conflicts[fileResolution.comparisonId]}
            busy={!!fileResolution.busy[fileResolution.comparisonId]}
            onEdit={text => handleContentChange(fileResolution.comparisonId!, text)}
            onClose={fileResolution.closeComparison}
            onSave={() => fileResolution.saveReconciled(fileResolution.comparisonId!)} />
        </React.Suspense>
      )}

      {/* Context Menu for Files and Folders */}
          {contextMenu.isOpen && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              targetNode={contextMenu.targetNode}
              onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
              onNewFile={handleNewFile}
              onNewFolder={handleNewFolder}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreate={handleCreateProject}
        availableSdks={sdks}
      />

      {/* Clone Git Modal (D) */}
      <CloneGitModal
        isOpen={isCloneGitModalOpen}
        onClose={() => setIsCloneGitModalOpen(false)}
        onCloneSuccess={(clonedPath, clonedName) => {
          handleOpenProject({ path: clonedPath, name: clonedName });
        }}
      />

      {/* Command Palette / Quick Open (E) */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        initialMode={commandPalette.mode}
        onClose={() => setCommandPalette(prev => ({ ...prev, isOpen: false }))}
        fileTree={fileTree}
        onOpenFile={(file) => {
          handleSelectFile(file);
          setCommandPalette(prev => ({ ...prev, isOpen: false }));
        }}
        commands={paletteCommands}
      />

      {/* Settings Modal */}
      <SettingsModal
        preferences={preferences}
        onSavePreferences={savePreferences}
        devices={devices}
        onRefreshDevices={refreshDevicesFromOpenFruit}
        onEnvironmentChanged={snapshot => {
          setSdks(snapshot.sdks.map(sdk => ({ id: sdk.version, name: 'iOS', version: sdk.version, swiftVersion: '', size: '', status: 'installed' as const, path: sdk.path })));
          (window as any).openfruitApi?.getOpenFruitCapabilities().then(setEngineCapabilities).catch(reportError);
        }}
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* Inline Name Prompt Modal */}
      {inlinePrompt.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-fruit-overlay/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-96 bg-fruit-surface border border-fruit-border rounded-xl p-5 shadow-luxury">
            <h3 className="font-syne font-bold text-sm text-fruit-text mb-3">
              {inlinePrompt.title}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const val = (form.elements.namedItem('inputVal') as HTMLInputElement).value;
                Promise.resolve().then(() => inlinePrompt.onConfirm(val)).then(() => setInlinePrompt(prev => ({ ...prev, isOpen: false }))).catch(reportError);
              }}
            >
              <input
                name="inputVal"
                type="text"
                autoFocus
                defaultValue={inlinePrompt.defaultValue}
                className="w-full px-3 py-2 rounded-lg bg-fruit-bg border border-fruit-border focus:border-fruit-accent text-fruit-text font-mono text-xs outline-none mb-4"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInlinePrompt(prev => ({ ...prev, isOpen: false }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-syne text-fruit-textMuted hover:text-fruit-text"
                >
                  {t("Annulla")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-fruit-accent hover:bg-fruit-accentHover text-fruit-accentDark font-syne font-bold text-xs shadow-sm"
                >
                  {t("Conferma")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
