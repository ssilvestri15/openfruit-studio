import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('openfruitApi', {
  checkStudioUpdate: (refresh?: boolean): Promise<import('../shared/updates').StudioUpdateState> => ipcRenderer.invoke('check-studio-update', refresh),
  openStudioUpdate: (): Promise<void> => ipcRenderer.invoke('open-studio-update'),
  ptyOpen: (id: string, cwd: string, profile?: 'powershell' | 'cmd') => ipcRenderer.invoke('pty-open', { id, cwd, profile }),
  ptyWrite: (id: string, token: string, data: string) => ipcRenderer.invoke('pty-write', { id, token, data }),
  ptyResize: (id: string, token: string, cols: number, rows: number) => ipcRenderer.invoke('pty-resize', { id, token, cols, rows }),
  ptyAck: (id: string, token: string, count: number) => ipcRenderer.invoke('pty-ack', { id, token, count }),
  ptyClose: (id: string, token: string) => ipcRenderer.invoke('pty-close', { id, token }),
  onPtyOutput: (callback: (data: import('../shared/terminal').PtyOutput) => void) => {
    const handler = (_event: unknown, data: import('../shared/terminal').PtyOutput) => callback(data);
    ipcRenderer.on('pty-output', handler);
    return () => ipcRenderer.removeListener('pty-output', handler);
  },
  projectMetadata: (root:string) => ipcRenderer.invoke('project-metadata',root),
  readProjectSettings: (root: string) => ipcRenderer.invoke('read-project-settings', root),
  saveProjectSettings: (root: string, settings: import('../shared/projectSettings').ProjectSettings, revision: string | null) => ipcRenderer.invoke('save-project-settings', { root, settings, revision }),
  readXcodeProject: (project: string) => ipcRenderer.invoke('read-xcode-project', project),
  saveXcodeProject: (project: string, revision: string, edits: import('../shared/xcode').XcodeEdit[]) => ipcRenderer.invoke('save-xcode-project', { project, revision, edits }),
  resolveXcodeSettings: (project: string, ownerId: string, configurationId: string) => ipcRenderer.invoke('resolve-xcode-settings', {project,ownerId,configurationId}),
  mutateXcodeProject: (project: string, revision: string, operation: import('../shared/xcode').XcodeOperation) => ipcRenderer.invoke('mutate-xcode-project', { project, revision, operation }),
  revealPath: (file: string) => ipcRenderer.invoke('reveal-path', file),
  loadPreferences: () => ipcRenderer.invoke('load-preferences'),
  savePreferences: (value: import('../shared/preferences').Preferences) => ipcRenderer.invoke('save-preferences', value),
  onPreferencesChanged: (callback: (data: import('../shared/preferences').Preferences) => void) => {
    const handler = (_event: unknown, data: import('../shared/preferences').Preferences) => callback(data);
    ipcRenderer.on('preferences-changed', handler);
    return () => ipcRenderer.removeListener('preferences-changed', handler);
  },
  onWorkspaceChanged: (callback: (data: import('./workspaceEvents').WorkspaceChange) => void) => {
    const handler = (_event: unknown, data: import('./workspaceEvents').WorkspaceChange) => callback(data);
    ipcRenderer.on('workspace-changed', handler);
    return () => ipcRenderer.removeListener('workspace-changed', handler);
  },
  getEnvironment: (): Promise<import('../shared/environment').EnvironmentSnapshot> => ipcRenderer.invoke('environment-snapshot'),
  environmentAction: (action: import('../shared/environment').EnvironmentAction, value?: string) => ipcRenderer.invoke('environment-action', { action, value }),
  saveGitIdentity: (name: string, email: string) => ipcRenderer.invoke('git-save-identity', { name, email }),
  openHelp: (topic: 'docs' | 'news') => ipcRenderer.invoke('open-help', topic),
  searchWorkspace: (request: import('../shared/search').SearchRequest): Promise<import('../shared/search').SearchResult> => ipcRenderer.invoke('workspace-search', request),
  cancelWorkspaceSearch: () => ipcRenderer.invoke('cancel-workspace-search'),
  replaceWorkspaceMatches: (files: import('../shared/search').SearchReplacement[], replacement: string) => ipcRenderer.invoke('replace-workspace-matches', { files, replacement }),
  sessionKey: ipcRenderer.sendSync('get-session-key'),
  openNewWindow: () => ipcRenderer.invoke('open-new-window'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  setWindowSize: (width: number, height: number, center?: boolean) => ipcRenderer.invoke('window-set-size', { width, height, center }),
  resolveProjectEntrypoint: (path:string): Promise<{root:string;entrypoint?:string}> => ipcRenderer.invoke('resolve-project-entrypoint',path),
  takeLaunchProject: (): Promise<{root:string;entrypoint?:string}|null> => ipcRenderer.invoke('take-launch-project'),
  onNativeProjectOpened: (callback:(entry:{root:string;entrypoint?:string})=>void) => {const handler=(_event:unknown,entry:{root:string;entrypoint?:string})=>callback(entry);ipcRenderer.on('native-project-opened',handler);return ()=>ipcRenderer.removeListener('native-project-opened',handler);},
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  defaultProjectsDirectory: () => ipcRenderer.invoke('default-projects-directory'),
  closeWorkspace: () => ipcRenderer.invoke('close-workspace'),
  runOpenFruitCommand: (args: string[], cwd?: string, requestId?: string) => ipcRenderer.invoke('run-openfruit-command', args, cwd, requestId),
  cancelOpenFruitCommand: () => ipcRenderer.invoke('cancel-openfruit-command'),
  startPreview: (udid: string) => ipcRenderer.invoke('preview-start', udid),
  stopPreview: () => ipcRenderer.invoke('preview-stop'),
  onPreviewData: (callback: (chunk: Uint8Array) => void) => {
    const handler = (_event: unknown, chunk: Uint8Array) => callback(chunk);
    ipcRenderer.on('preview-data', handler);
    return () => ipcRenderer.removeListener('preview-data', handler);
  },
  onPreviewStatus: (callback: (line: string) => void) => {
    const handler = (_event: unknown, line: string) => callback(line);
    ipcRenderer.on('preview-status', handler);
    return () => ipcRenderer.removeListener('preview-status', handler);
  },
  onPreviewEnded: (callback: (data: { code: number | null }) => void) => {
    const handler = (_event: unknown, data: { code: number | null }) => callback(data);
    ipcRenderer.on('preview-ended', handler);
    return () => ipcRenderer.removeListener('preview-ended', handler);
  },
  getOpenFruitCapabilities: () => ipcRenderer.invoke('get-openfruit-capabilities'),
  onOpenFruitOutput: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => {
      for (const output of Array.isArray(data) ? data : [data]) callback(output);
    };
    ipcRenderer.on('openfruit-output', handler);
    return () => { ipcRenderer.removeListener('openfruit-output', handler); };
  },
  deviceAction: (request: import('../shared/device').DeviceRequest) => ipcRenderer.invoke('device-action',request),
  listOperationReports: (root:string) => ipcRenderer.invoke('list-operation-reports',root),
  readOperationReport: (id:string) => ipcRenderer.invoke('read-operation-report',id),
  exportOperationReport: (id:string) => ipcRenderer.invoke('export-operation-report',id),
  getDevices: () => ipcRenderer.invoke('get-devices'),
  readProjectTree: (folderPath: string, logical = false) => ipcRenderer.invoke('read-project-tree', folderPath, logical),
  createProjectScaffold: (config: any) => ipcRenderer.invoke('create-project-scaffold', config),
  loadRecentProjects: () => ipcRenderer.invoke('load-recent-projects'),
  saveRecentProjects: (projects: any[]) => ipcRenderer.invoke('save-recent-projects', projects),
  saveSessionState: (data: any) => ipcRenderer.invoke('save-session-state', data),
  loadSessionState: () => ipcRenderer.invoke('load-session-state'),
  clearSessionState: () => ipcRenderer.invoke('clear-session-state'),
  saveFileAs: (name:string,content:string,blockedPaths:string[],originalPath?:string,expectedRevision?:string): Promise<(import('../shared/files').FileSnapshot & {path:string}) | null> => ipcRenderer.invoke('save-file-as',{name,content,blockedPaths,originalPath,expectedRevision}),
  saveFile: (filePath: string, content: string, expectedRevision?: string): Promise<import('../shared/files').SaveFileResult> => ipcRenderer.invoke('save-file', { filePath, content, expectedRevision }),
  mergeFile: (filePath: string, base: string, revision: string, local: string) => ipcRenderer.invoke('merge-file', { filePath, base, revision, local }),
  readDocument: (file:string): Promise<import('../shared/documents').DocumentContent> => ipcRenderer.invoke('read-document',file),
  gitCommitFiles: (repoPath:string,hash:string,parentIndex=0): Promise<import('../shared/documents').CommitDetails> => ipcRenderer.invoke('git-commit-files',{repoPath,hash,parentIndex}),
  gitCommitComparison: (repoPath:string,hash:string,parentIndex:number,filename:string): Promise<import('../shared/documents').CommitComparison> => ipcRenderer.invoke('git-commit-comparison',{repoPath,hash,parentIndex,filename}),
  readFileSnapshot: (filePath: string): Promise<import('../shared/files').FileSnapshot> => ipcRenderer.invoke('read-file-snapshot', filePath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),

  // Real File System Operations
  createFile: (filePath: string, content?: string) => ipcRenderer.invoke('create-file', { filePath, content }),
  createDirectory: (dirPath: string) => ipcRenderer.invoke('create-directory', dirPath),
  renamePath: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-path', { oldPath, newPath }),
  deletePath: (targetPath: string) => ipcRenderer.invoke('delete-path', targetPath),

  // Real Git Operations
  repositoryInfo: (repoPath: string): Promise<import('../shared/git').RepositoryInfo> => ipcRenderer.invoke('git-repository-info',repoPath),
  repositoryAction: (repoPath: string, action: import('../shared/git').RepositoryAction): Promise<import('../shared/git').GitOperationResult> => ipcRenderer.invoke('git-repository-action',{repoPath,action}),
  repositoryHistory: (repoPath: string, skip: number) => ipcRenderer.invoke('git-repository-history',{repoPath,skip}),
  repositoryCommit: (repoPath: string, hash: string): Promise<string> => ipcRenderer.invoke('git-repository-commit',{repoPath,hash}),
  gitFileHunks: (repoPath:string,filename:string,staged:boolean) => ipcRenderer.invoke('git-file-hunks',{repoPath,filename,staged}),
  gitApplyHunks: (repoPath:string,filename:string,staged:boolean,revision:string,indices:number[],discard=false) => ipcRenderer.invoke('git-apply-hunks',{repoPath,filename,staged,revision,indices,discard}),
  gitFileComparison: (repoPath:string,filename:string,staged:boolean) => ipcRenderer.invoke('git-file-comparison',{repoPath,filename,staged}),
  gitGetStatus: (repoPath: string) => ipcRenderer.invoke('git-get-status', repoPath),
  gitStageFile: (repoPath: string, filename: string) => ipcRenderer.invoke('git-stage-file', { repoPath, filename }),
  gitUnstageFile: (repoPath: string, filename: string) => ipcRenderer.invoke('git-unstage-file', { repoPath, filename }),
  gitStageAll: (repoPath: string) => ipcRenderer.invoke('git-stage-all', repoPath),
  gitUnstageAll: (repoPath: string) => ipcRenderer.invoke('git-unstage-all', repoPath),
  gitDiscardFile: (repoPath: string, filename: string, isUntracked?: boolean) => ipcRenderer.invoke('git-discard-file', { repoPath, filename, isUntracked }),
  gitDiscardAll: (repoPath: string) => ipcRenderer.invoke('git-discard-all', repoPath),
  gitCommit: (repoPath: string, message: string) => ipcRenderer.invoke('git-commit', { repoPath, message }),
  gitPush: (repoPath: string): Promise<import('../shared/git').GitOperationResult> => ipcRenderer.invoke('git-push', repoPath),
  gitFetch: (repoPath: string): Promise<import('../shared/git').GitOperationResult> => ipcRenderer.invoke('git-fetch', repoPath),
  gitClone: (repoUrl: string, targetDir: string): Promise<import('../shared/git').GitOperationResult> => ipcRenderer.invoke('git-clone', { repoUrl, targetDir }),
  cancelGitOperation: (operation: import('../shared/git').GitOperation): Promise<boolean> => ipcRenderer.invoke('cancel-git-operation', operation),
  gitGetFileAtHead: (repoPath: string, filename: string) => ipcRenderer.invoke('git-get-file-at-head', { repoPath, filename }),
  runTerminalCommand: (cwd: string, command: string, terminalId = 'term-1'): Promise<import('./terminal').TerminalResult> => ipcRenderer.invoke('run-terminal-command', { cwd, command, terminalId }),
  closeTerminal: (terminalId: string) => ipcRenderer.invoke('close-terminal', terminalId),

  // Real SourceKit-LSP
  lspInit: (rootPath: string) => ipcRenderer.invoke('lsp-init', rootPath),
  lspCloseDocument: (uri: string) => ipcRenderer.invoke('lsp-close-document', uri),
  lspStop: () => ipcRenderer.invoke('lsp-stop'),
  lspOpenDocument: (uri: string, text: string) => ipcRenderer.invoke('lsp-open-document', { uri, text }),
  lspChangeDocument: (uri: string, text: string) => ipcRenderer.invoke('lsp-change-document', { uri, text }),
  lspCompletion: (uri: string, line: number, character: number) => ipcRenderer.invoke('lsp-completion', { uri, line, character }),
  lspSemantic: (request: {method:string;uri:string;line?:number;character?:number;newName?:string;options?:{tabSize:number;insertSpaces:boolean}}) => ipcRenderer.invoke('lsp-semantic',request),
  lspHover: (uri: string, line: number, character: number) => ipcRenderer.invoke('lsp-hover', { uri, line, character }),
  onLspDiagnostics: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('lsp-publish-diagnostics', handler);
    return () => { ipcRenderer.removeListener('lsp-publish-diagnostics', handler); };
  }
});
