import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Content-Length counts bytes, not UTF-16 characters or decoded string length.
export class LspReader {
  private buffer = Buffer.alloc(0);
  constructor(private consume: (message: any) => void) {}
  write(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const end = this.buffer.indexOf('\r\n\r\n');
      if (end === -1) {
        if (this.buffer.length > 8192) throw new Error('Invalid LSP header');
        return;
      }
      const match = this.buffer.subarray(0, end).toString('ascii').match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
      const length = match ? Number(match[1]) : NaN;
      if (!Number.isSafeInteger(length) || length < 0 || length > 16 * 1024 * 1024) throw new Error('Invalid LSP Content-Length');
      if (this.buffer.length < end + 4 + length) return;
      const body = this.buffer.subarray(end + 4, end + 4 + length);
      this.buffer = this.buffer.subarray(end + 4 + length);
      this.consume(JSON.parse(body.toString('utf8')));
    }
  }
}

export class LspManager {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (result: any) => void; timer: ReturnType<typeof setTimeout> }>();
  private documents = new Map<string, number>();
  private ready: Promise<boolean> = Promise.resolve(false);
  private root?: string;
  constructor(private binary: () => string | null, private diagnostics: (params: any) => void) {}

  start(root: string): Promise<boolean> {
    if (this.proc && this.root === root) return this.ready;
    this.stop();
    this.root = root;
    const binary = this.binary();
    if (!binary) return this.ready = Promise.resolve(false);
    const proc = spawn(binary, [], { windowsHide: true });
    this.proc = proc;
    const reader = new LspReader(message => {
      if (this.proc !== proc) return;
      if (message.id !== undefined && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)!;
        clearTimeout(pending.timer); this.pending.delete(message.id); pending.resolve(message);
      } else if (message.method === 'textDocument/publishDiagnostics') this.diagnostics(message.params);
      else if (message.id !== undefined && message.method) {
        // Server requests must always receive a response, even if unsupported.
        this.write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not supported' } });
      }
    });
    proc.stdout.on('data', chunk => { try { reader.write(chunk); } catch { this.stop(); } });
    proc.stderr.resume();
    proc.stdin.on('error', () => { if (this.proc === proc) this.stop(); });
    proc.once('error', () => { if (this.proc === proc) this.stop(); });
    proc.once('close', () => { if (this.proc === proc) this.stop(); });
    this.ready = this.rawRequest('initialize', {
      processId: process.pid, rootUri: pathToFileURL(root).href,
      capabilities: { textDocument: {
        completion: { completionItem: { snippetSupport: true } },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        publishDiagnostics: { relatedInformation: true }
      } }
    }, 15000).then(response => {
      if (this.proc !== proc) return false;
      if (!response?.result || response.error) { this.stop(); return false; }
      this.notify('initialized', {});
      return true;
    });
    return this.ready;
  }

  stop() {
    const proc = this.proc; this.proc = null;
    this.ready = Promise.resolve(false);
    this.documents.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.resolve(null); }
    this.pending.clear();
    proc?.kill();
  }

  private write(message: any) {
    if (!this.proc?.stdin.writable) return;
    const body = JSON.stringify(message);
    this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }
  private notify(method: string, params: any) { this.write({ jsonrpc: '2.0', method, params }); }
  private rawRequest(method: string, params: any, timeout = 2500): Promise<any> {
    if (!this.proc) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve(null); }, timeout);
      this.pending.set(id, { resolve, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }
  async request(method: string, params: any) {
    const proc = this.proc;
    if (!await this.ready || this.proc !== proc) return null;
    return this.rawRequest(method, params);
  }
  async openDocument(uri: string, text: string): Promise<void> {
    const proc = this.proc;
    if (!uri.endsWith('.swift') || !await this.ready || this.proc !== proc) return;
    if (this.documents.has(uri)) return this.changeDocument(uri, text);
    this.documents.set(uri, 1);
    this.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'swift', version: 1, text } });
  }
  async changeDocument(uri: string, text: string): Promise<void> {
    const proc = this.proc;
    if (!uri.endsWith('.swift') || !await this.ready || this.proc !== proc) return;
    if (!this.documents.has(uri)) return this.openDocument(uri, text);
    const version = this.documents.get(uri)! + 1;
    this.documents.set(uri, version);
    this.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] });
  }
  async closeDocument(uri: string) {
    if (!this.documents.delete(uri)) return;
    this.notify('textDocument/didClose', { textDocument: { uri } });
  }
}
