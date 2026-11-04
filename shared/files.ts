export interface FileSnapshot {
  content: string;
  revision: string;
}
export interface SaveFileResult {
  success: boolean;
  revision?: string;
  conflict?: boolean;
  disk?: FileSnapshot;
  error?: string;
}

export interface FileConflict {
  disk: FileSnapshot | null;
  message: string;
}
export interface FileBridge {
  mergeFile(filePath: string, base: string, revision: string, local: string): Promise<MergeResult>;
  readFileSnapshot(filePath: string): Promise<FileSnapshot>;
  saveFile(filePath: string, content: string, expectedRevision?: string): Promise<SaveFileResult>;
  createFile(filePath: string, content: string): Promise<{ success: boolean; filePath?: string; error?: string }>;
}
export interface MergeResult { content: string; conflicts: number; disk: FileSnapshot }
