export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  packageType?: 'xcodeproject';
  logical?: boolean;
  referenceId?: string;
  projectPath?: string;
  warning?: string;
  extension?: string;
  children?: FileNode[];
  content?: string;
}

export interface ProjectConfig {
  name: string;
  bundleId: string;
  organization: string;
  minIosVersion: string;
  sdkVersion: string;
  language: string;
  interfaceType: string;
  projectPath: string;
  gitInit: boolean;
  template?: 'xcode' | 'swift-package';
}

export interface SdkItem {
  id: string;
  name: string;
  version: string;
  swiftVersion: string;
  size: string;
  status: 'installed' | 'available';
  path?: string;
}

export interface GitCommit {
  hash: string;
  author: string;
  message: string;
  date: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'normal';
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export interface GitFileStatus {
  filename: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  isStaged: boolean;
}

export interface GitDiffItem {
  filename: string;
  isStaged?: boolean;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  diffLines: DiffLine[];
}

export interface OpenFruitDevice {
  name: string;
  udid: string;
  type: 'usb' | 'network';
  iosVersion: string;
  model: string;
  connected: boolean;
}

export interface TabItem {
  document?: import('../shared/documents').DocumentContent;
  commitComparison?: import('../shared/documents').CommitComparison;
  revision?: string;
  baseContent?: string;
  unresolvedMerge?: boolean;
  id: string;
  name: string;
  path: string;
  content: string;
  isDirty?: boolean;
  isDiff?: boolean;
  pinned?: boolean;
  originalContent?: string;
}

export interface ProblemItem {
  source?: 'build' | 'lsp';
  id: string;
  filePath: string;
  fileName: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  line: number;
  column: number;
}

export interface TerminalTab {
  cwd?: string;
  id: string;
  name: string;
  history: Array<{ id: string; command?: string; output?: string; isError?: boolean; cwd?: string }>;
  isRunning?: boolean;
}

export interface LogLine {
  event?: import('../electron/openfruit').EngineEvent;
  id: string;
  text: string;
  type: 'stdout' | 'stderr' | 'success' | 'command' | 'system';
  timestamp?: string;
}

export interface EditorLocation { id: string; path: string; line: number; column: number; endLine?: number; endColumn?: number }

export interface RecentProject {name:string;path:string;framework:string;branch:string;lastModified:string;bundleId:string}
