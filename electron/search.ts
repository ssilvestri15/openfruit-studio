import { Worker } from 'node:worker_threads';

import fs from 'node:fs';
import { readSnapshot, saveSnapshot } from './fileStore';
import type { SearchRequest, SearchResult, SearchReplacement } from '../shared/search';

// Executed in an isolated worker. RegExp backtracking can never block Electron's UI.
function workerSearch() {
  const { parentPort, workerData } = require('node:worker_threads');
  const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
  const request = workerData;
  const pattern = request.regex ? request.query : request.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(request.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])` : pattern, request.caseSensitive ? 'gu' : 'giu');
  const ignored = new Set(['.git', '.build', 'node_modules', 'build', 'dist', 'dist-electron', 'DerivedData', '.openfruit_cache', '.xcodeproj', '.xcworkspace']);
  const matches: any[] = []; let scanned = 0, visited = 0, truncated = false;
  const root = fs.realpathSync(request.root), limit = Math.min(request.limit || 1000, 5000);
  const inside = (file: string) => { const rel = path.relative(root, fs.realpathSync(file)); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
  const scan = (directory: string, depth: number) => {
    if (depth > 100 || visited > 50000 || matches.length >= limit) { truncated = true; return; }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++visited > 50000 || matches.length >= limit) { truncated = true; return; }
      if (entry.isSymbolicLink() || ignored.has(entry.name) || /\.(?:xcodeproj|xcworkspace)$/i.test(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (!inside(file)) continue;
      if (entry.isDirectory()) { scan(file, depth + 1); continue; }
      if (!entry.isFile()) continue;
      let content: string;
      try {
        const stat = fs.statSync(file); if (stat.size > 2097152) continue;
        const handle = fs.openSync(file, 'r'), buffer = Buffer.alloc(Math.min(stat.size + 1, 2097153)); let size = 0;
        try { while (size < buffer.length) { const count = fs.readSync(handle, buffer, size, buffer.length - size, size); if (!count) break; size += count; } } finally { fs.closeSync(handle); }
        if (size > 2097152 || buffer.subarray(0, size).includes(0)) continue;
        content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, size));
      } catch { continue; }
      scanned++;
      const revision = crypto.createHash('sha256').update(content).digest('hex'); regex.lastIndex = 0;
      let found: RegExpExecArray | null, offset = 0, line = 1;
      while ((found = regex.exec(content))) {
        while (offset < found.index) { if (content[offset++] === '\n') line++; }
        const lineStart = content.lastIndexOf('\n', found.index - 1) + 1;
        const lineEnd = content.indexOf('\n', found.index);
        matches.push({ path: file, line, column: found.index - lineStart + 1, endColumn: found.index - lineStart + found[0].length + 1,
          start: found.index, end: found.index + found[0].length, text: content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd).slice(0, 500), revision });
        if (matches.length >= limit) { truncated = true; break; }
        if (!found[0].length) regex.lastIndex += content.codePointAt(regex.lastIndex)! > 0xffff ? 2 : 1;
      }
    }
  };
  scan(root, 0); parentPort.postMessage({ matches, scanned, truncated });
}
export class WorkspaceSearch {
  private jobs = new Map<number, { worker: Worker; cancel: () => void }>();
  search(owner: number, request: SearchRequest): Promise<SearchResult> {
    if (!request || typeof request.query !== 'string' || !request.query || request.query.length > 1000 || typeof request.root !== 'string') throw new Error('Ricerca non valida');
    for (const key of ['regex', 'caseSensitive', 'wholeWord'] as const) if (request[key] !== undefined && typeof request[key] !== 'boolean') throw new Error('Opzioni di ricerca non valide');
    if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 5000)) throw new Error('Limite di ricerca non valido');
    this.cancel(owner);
    const root = fs.realpathSync(request.root);
    return new Promise((resolve, reject) => {
      const worker = new Worker(`(${workerSearch.toString()})();`, { eval: true, workerData: { ...request, root }, resourceLimits: { maxOldGenerationSizeMb: 96 } });
      let done = false;
      const finish = (error?: Error, result?: SearchResult) => {
        if (done) return; done = true; clearTimeout(timeout);
        if (this.jobs.get(owner)?.worker === worker) this.jobs.delete(owner);
        void worker.terminate(); if (error) reject(error); else resolve(result!);
      };
      const timeout = setTimeout(() => finish(new Error('Ricerca interrotta dopo 15 secondi: restringi il percorso o semplifica la regex')), 15000);
      this.jobs.set(owner, { worker, cancel: () => finish(new Error('Ricerca annullata')) });
      worker.once('message', data => finish(undefined, data)); worker.once('error', error => finish(error));
      worker.once('exit', code => { if (!done) finish(new Error(`Ricerca terminata senza risultati (${code})`)); });
    });
  }
  cancel(owner: number) { this.jobs.get(owner)?.cancel(); }
  closeAll() { for (const owner of this.jobs.keys()) this.cancel(owner); }
}
export async function replaceSearchResults(files: SearchReplacement[], replacement: string, authorize: (file: string) => string) {
  if (!Array.isArray(files) || files.length > 1000 || typeof replacement !== 'string' || replacement.length > 100000) throw new Error('Sostituzione non valida');
  const snapshots = await Promise.all(files.map(async file => {
    const target = authorize(file.path), snapshot = await readSnapshot(target);
    if (snapshot.revision !== file.revision) throw new Error('File modificato: ripeti la ricerca prima di sostituire');
    if (!Array.isArray(file.matches) || file.matches.length > 5000) throw new Error('Intervalli non validi');
    let end = -1;
    for (const match of [...file.matches].sort((a, b) => a.start - b.start)) {
      if (!Number.isInteger(match.start) || !Number.isInteger(match.end) || match.start < end || match.start < 0 || match.end < match.start || match.end > snapshot.content.length) throw new Error('Intervalli di sostituzione non validi');
      end = match.end;
    }
    let content = snapshot.content;
    for (const match of [...file.matches].sort((a, b) => b.start - a.start)) content = content.slice(0, match.start) + replacement + content.slice(match.end);
    return { target, snapshot, content };
  }));
  if (new Set(snapshots.map(file => file.target.toLowerCase())).size !== snapshots.length) throw new Error('File duplicato');
  const completed: string[] = [];
  for (const file of snapshots) {
    const result = await saveSnapshot(file.target, file.content, file.snapshot.revision, () => { authorize(file.target); });
    if (!result.success) throw new Error(`${result.error}. File già salvati: ${completed.join(', ') || 'nessuno'}`);
    completed.push(file.target);
  }
  return completed;
}
