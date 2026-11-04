export type PtyOutput = { id: string; token: string } & ({ data: string } | { exitCode: number });
export interface PtyBridge {
  ptyOpen(id: string, cwd: string, profile?: 'powershell' | 'cmd'): Promise<string>;
  ptyWrite(id: string, token: string, data: string): Promise<void>;
  ptyResize(id: string, token: string, cols: number, rows: number): Promise<void>;
  ptyAck(id: string, token: string, count: number): Promise<void>;
  ptyClose(id: string, token: string): Promise<void>;
  onPtyOutput(callback: (event: PtyOutput) => void): () => void;
}
